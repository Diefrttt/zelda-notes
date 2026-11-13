#include "map_texture.h"

enum {
    ZN_PIN_BORDER_DARK = 0x101612u,
    ZN_PIN_BORDER_LIGHT = 0xdce2dcu,
    ZN_PIN_BORDER_DIM = 0x5f6962u,
    ZN_PIN_BORDER_GOLD = 0xd8b25au,
    ZN_LINK_FILL = 0x78f06eu,
    ZN_LINK_OUTLINE = 0x0e1810u,
    ZN_CAT_BG_RGB = 0x161a19u,
    ZN_LIST_BG_RGB = 0x1e2421u,
    ZN_MAP_SOURCE_MAX_SIDE = 1264,
    /* Keep the same two 4 MiB buffers as the working build. */
    ZN_MAP_SOURCE_MAX_PIXELS = ZN_MAP_MAX_SIDE * ZN_MAP_MAX_SIDE,
};

bool zn_read_map_header(const uint8_t *header, size_t file_size, ZnMapImageInfo *out) {
    if (file_size < ZN_MAP_HEADER_SIZE || header[0] != 'Z' || header[1] != 'N' ||
        header[2] != 'M' || header[3] != '1') return false;
    uint16_t width = (uint16_t)(header[4] | (header[5] << 8));
    uint16_t height = (uint16_t)(header[6] | (header[7] << 8));
    size_t pixel_count = (size_t)width * height;
    if (!width || !height || width > ZN_MAP_SOURCE_MAX_SIDE || height > ZN_MAP_SOURCE_MAX_SIDE ||
        pixel_count > ZN_MAP_SOURCE_MAX_PIXELS) return false;
    size_t bytes = pixel_count * 4;
    if (file_size != ZN_MAP_HEADER_SIZE + bytes) return false;
    *out = (ZnMapImageInfo){width, height, bytes};
    return true;
}

bool zn_read_icons_header(const uint8_t *header, size_t file_size, uint16_t *out_count) {
    if (!header || file_size < ZN_ICONS_HEADER_SIZE || header[0] != 'Z' || header[1] != 'N' ||
        header[2] != 'I' || header[3] != '1') return false;
    uint16_t version = (uint16_t)(header[4] | (header[5] << 8));
    uint16_t count = (uint16_t)(header[6] | (header[7] << 8));
    if (version != 1 || count == 0 || count > ZN_ICONS_MAX_COUNT) return false;
    size_t expected = ZN_ICONS_HEADER_SIZE + (size_t)count * ZN_ICONS_RECORD_BYTES;
    if (file_size != expected) return false;
    if (out_count) *out_count = count;
    return true;
}

bool zn_icon_atlas_rect(uint8_t icon_index, ZnSpriteSlot slot, int scale, ZnMapRect *out_src) {
    if (!out_src || icon_index >= ZN_ICONS_MAX_COUNT) return false;
    bool hi = scale >= 2;
    if (slot == ZN_SPRITE_PIN_MINI) {
        int sz = hi ? 24 : 18;
        int cols = hi ? 42 : 56;
        int y0 = hi ? 192 : 128;
        *out_src = (ZnMapRect){ (icon_index % cols) * sz, y0 + (icon_index / cols) * sz, sz, sz };
        return true;
    }
    int sz = hi ? 48 : 32;
    int cols = hi ? 21 : 32;
    int y0 = (slot == ZN_SPRITE_CAT_DIMMED) ? (hi ? 96 : 64) : 0;
    *out_src = (ZnMapRect){ (icon_index % cols) * sz, y0 + (icon_index / cols) * sz, sz, sz };
    return true;
}

static size_t sprite_record_offset(ZnSpriteSlot slot, int scale) {
    bool hi = scale >= 2;
    if (slot == ZN_SPRITE_PIN_MINI) return hi ? 26624u : 28928u;
    if (hi) return slot == ZN_SPRITE_CAT_DIMMED ? 9216u : 0u;
    return slot == ZN_SPRITE_CAT_DIMMED ? 22528u : 18432u;
}

