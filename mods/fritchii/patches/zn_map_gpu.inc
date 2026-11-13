/* Included by the pinned KaeGae draw.c to share its presentation queue and device.
 *
 * One 1024x1024 texture, created once in module memory (~5 MiB pool) and partitioned into:
 *   y = [0..767]    map viewport region (rewritten only when viewport/zone changes)
 *   y = [768..1023] icon atlas strip (uploaded once via kae_map_upload_atlas)
 * Up to ZN_GPU_MAX_BLITS (64) Texture-to-Texture copies can be queued per frame.
 */
typedef struct { int x, y, z, width, height, depth; } zn_region;
typedef struct { zn_region src, dst; } zn_blit_cmd;

static struct {
    void (*defaults)(nvn_object *);
    void (*device)(nvn_object *, nvn_device *);
    void (*target)(nvn_object *, int);
    void (*format)(nvn_object *, int);
    void (*size)(nvn_object *, int, int);
    void (*levels)(nvn_object *, int);
    size_t (*storage_size)(const nvn_object *);
    size_t (*storage_alignment)(const nvn_object *);
    void (*storage)(nvn_object *, nvn_object *, ptrdiff_t);
    bool (*init)(nvn_object *, const nvn_object *);
    int (*get_format)(const nvn_texture *);
    void (*write)(const nvn_object *, const void *, const zn_region *, const void *);
    void (*flush)(const nvn_object *, const void *, const zn_region *);
    void (*copy)(nvn_object *, const nvn_object *, const void *, const zn_region *,
                 nvn_texture *, const void *, const zn_region *, int);
} zn_nvn;

enum {
    ZN_TEXTURE_MEMORY = 0x500000,      /* 5 MiB: a 1024 x 1024 picture is 4 MiB, plus NVN padding */
    ZN_TEXTURE_ALIGNMENT = 0x10000,    /* the strictest alignment NVN asks of texture storage */
    ZN_COPY_LINEAR = 0x1, ZN_COPY_2D = 0x2,
    ZN_GPU_TEX_SIZE = 1024,
    ZN_GPU_MAP_MAX_H = 768,
    ZN_GPU_ATLAS_Y = 768,
    ZN_GPU_ATLAS_H = 256,
    ZN_GPU_MAX_BLITS = 64,
};
static nvn_object zn_map_pool, zn_map_texture;
static nvn_queue *zn_map_queue;
static nvn_texture *zn_map_target;
static zn_blit_cmd zn_blits[ZN_GPU_MAX_BLITS];
static int zn_blit_count;
static bool zn_map_pending, zn_atlas_ready, zn_map_api_tried, zn_map_api_ok, zn_map_pool_ready, zn_map_texture_ready;
static uint32_t zn_map_id;
static int zn_map_format, zn_map_width, zn_map_height;
static _Alignas(64) uint32_t zn_map_reordered[1024 * 1024];
static uint8_t zn_map_storage_raw[ZN_TEXTURE_MEMORY + ZN_TEXTURE_ALIGNMENT];
static uint8_t *zn_map_storage;

static bool zn_load_map_api(void) {
    if (zn_map_api_tried) return zn_map_api_ok;
    zn_map_api_tried = true;
    static const char *const names[] = {
        "nvnTextureBuilderSetDefaults", "nvnTextureBuilderSetDevice", "nvnTextureBuilderSetTarget",
        "nvnTextureBuilderSetFormat", "nvnTextureBuilderSetSize2D", "nvnTextureBuilderSetLevels",
        "nvnTextureBuilderGetStorageSize", "nvnTextureBuilderGetStorageAlignment",
        "nvnTextureBuilderSetStorage", "nvnTextureInitialize", "nvnTextureGetFormat",
        "nvnTextureWriteTexels", "nvnTextureFlushTexels", "nvnCommandBufferCopyTextureToTexture",
    };
    _Static_assert(sizeof zn_nvn == sizeof names, "map NVN table");
    void **functions = (void **)&zn_nvn;
    for (size_t i = 0; i < sizeof names / sizeof names[0]; ++i) {
        functions[i] = real_getproc(device, names[i]);
        if (!functions[i]) {
            kp_log("map texture: missing NVN function");
            kp_log(names[i]);
            return false;
        }
    }
    zn_map_api_ok = true;
    return true;
}

