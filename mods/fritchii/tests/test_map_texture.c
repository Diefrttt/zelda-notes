#include <assert.h>
#include <string.h>
#include "../src/map_texture.h"

int main(void) {
    char path[64];
    assert(zn_map_texture_path(640052, path, sizeof path));
    assert(strcmp(path, "content:/zelda-notes/maps/640052.znmap") == 0);
    assert(zn_map_texture_path(0, path, sizeof path));
    assert(strcmp(path, "content:/zelda-notes/maps/0.znmap") == 0);
    assert(!zn_map_texture_path(640052, path, 10));

    uint8_t header[8] = {'Z', 'N', 'M', '1', 1, 0, 1, 0};
    ZnMapImageInfo info;
    assert(zn_read_map_header(header, 12, &info));
    assert(info.width == 1 && info.height == 1 && info.pixel_bytes == 4);
    assert(!zn_read_map_header(header, 11, &info));
    assert(!zn_read_map_header(header, 13, &info));
    header[0] = 'X';
    assert(!zn_read_map_header(header, 12, &info));
    header[0] = 'Z';
    header[4] = 0;
    assert(!zn_read_map_header(header, 8, &info));
    header[4] = 1;
    header[5] = 4;
    assert(zn_read_map_header(header, 4108, &info));
    const uint8_t world[8] = {'Z', 'N', 'M', '1', 0xf0, 4, 0x35, 3};
    assert(zn_read_map_header(world, 8 + (size_t)1264 * 821 * 4, &info));
    assert(info.width == 1264 && info.height == 821);
    const uint8_t oversized[8] = {'Z', 'N', 'M', '1', 0xf0, 4, 0x40, 3};
    assert(!zn_read_map_header(oversized, 8 + (size_t)1264 * 832 * 4, &info));

    /* ZNI1 header validation */
    uint8_t ihdr[8] = {'Z', 'N', 'I', '1', 1, 0, 35, 0};
    uint16_t icount = 0;
    assert(zn_read_icons_header(ihdr, 8 + (size_t)35 * ZN_ICONS_RECORD_BYTES, &icount));
    assert(icount == 35);
    assert(!zn_read_icons_header(ihdr, 8 + (size_t)34 * ZN_ICONS_RECORD_BYTES, &icount));
    ihdr[0] = 'X';
    assert(!zn_read_icons_header(ihdr, 8 + (size_t)35 * ZN_ICONS_RECORD_BYTES, &icount));
    ihdr[0] = 'Z';
    ihdr[4] = 2; /* unsupported version */
    assert(!zn_read_icons_header(ihdr, 8 + (size_t)35 * ZN_ICONS_RECORD_BYTES, &icount));

    /* Atlas coordinates must stay disjoint and inside 1024x256 for both scales */
    for (int s = 1; s <= 2; ++s) {
        for (uint8_t i = 0; i < 35; ++i) {
            ZnMapRect a = {0}, d = {0}, m = {0};
            assert(zn_icon_atlas_rect(i, ZN_SPRITE_CAT_ACTIVE, s, &a));
            assert(zn_icon_atlas_rect(i, ZN_SPRITE_CAT_DIMMED, s, &d));
            assert(zn_icon_atlas_rect(i, ZN_SPRITE_PIN_MINI, s, &m));
            assert(a.x >= 0 && a.y >= 0 && a.x + a.w <= ZN_ICON_STRIP_W && a.y + a.h <= ZN_ICON_STRIP_H);
            assert(d.x >= 0 && d.y >= 0 && d.x + d.w <= ZN_ICON_STRIP_W && d.y + d.h <= ZN_ICON_STRIP_H);
            assert(m.x >= 0 && m.y >= 0 && m.x + m.w <= ZN_ICON_STRIP_W && m.y + m.h <= ZN_ICON_STRIP_H);
            assert(a.y != d.y && d.y != m.y && a.y != m.y);
        }
    }

    /* Alpha blend & clipping near buffer boundaries */
    uint8_t dst[4 * 4 * 4];
    memset(dst, 0x20, sizeof dst);
    for (size_t p = 0; p < 16; ++p) dst[p * 4 + 3] = 255;
    uint8_t src[2 * 2 * 4] = {
        200, 100, 50, 255,   200, 100, 50, 0,
        200, 100, 50, 128,   200, 100, 50, 255,
    };
    zn_alpha_blend_rgba(dst, 4, 4, 3, 3, src, 2, 2, 255, 0);
    /* pixel (3,3) gets src(0,0) = (200,100,50); out-of-bounds pixels don't crash */
    size_t idx = (size_t)(3 * 4 + 3) * 4;
    assert(dst[idx] == 200 && dst[idx + 1] == 100 && dst[idx + 2] == 50 && dst[idx + 3] == 255);

    /* Non-zero bg_rgb fills even 0-alpha corners with exact card background */
    memset(dst, 0, sizeof dst);
    zn_alpha_blend_rgba(dst, 4, 4, 0, 0, src, 2, 2, 255, 0x161a19u);
    assert(dst[(0 * 4 + 1) * 4 + 0] == 0x16 && dst[(0 * 4 + 1) * 4 + 1] == 0x1a &&
           dst[(0 * 4 + 1) * 4 + 2] == 0x19 && dst[(0 * 4 + 1) * 4 + 3] == 255);
}
