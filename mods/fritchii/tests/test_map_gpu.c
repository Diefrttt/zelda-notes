#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct { int unused; } nvn_object, nvn_device, nvn_queue, nvn_texture;
static nvn_device *device;
static nvn_object commands;
static bool lower_left = true, in_draw = true;
static int frame_width = 1280, frame_height = 720;
static void *(*real_getproc)(nvn_device *, const char *);
enum { POOL_CPU_UNCACHED = 2, POOL_GPU_CACHED = 32 };
static struct {
    void (*pool_builder_defaults)(nvn_object *);
    void (*pool_builder_device)(nvn_object *, nvn_device *);
    void (*pool_builder_flags)(nvn_object *, int);
    void (*pool_builder_storage)(nvn_object *, void *, size_t);
    bool (*pool_init)(nvn_object *, const nvn_object *);
} nvn;

static void kp_log(const char *text) { (void)text; }
static void kp_log_hex(const char *text, uint64_t value) { (void)text; (void)value; }
#include "../patches/zn_map_gpu.inc"

static unsigned uploads, copies, creates, last_flags;

static void pool_defaults(nvn_object *object) { (void)object; }
static void pool_device(nvn_object *object, nvn_device *value) { (void)object; (void)value; }
static void pool_flags(nvn_object *object, int flags) {
    (void)object;
    assert(flags == (POOL_CPU_UNCACHED | POOL_GPU_CACHED));
}
static void pool_storage(nvn_object *object, void *memory, size_t size) {
    assert(object && memory == zn_map_storage && size == ZN_TEXTURE_MEMORY);
    assert(((uintptr_t)memory & (ZN_TEXTURE_ALIGNMENT - 1)) == 0);
}
static bool pool_init(nvn_object *object, const nvn_object *builder) {
    assert(object == &zn_map_pool && builder);
    return true;
}
static void defaults(nvn_object *object) { (void)object; }
static void set_device(nvn_object *object, nvn_device *value) { (void)object; (void)value; }
static void set_int(nvn_object *object, int value) { (void)object; (void)value; }
static void size(nvn_object *object, int w, int h) { (void)object; assert((w == 1 && (h == 2 || h == 3)) || (w == 1024 && h == 1024)); }
static size_t storage_size(const nvn_object *object) { (void)object; return 4096; }
static void storage(nvn_object *object, nvn_object *pool, ptrdiff_t offset) {
    assert(object && pool == &zn_map_pool && offset == 0);
}
static bool init(nvn_object *object, const nvn_object *builder) {
    assert(object == &zn_map_texture && builder);
    ++creates;
    return true;
}
static int format(const nvn_texture *texture) { (void)texture; return 0x25; }
static bool relaxed_write_check;
static zn_region last_src, last_dst;
static void write_pixels(const nvn_object *object, const void *view, const zn_region *region, const void *data) {
    assert(object == &zn_map_texture && view == NULL);
    const uint8_t *bytes = data;
    if (!relaxed_write_check) {
        assert(region->width == 1 && region->height == 2);
        /* lower_left: the two rows arrive flipped, and only the picture is written once */
        assert(bytes[0] == 5 && bytes[4] == 1);
    }
    ++uploads;
}
static void flush(const nvn_object *object, const void *view, const zn_region *region) {
    assert(object == &zn_map_texture && view == NULL);
    if (!relaxed_write_check) assert(region->width == 1 && region->height == 2);
}
static void copy(nvn_object *cmd, const nvn_object *source, const void *source_view, const zn_region *src,
                 nvn_texture *destination, const void *destination_view, const zn_region *dst, int flags) {
    assert(cmd == &commands && source == &zn_map_texture && source_view == NULL);
    assert(destination == zn_map_target && destination_view == NULL);
    if (!relaxed_write_check) {
        assert(src->y == 1 && src->width == 1 && src->height == 1);
        /* lower_left: the panel's top edge reaches the frame's bottom */
        assert(dst->y == frame_height - 30 - dst->height);
    }
    last_src = *src;
    last_dst = *dst;
    last_flags = (unsigned)flags;
    ++copies;
}