void zn_alpha_blend_rgba(uint8_t *dst, int dst_w, int dst_h, int dx, int dy,
                         const uint8_t *src, int sw, int sh, uint8_t alpha_mul, uint32_t bg_rgb) {
    if (!dst || !src || dst_w <= 0 || dst_h <= 0 || sw <= 0 || sh <= 0) return;
    uint8_t br = (uint8_t)((bg_rgb >> 16) & 0xffu);
    uint8_t bg = (uint8_t)((bg_rgb >> 8) & 0xffu);
    uint8_t bb = (uint8_t)(bg_rgb & 0xffu);
    for (int row = 0; row < sh; ++row) {
        int ty = dy + row;
        if (ty < 0 || ty >= dst_h) continue;
        for (int col = 0; col < sw; ++col) {
            int tx = dx + col;
            if (tx < 0 || tx >= dst_w) continue;
            const uint8_t *sp = src + ((size_t)row * sw + col) * 4;
            uint8_t a = (uint8_t)((sp[3] * (uint16_t)alpha_mul + 127) / 255);
            uint8_t *dp = dst + ((size_t)ty * dst_w + tx) * 4;
            if (!a) {
                if (bg_rgb) { dp[0] = br; dp[1] = bg; dp[2] = bb; dp[3] = 255; }
                continue;
            }
            uint8_t dr = bg_rgb ? br : dp[0];
            uint8_t dg = bg_rgb ? bg : dp[1];
            uint8_t db = bg_rgb ? bb : dp[2];
            uint16_t inv = (uint16_t)(255 - a);
            dp[0] = (uint8_t)((sp[0] * a + dr * inv + 127) / 255);
            dp[1] = (uint8_t)((sp[1] * a + dg * inv + 127) / 255);
            dp[2] = (uint8_t)((sp[2] * a + db * inv + 127) / 255);
            dp[3] = 255;
        }
    }
}

static void draw_filled_circle(uint8_t *dst, int w, int h, int cx, int cy, int r,
                               uint32_t fill_rgb, uint32_t ring_rgb, int ring_thick) {
    int r_outer2 = r * r;
    int r_inner = r - ring_thick;
    int r_inner2 = r_inner > 0 ? r_inner * r_inner : 0;
    uint8_t fr = (uint8_t)((fill_rgb >> 16) & 0xffu), fg = (uint8_t)((fill_rgb >> 8) & 0xffu), fb = (uint8_t)(fill_rgb & 0xffu);
    uint8_t rr = (uint8_t)((ring_rgb >> 16) & 0xffu), rg = (uint8_t)((ring_rgb >> 8) & 0xffu), rb = (uint8_t)(ring_rgb & 0xffu);
    for (int dy = -r; dy <= r; ++dy) {
        int y = cy + dy;
        if (y < 0 || y >= h) continue;
        for (int dx = -r; dx <= r; ++dx) {
            int x = cx + dx;
            if (x < 0 || x >= w) continue;
            int d2 = dx * dx + dy * dy;
            if (d2 > r_outer2) continue;
            uint8_t *p = dst + ((size_t)y * w + x) * 4;
            if (d2 >= r_inner2) { p[0] = rr; p[1] = rg; p[2] = rb; }
            else { p[0] = fr; p[1] = fg; p[2] = fb; }
            p[3] = 255;
        }
    }
}

static void draw_link_triangle(uint8_t *dst, int w, int h, int cx, int cy, int s) {
    int half_h = 10 * s;
    for (int dy = -half_h; dy <= half_h; ++dy) {
        int y = cy + dy;
        if (y < 0 || y >= h) continue;
        int span = ((dy + half_h) * (8 * s)) / (2 * half_h + 1);
        for (int dx = -span; dx <= span; ++dx) {
            int x = cx + dx;
            if (x < 0 || x >= w) continue;
            bool edge = (dx == -span || dx == span || dy == -half_h || dy == half_h);
            uint32_t col = edge ? ZN_LINK_OUTLINE : ZN_LINK_FILL;
            uint8_t *p = dst + ((size_t)y * w + x) * 4;
            p[0] = (uint8_t)((col >> 16) & 0xffu);
            p[1] = (uint8_t)((col >> 8) & 0xffu);
            p[2] = (uint8_t)(col & 0xffu);
            p[3] = 255;
        }
    }
}