static bool zn_prepare_map_pool(void) {
    if (zn_map_pool_ready) return true;
    static bool tried;
    if (tried) return false;
    tried = true;
    /* Module memory, page aligned by hand: the linker cannot promise more than 8 KiB */
    uintptr_t base = (uintptr_t)zn_map_storage_raw;
    zn_map_storage = (uint8_t *)((base + ZN_TEXTURE_ALIGNMENT - 1) & ~(uintptr_t)(ZN_TEXTURE_ALIGNMENT - 1));
    nvn_object builder;
    nvn.pool_builder_defaults(&builder);
    nvn.pool_builder_device(&builder, device);
    nvn.pool_builder_flags(&builder, POOL_CPU_UNCACHED | POOL_GPU_CACHED);
    nvn.pool_builder_storage(&builder, zn_map_storage, ZN_TEXTURE_MEMORY);
    zn_map_pool_ready = nvn.pool_init(&zn_map_pool, &builder);
    if (!zn_map_pool_ready) kp_log("map texture: nvnMemoryPoolInitialize failed");
    return zn_map_pool_ready;
}

static bool zn_ensure_texture(int width, int height, int format) {
    if (zn_map_texture_ready) {
        if (format != zn_map_format || width != zn_map_width || height != zn_map_height) {
            static bool logged;
            if (!logged) kp_log_hex("map texture: picture changed shape, format", (uint64_t)format);
            logged = true;
            return false;
        }
        return true;
    }
    nvn_object builder;
    zn_nvn.defaults(&builder);
    zn_nvn.device(&builder, device);
    zn_nvn.target(&builder, 1); /* NVN_TEXTURE_TARGET_2D */
    zn_nvn.format(&builder, format);
    zn_nvn.size(&builder, width, height);
    zn_nvn.levels(&builder, 1);
    size_t needed = zn_nvn.storage_size(&builder);
    size_t align = zn_nvn.storage_alignment(&builder);
    if (needed > ZN_TEXTURE_MEMORY || align > ZN_TEXTURE_ALIGNMENT) {
        static bool logged;
        if (!logged) {
            kp_log_hex("map texture: pool too small, storage size", (uint64_t)needed);
            kp_log_hex("map texture: pool too small, alignment", (uint64_t)align);
        }
        logged = true;
        return false;
    }
    if (!zn_prepare_map_pool()) return false;
    zn_nvn.storage(&builder, &zn_map_pool, 0);
    if (!zn_nvn.init(&zn_map_texture, &builder)) {
        kp_log("map texture: nvnTextureInitialize failed");
        return false;
    }
    zn_map_texture_ready = true;
    zn_map_format = format;
    zn_map_width = width;
    zn_map_height = height;
    kp_log_hex("map texture: created, format", (uint64_t)format);
    return true;
}

static void zn_write_region(int ox, int oy, int width, int height, int format, const uint8_t *rgba) {
    bool swap = format == 0x9a || format == 0x9c;
    bool ten_bit = format == 0x3d;
    const void *data = rgba;
    if (lower_left || swap || ten_bit) {
        for (int y = 0; y < height; ++y) {
            const uint8_t *row = rgba + (size_t)(lower_left ? height - y - 1 : y) * width * 4;
            for (int x = 0; x < width; ++x) {
                uint32_t r = row[x * 4], g = row[x * 4 + 1], b = row[x * 4 + 2];
                uint32_t a = row[x * 4 + 3];
                if (swap) { uint32_t temp = r; r = b; b = temp; }
                uint32_t texel = ten_bit
                    ? (r * 1023 / 255) | ((g * 1023 / 255) << 10) | ((b * 1023 / 255) << 20) | ((a * 3 / 255) << 30)
                    : r | (g << 8) | (b << 16) | (a << 24);
                zn_map_reordered[(size_t)y * width + x] = texel;
            }
        }
        data = zn_map_reordered;
    }
    const zn_region region = {ox, lower_left ? zn_map_height - oy - height : oy, 0, width, height, 1};
    zn_nvn.write(&zn_map_texture, 0, &region, data);
    zn_nvn.flush(&zn_map_texture, 0, &region);
}

static bool zn_write_map(uint32_t id, int width, int height, int format, const uint8_t *rgba) {
    if (zn_map_texture_ready && zn_map_width == ZN_GPU_TEX_SIZE && zn_map_height == ZN_GPU_TEX_SIZE) {
        if (width > ZN_GPU_TEX_SIZE || height > ZN_GPU_MAP_MAX_H || format != zn_map_format) return false;
        zn_write_region(0, 0, width, height, format, rgba);
        zn_map_id = id;
        return true;
    }
    if (!zn_ensure_texture(width, height, format)) return false;
    zn_write_region(0, 0, width, height, format, rgba);
    zn_map_id = id;
    return true;
}

