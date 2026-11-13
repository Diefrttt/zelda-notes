#ifndef ZN_MAP_TEXTURE_H
#define ZN_MAP_TEXTURE_H

#include "map_panel.h"

enum {
    ZN_MAP_MAX_SIDE = 1024,
    ZN_MAP_HEADER_SIZE = 8,
    ZN_MAP_VIEW_MAX_H = 768,
    ZN_ICONS_HEADER_SIZE = 8,
    ZN_ICONS_MAX_COUNT = 42,
    ZN_ICONS_RECORD_BYTES = (48 * 48 * 2 + 32 * 32 * 2 + 24 * 24 + 18 * 18) * 4,
    ZN_ICON_STRIP_W = 1024,
    ZN_ICON_STRIP_H = 256,
    ZN_GPU_ATLAS_Y = 768,
};

typedef struct { uint16_t width, height; size_t pixel_bytes; } ZnMapImageInfo;

typedef struct {
    int x, y;
    uint8_t icon_index;
    bool obtained;
    bool selected;
} ZnComposePin;

typedef enum {
    ZN_SPRITE_CAT_ACTIVE = 0,
    ZN_SPRITE_CAT_DIMMED = 1,
    ZN_SPRITE_PIN_MINI = 2,
} ZnSpriteSlot;

bool zn_read_map_header(const uint8_t *header, size_t file_size, ZnMapImageInfo *out);
bool zn_map_texture_path(uint32_t id, char *out, size_t cap);

bool zn_read_icons_header(const uint8_t *header, size_t file_size, uint16_t *out_count);
bool zn_icon_atlas_rect(uint8_t icon_index, ZnSpriteSlot slot, int scale, ZnMapRect *out_src);
void zn_alpha_blend_rgba(uint8_t *dst, int dst_w, int dst_h, int dx, int dy,
                         const uint8_t *src, int sw, int sh, uint8_t alpha_mul, uint32_t bg_rgb);
void zn_compose_map_buffer(uint8_t *dst_rgba, int dst_w, int dst_h,
                           const uint8_t *src_rgba, int src_w, int src_h, ZnMapRect crop,
                           const uint8_t *icons_blob, uint16_t icon_count,
                           const ZnComposePin *pins, int pin_count,
                           bool has_link, int link_x, int link_y, int scale);

/* Game thread, once a frame: reads the picture and icons the render thread asked for. */
void zn_map_texture_tick(void);
bool zn_map_texture_draw(const ZnMapArtwork *artwork, ZnMapRect crop, ZnMapRect destination);
typedef enum { ZN_MAP_UNAVAILABLE, ZN_MAP_LOADING, ZN_MAP_DRAWN } ZnMapTextureStatus;
ZnMapTextureStatus zn_map_texture_compose_and_draw(const ZnMapArtwork *artwork, ZnMapRect crop, ZnMapRect destination,
                                     const ZnComposePin *pins, int pin_count,
                                     bool has_link, int link_x, int link_y, int scale, uint32_t view_hash);
bool zn_icon_atlas_ready(int scale);
bool zn_icon_draw(uint8_t icon_index, ZnSpriteSlot slot, int scale, int dx, int dy);

#endif