void zn_compose_map_buffer(uint8_t *dst_rgba, int dst_w, int dst_h,
                           const uint8_t *src_rgba, int src_w, int src_h, ZnMapRect crop,
                           const uint8_t *icons_blob, uint16_t icon_count,
                           const ZnComposePin *pins, int pin_count,
                           bool has_link, int link_x, int link_y, int scale) {
    if (!dst_rgba || !src_rgba || dst_w <= 0 || dst_h <= 0 || src_w <= 0 || src_h <= 0 ||
        crop.w <= 0 || crop.h <= 0) return;

    /* Bilinear resample of source map crop into dst_w x dst_h */
    for (int y = 0; y < dst_h; ++y) {
        int fy_256 = dst_h > 1 ? (y * (crop.h - 1) * 256) / (dst_h - 1) : 0;
        int sy0 = crop.y + (fy_256 >> 8);
        int wy = fy_256 & 255;
        if (sy0 < 0) sy0 = 0;
        int sy1 = sy0 + 1 < src_h ? sy0 + 1 : src_h - 1;
        if (sy0 >= src_h) sy0 = src_h - 1;
        const uint8_t *row0 = src_rgba + (size_t)sy0 * src_w * 4;
        const uint8_t *row1 = src_rgba + (size_t)sy1 * src_w * 4;
        uint8_t *out = dst_rgba + (size_t)y * dst_w * 4;
        for (int x = 0; x < dst_w; ++x) {
            int fx_256 = dst_w > 1 ? (x * (crop.w - 1) * 256) / (dst_w - 1) : 0;
            int sx0 = crop.x + (fx_256 >> 8);
            int wx = fx_256 & 255;
            if (sx0 < 0) sx0 = 0;
            int sx1 = sx0 + 1 < src_w ? sx0 + 1 : src_w - 1;
            if (sx0 >= src_w) sx0 = src_w - 1;
            const uint8_t *p00 = row0 + (size_t)sx0 * 4;
            const uint8_t *p10 = row0 + (size_t)sx1 * 4;
            const uint8_t *p01 = row1 + (size_t)sx0 * 4;
            const uint8_t *p11 = row1 + (size_t)sx1 * 4;
            int iwx = 256 - wx, iwy = 256 - wy;
            for (int c = 0; c < 3; ++c) {
                int top = p00[c] * iwx + p10[c] * wx;
                int bot = p01[c] * iwx + p11[c] * wx;
                out[x * 4 + c] = (uint8_t)((top * iwy + bot * wy + 32768) >> 16);
            }
            out[x * 4 + 3] = 255;
        }
    }

    bool hi = scale >= 2;
    int pin_sz = hi ? 24 : 18;
    size_t pin_off = sprite_record_offset(ZN_SPRITE_PIN_MINI, scale);

    /* Draw unselected obtained first, then pending, then selected last on top */
    for (int pass = 0; pass < 3; ++pass) {
        for (int i = 0; i < pin_count; ++i) {
            const ZnComposePin *pin = &pins[i];
            if (pass == 0 && (pin->selected || !pin->obtained)) continue;
            if (pass == 1 && (pin->selected || pin->obtained)) continue;
            if (pass == 2 && !pin->selected) continue;

            int r = pin->selected ? (pin_sz / 2 + (hi ? 6 : 4)) : (pin_sz / 2 + (hi ? 2 : 1));
            uint32_t ring = pin->selected ? ZN_PIN_BORDER_GOLD : (pin->obtained ? ZN_PIN_BORDER_DIM : ZN_PIN_BORDER_LIGHT);
            draw_filled_circle(dst_rgba, dst_w, dst_h, pin->x, pin->y, r, ZN_PIN_BORDER_DARK, ring, pin->selected ? (hi ? 3 : 2) : 1);

            if (icons_blob && pin->icon_index < icon_count) {
                const uint8_t *sp = icons_blob + (size_t)pin->icon_index * ZN_ICONS_RECORD_BYTES + pin_off;
                zn_alpha_blend_rgba(dst_rgba, dst_w, dst_h, pin->x - pin_sz / 2, pin->y - pin_sz / 2,
                                    sp, pin_sz, pin_sz, pin->obtained && !pin->selected ? 128 : 255, 0);
            }
        }
    }

    if (has_link) draw_link_triangle(dst_rgba, dst_w, dst_h, link_x, link_y, hi ? 1 : 1);
}