static int zn_present_format(void) {
    int format = zn_nvn.get_format(zn_map_target);
    if (format != 0x25 && format != 0x38 && format != 0x9a && format != 0x9c && format != 0x3d) {
        static bool logged;
        if (!logged) kp_log_hex("map texture: unsupported present format", (uint64_t)format);
        logged = true;
        return -1;
    }
    return format;
}

int kae_map_upload_atlas(const uint8_t *rgba, int width, int height) {
    if (!in_draw || !zn_map_target || !rgba || width <= 0 || width > ZN_GPU_TEX_SIZE ||
        height <= 0 || height > ZN_GPU_ATLAS_H || !zn_load_map_api()) return 0;
    int format = zn_present_format();
    if (format < 0) return 0;
    if (!zn_ensure_texture(ZN_GPU_TEX_SIZE, ZN_GPU_TEX_SIZE, format)) return 0;
    zn_write_region(0, ZN_GPU_ATLAS_Y, width, height, format, rgba);
    zn_atlas_ready = true;
    return 1;
}

int kae_map_blit(uint32_t id, int width, int height, const uint8_t *rgba,
                 int sx, int sy, int sw, int sh, int dx, int dy, int dw, int dh) {
    if (!in_draw || !zn_map_target || !rgba || width <= 0 || height <= 0 ||
        width > ZN_GPU_TEX_SIZE || height > ZN_GPU_TEX_SIZE || sx < 0 || sy < 0 || sw <= 0 || sh <= 0 ||
        sw > width - sx || sh > height - sy || dx < 0 || dy < 0 || dw <= 0 || dh <= 0 ||
        dw > frame_width - dx || dh > frame_height - dy || !zn_load_map_api()) return 0;
    if (!zn_map_pending) zn_blit_count = 0;
    if (zn_blit_count >= ZN_GPU_MAX_BLITS) return 0;
    int format = zn_present_format();
    if (format < 0) return 0;
    if (zn_map_id != id || !zn_map_texture_ready) {
        if (!zn_write_map(id, width, height, format, rgba)) return 0;
    }

    zn_blits[zn_blit_count++] = (zn_blit_cmd){
        .src = (zn_region){sx, lower_left ? zn_map_height - sy - sh : sy, 0, sw, sh, 1},
        .dst = (zn_region){dx, lower_left ? frame_height - dy - dh : dy, 0, dw, dh, 1},
    };
    zn_map_pending = true;
    return 1;
}

int kae_map_blit_atlas(int sx, int sy, int sw, int sh, int dx, int dy) {
    if (!in_draw || !zn_map_target || !zn_map_texture_ready || !zn_atlas_ready ||
        sx < 0 || sy < 0 || sw <= 0 || sh <= 0 ||
        sx + sw > zn_map_width || sy + sh > ZN_GPU_ATLAS_H ||
        dx < 0 || dy < 0 || dx + sw > frame_width || dy + sh > frame_height) return 0;
    if (!zn_map_pending) zn_blit_count = 0;
    if (zn_blit_count >= ZN_GPU_MAX_BLITS) return 0;

    int tex_sy = ZN_GPU_ATLAS_Y + sy;
    zn_blits[zn_blit_count++] = (zn_blit_cmd){
        .src = (zn_region){sx, lower_left ? zn_map_height - tex_sy - sh : tex_sy, 0, sw, sh, 1},
        .dst = (zn_region){dx, lower_left ? frame_height - dy - sh : dy, 0, sw, sh, 1},
    };
    zn_map_pending = true;
    return 1;
}

static void zn_record_map_copy(void) {
    if (!zn_map_pending) {
        zn_blit_count = 0;
        return;
    }
    for (int i = 0; i < zn_blit_count; ++i) {
        const zn_blit_cmd *c = &zn_blits[i];
        bool scaled = c->src.width != c->dst.width || c->src.height != c->dst.height;
        int flags = scaled ? (ZN_COPY_LINEAR | ZN_COPY_2D) : 0;
        zn_nvn.copy(&commands, &zn_map_texture, 0, &c->src, zn_map_target, 0, &c->dst, flags);
    }
    zn_blit_count = 0;
}