int main(void) {
    nvn_texture target;
    zn_map_target = &target;
    zn_map_api_tried = zn_map_api_ok = true;
    nvn.pool_builder_defaults = pool_defaults;
    nvn.pool_builder_device = pool_device;
    nvn.pool_builder_flags = pool_flags;
    nvn.pool_builder_storage = pool_storage;
    nvn.pool_init = pool_init;
    zn_nvn.defaults = defaults;
    zn_nvn.device = set_device;
    zn_nvn.target = zn_nvn.format = zn_nvn.levels = set_int;
    zn_nvn.size = size;
    zn_nvn.storage_size = zn_nvn.storage_alignment = storage_size;
    zn_nvn.storage = storage;
    zn_nvn.init = init;
    zn_nvn.get_format = format;
    zn_nvn.write = write_pixels;
    zn_nvn.flush = flush;
    zn_nvn.copy = copy;

    const uint8_t pixels[] = {1, 2, 3, 255, 5, 6, 7, 255};
    /* the crop must be inside the picture */
    assert(!kae_map_blit(1, 1, 2, pixels, 0, 0, 2, 1, 20, 30, 40, 40));
    /* first picture: creates the texture once and copies it into the frame */
    assert(kae_map_blit(1, 1, 2, pixels, 0, 0, 1, 1, 20, 30, 40, 40));
    assert(creates == 1 && uploads == 1);
    zn_record_map_copy();
    assert(copies == 1 && last_flags == (ZN_COPY_LINEAR | ZN_COPY_2D));   /* 1 x 1 into 40 x 40 */
    /* the same picture again: no new upload, another copy */
    zn_map_pending = false;
    assert(kae_map_blit(1, 1, 2, pixels, 0, 0, 1, 1, 20, 30, 40, 40));
    assert(creates == 1 && uploads == 1);
    zn_record_map_copy();
    assert(copies == 2);
    /* another picture: new texels in the texture that already exists, never a new one */
    zn_map_pending = false;
    assert(kae_map_blit(2, 1, 2, pixels, 0, 0, 1, 1, 20, 30, 40, 40));
    assert(creates == 1 && uploads == 2);
    /* a picture of another shape cannot use this texture, and must not be created either */
    zn_map_pending = false;
    assert(!kae_map_blit(3, 1, 3, pixels, 0, 0, 1, 1, 20, 30, 40, 40));
    assert(creates == 1 && uploads == 2);
    /* a copy of the same size asks for no filtering */
    zn_map_pending = false;
    assert(kae_map_blit(2, 1, 2, pixels, 0, 0, 1, 1, 20, 30, 1, 1));
    zn_record_map_copy();
    assert(copies == 3 && last_flags == 0);
    /* nothing is ever created again, and the queue is never told to finish */
    assert(creates == 1);

    /* Reset texture shape to test fixed 1024x1024 partitioned atlas + multi-blit queue */
    zn_map_texture_ready = false;
    zn_map_pending = false;
    relaxed_write_check = true;
    creates = uploads = copies = 0;
    frame_width = 1920;
    frame_height = 1080;

    static uint8_t atlas[1024 * 256 * 4];
    assert(kae_map_upload_atlas(atlas, 1025, 256) == 0);
    assert(kae_map_upload_atlas(atlas, 1024, 257) == 0);
    assert(kae_map_upload_atlas(atlas, 1024, 256) == 1);
    assert(creates == 1 && uploads == 1);

    static uint8_t map_view[700 * 700 * 4];
    assert(kae_map_blit(650000u, 700, 700, map_view, 0, 0, 700, 700, 620, 120, 700, 700) == 1);
    for (int i = 0; i < 80; ++i) {
        int ok = kae_map_blit_atlas(48 * (i % 16), 0, 48, 48, 80 + (i % 4) * 56, 140);
        if (i < 63) assert(ok == 1);
        else assert(ok == 0);
    }
    zn_record_map_copy();
    assert(copies == 64);
    assert(creates == 1);
}