bool zn_map_texture_path(uint32_t id, char *out, size_t cap) {
    /* Main mounts RomFS under "content" (nn::fs::MountRom("content", ...)); "rom:/" is not
       mounted and causes nn::fs::OpenFile to abort with ResultNotMounted (2002-6905). */
    static const char prefix[] = "content:/zelda-notes/maps/";
    static const char suffix[] = ".znmap";
    char digits[10];
    size_t len = 0;
    uint32_t number = id;
    do {
        digits[len++] = (char)('0' + number % 10);
        number /= 10;
    } while (number);
    size_t total = (sizeof prefix - 1) + len + sizeof suffix;
    if (!out || cap < total) return false;
    char *cursor = out;
    for (size_t i = 0; i < sizeof prefix - 1; ++i) *cursor++ = prefix[i];
    while (len) *cursor++ = digits[--len];
    for (size_t i = 0; i < sizeof suffix; ++i) *cursor++ = suffix[i];
    return true;
}

#ifndef ZN_HOST_TEST
#include <kaegae.h>
#include <stdatomic.h>

typedef struct { uint64_t handle; } ZnFile;
extern uint32_t zn_open(ZnFile *, const char *, int) __asm__("_ZN2nn2fs8OpenFileEPNS0_10FileHandleEPKci");
extern uint32_t zn_size(int64_t *, ZnFile) __asm__("_ZN2nn2fs11GetFileSizeEPlNS0_10FileHandleE");
extern uint32_t zn_read(ZnFile, int64_t, void *, size_t) __asm__("_ZN2nn2fs8ReadFileENS0_10FileHandleElPvm");
extern void zn_close(ZnFile) __asm__("_ZN2nn2fs9CloseFileENS0_10FileHandleE");

enum { ZN_MAP_BUFFERS = 2 };
static _Alignas(64) uint8_t pixels[ZN_MAP_BUFFERS][ZN_MAP_SOURCE_MAX_PIXELS * 4];
static _Alignas(64) uint8_t composed_map[ZN_MAP_MAX_SIDE * ZN_MAP_VIEW_MAX_H * 4];
static _Alignas(64) uint8_t icons_blob[ZN_ICONS_MAX_COUNT * ZN_ICONS_RECORD_BYTES];
static _Alignas(64) uint8_t icon_strip_rgba[ZN_ICON_STRIP_W * ZN_ICON_STRIP_H * 4];
static atomic_ullong wanted;      /* id << 32 | width << 16 | height */
static atomic_uint published;     /* id << 1 | buffer */
static atomic_uint icons_count_pub;
static bool icons_tried;
static atomic_uint failed_id;
static uint32_t last_compose_key;
static uint16_t last_compose_w, last_compose_h;
static int uploaded_atlas_scale;

static void load_icons_blob(void) {
    if (icons_tried) return;
    icons_tried = true;
    ZnFile file;
    if (zn_open(&file, "content:/zelda-notes/icons.znicons", 1) != 0) {
        KAE_LOG("Atlas de iconos no disponible en RomFS");
        return;
    }
    int64_t size = 0;
    uint8_t header[ZN_ICONS_HEADER_SIZE];
    uint16_t count = 0;
    bool ok = zn_size(&size, file) == 0 && size >= ZN_ICONS_HEADER_SIZE &&
        (uint64_t)size <= ZN_ICONS_HEADER_SIZE + (uint64_t)ZN_ICONS_MAX_COUNT * ZN_ICONS_RECORD_BYTES &&
        zn_read(file, 0, header, sizeof header) == 0 &&
        zn_read_icons_header(header, (size_t)size, &count) &&
        zn_read(file, ZN_ICONS_HEADER_SIZE, icons_blob, (size_t)count * ZN_ICONS_RECORD_BYTES) == 0;
    zn_close(file);
    if (!ok) {
        KAE_LOG("Error leyendo icons.znicons");
        return;
    }
    atomic_store_explicit(&icons_count_pub, count, memory_order_release);
}

static bool load_artwork(uint32_t id, uint16_t width, uint16_t height, uint8_t *into) {
    char path[64];
    if (!zn_map_texture_path(id, path, sizeof path)) return false;

    ZnFile file;
    if (zn_open(&file, path, 1) != 0) return false;
    int64_t size;
    uint8_t header[ZN_MAP_HEADER_SIZE];
    ZnMapImageInfo info;
    bool ok = zn_size(&size, file) == 0 && size >= ZN_MAP_HEADER_SIZE &&
        (uint64_t)size <= ZN_MAP_SOURCE_MAX_PIXELS * 4 + ZN_MAP_HEADER_SIZE &&
        zn_read(file, 0, header, sizeof header) == 0 && zn_read_map_header(header, (size_t)size, &info) &&
        info.width == width && info.height == height &&
        zn_read(file, ZN_MAP_HEADER_SIZE, into, info.pixel_bytes) == 0;
    zn_close(file);
    return ok;
}

void zn_map_texture_tick(void) {
    load_icons_blob();
    uint64_t want = atomic_load_explicit(&wanted, memory_order_acquire);
    uint32_t id = (uint32_t)(want >> 32);
    if (id == 0 || id == atomic_load_explicit(&failed_id, memory_order_relaxed)) return;
    uint32_t state = atomic_load_explicit(&published, memory_order_relaxed);
    if ((state >> 1) == id) return;
    size_t buffer = (size_t)((state ^ 1u) & 1u);
    if (!load_artwork(id, (uint16_t)(want >> 16), (uint16_t)want, pixels[buffer])) {
        atomic_store_explicit(&failed_id, id, memory_order_release);
        KAE_LOG("Fondo del plano no disponible en RomFS");
        return;
    }
    atomic_store_explicit(&published, (id << 1) | (uint32_t)buffer, memory_order_release);
}

bool zn_icon_atlas_ready(int scale) {
    int s = scale >= 2 ? 2 : 1;
    uint16_t cnt = (uint16_t)atomic_load_explicit(&icons_count_pub, memory_order_acquire);
    if (uploaded_atlas_scale == (cnt ? s : -s)) return cnt > 0;

    for (size_t z = 0; z < sizeof icon_strip_rgba; ++z) icon_strip_rgba[z] = 0;
    if (cnt > 0) {
        static const ZnSpriteSlot slots[3] = { ZN_SPRITE_CAT_ACTIVE, ZN_SPRITE_CAT_DIMMED, ZN_SPRITE_PIN_MINI };
        for (uint16_t i = 0; i < cnt; ++i) {
            const uint8_t *rec = icons_blob + (size_t)i * ZN_ICONS_RECORD_BYTES;
            for (int k = 0; k < 3; ++k) {
                ZnMapRect r;
                if (!zn_icon_atlas_rect((uint8_t)i, slots[k], s, &r)) continue;
                uint32_t bg = (slots[k] == ZN_SPRITE_PIN_MINI) ? ZN_LIST_BG_RGB : ZN_CAT_BG_RGB;
                const uint8_t *src = rec + sprite_record_offset(slots[k], s);
                zn_alpha_blend_rgba(icon_strip_rgba, ZN_ICON_STRIP_W, ZN_ICON_STRIP_H,
                                    r.x, r.y, src, r.w, r.h, 255, bg);
            }
        }
    }
    if (!kae_map_upload_atlas(icon_strip_rgba, ZN_ICON_STRIP_W, ZN_ICON_STRIP_H)) return false;
    uploaded_atlas_scale = cnt ? s : -s;
    return cnt > 0;
}

bool zn_icon_draw(uint8_t icon_index, ZnSpriteSlot slot, int scale, int dx, int dy) {
    if (!zn_icon_atlas_ready(scale)) return false;
    uint16_t cnt = (uint16_t)atomic_load_explicit(&icons_count_pub, memory_order_acquire);
    if (icon_index >= cnt) return false;
    ZnMapRect src;
    if (!zn_icon_atlas_rect(icon_index, slot, scale, &src)) return false;
    return kae_map_blit_atlas(src.x, src.y, src.w, src.h, dx, dy) != 0;
}

static const uint8_t *requested_pixels(const ZnMapArtwork *art) {
    uint32_t state = atomic_load_explicit(&published, memory_order_acquire);
    if ((state >> 1) != art->id) {
        uint64_t request = ((uint64_t)art->id << 32) | ((uint32_t)art->width << 16) | art->height;
        uint64_t seen = atomic_load_explicit(&wanted, memory_order_relaxed);
        if (seen != request) atomic_store_explicit(&wanted, request, memory_order_release);
        return NULL;
    }
    return pixels[state & 1u];
}

bool zn_map_texture_draw(const ZnMapArtwork *art, ZnMapRect crop, ZnMapRect destination) {
    if (crop.w <= 0 || crop.h <= 0 || destination.w <= 0 || destination.h <= 0) return false;
    const uint8_t *source = requested_pixels(art);
    return source && kae_map_blit(art->id, art->width, art->height, source, crop.x, crop.y,
                        crop.w, crop.h, destination.x, destination.y, destination.w, destination.h) != 0;
}

ZnMapTextureStatus zn_map_texture_compose_and_draw(const ZnMapArtwork *art, ZnMapRect crop, ZnMapRect destination,
                                     const ZnComposePin *pins, int pin_count,
                                     bool has_link, int link_x, int link_y, int scale, uint32_t view_hash) {
    if (crop.w <= 0 || crop.h <= 0 || destination.w <= 0 || destination.h <= 0 ||
        destination.w > ZN_MAP_MAX_SIDE || destination.h > ZN_MAP_VIEW_MAX_H) return ZN_MAP_UNAVAILABLE;
    (void)zn_icon_atlas_ready(scale); /* Pin NVN texture shape to 1024x1024 before map write */
    const uint8_t *source = requested_pixels(art);
    if (!source)
        return art->id == atomic_load_explicit(&failed_id, memory_order_acquire) ? ZN_MAP_UNAVAILABLE : ZN_MAP_LOADING;
    uint32_t key = (art->id * 2654435761u) ^ view_hash ^ ((uint32_t)destination.w << 16) ^ (uint32_t)destination.h;
    if (key == 0) key = 1;
    uint16_t cnt = (uint16_t)atomic_load_explicit(&icons_count_pub, memory_order_acquire);
    if (key != last_compose_key || last_compose_w != destination.w || last_compose_h != destination.h) {
        zn_compose_map_buffer(composed_map, destination.w, destination.h,
                              source, art->width, art->height, crop,
                              cnt ? icons_blob : NULL, cnt,
                              pins, pin_count, has_link, link_x, link_y, scale);
        last_compose_key = key;
        last_compose_w = (uint16_t)destination.w;
        last_compose_h = (uint16_t)destination.h;
    }
    return kae_map_blit(key, destination.w, destination.h, composed_map,
                        0, 0, destination.w, destination.h,
                        destination.x, destination.y, destination.w, destination.h) ? ZN_MAP_DRAWN : ZN_MAP_UNAVAILABLE;
}
#endif
