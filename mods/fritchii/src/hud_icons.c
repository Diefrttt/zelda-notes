#include <kaegae.h>
#include "hud_icons.h"

/* Eight rows, with the most significant bit at the left. */
static const uint8_t silhouettes[ZN_ICON_COUNT][ZN_ICON_SIZE] = {
    [ZN_ICON_GENERIC]   = {0x18, 0x3c, 0x66, 0xc3, 0xc3, 0x66, 0x3c, 0x18},
    [ZN_ICON_SKULLTULA] = {0x81, 0x5a, 0x3c, 0xff, 0xbd, 0x5a, 0x3c, 0x81},
    [ZN_ICON_HEART]     = {0x00, 0x66, 0xff, 0xff, 0x7e, 0x3c, 0x18, 0x00},
    [ZN_ICON_CHEST]     = {0x00, 0x3c, 0x7e, 0xff, 0x18, 0xff, 0xff, 0x7e},
    [ZN_ICON_KEY]       = {0x38, 0x6c, 0x6c, 0x38, 0x10, 0x1e, 0x14, 0x1c},
    [ZN_ICON_RUPEE]     = {0x18, 0x3c, 0x7e, 0x5e, 0x5e, 0x7e, 0x3c, 0x18},
    [ZN_ICON_BOTTLE]    = {0x3c, 0x3c, 0x18, 0x24, 0x42, 0x5a, 0x7e, 0x3c},
    [ZN_ICON_OCARINA]   = {0x00, 0x38, 0x7c, 0xdf, 0xbf, 0x7c, 0x38, 0x00},
    [ZN_ICON_SWORD]     = {0x03, 0x07, 0x0e, 0x5c, 0x38, 0x1c, 0x30, 0x60},
    [ZN_ICON_SHIELD]    = {0x7e, 0xff, 0xdb, 0xff, 0x7e, 0x7e, 0x3c, 0x18},
    [ZN_ICON_FAIRY]     = {0x66, 0xff, 0x7e, 0x18, 0x3c, 0x5a, 0x24, 0x00},
    [ZN_ICON_DOOR]      = {0x18, 0x3c, 0x7e, 0x66, 0x6e, 0x66, 0x66, 0xff},
    [ZN_ICON_PERSON]    = {0x18, 0x3c, 0x3c, 0x18, 0x3c, 0x7e, 0xff, 0xff},
};

static void draw_rows(const uint8_t rows[static ZN_ICON_SIZE], int x, int y, int s, uint32_t color) {
    for (int row = 0; row < ZN_ICON_SIZE; ++row) {
        for (int col = 0; col < ZN_ICON_SIZE;) {
            if (!(rows[row] & (0x80u >> col))) {
                ++col;
                continue;
            }
            int start = col;
            do { ++col; } while (col < ZN_ICON_SIZE && (rows[row] & (0x80u >> col)));
            kae_draw_rect(x + start*s, y + row*s, (col-start)*s, s, color);
        }
    }
}

void zn_draw_category_icon(ZnCategoryIcon icon, int x, int y, int s, uint32_t color) {
    if ((unsigned)icon >= ZN_ICON_COUNT) icon = ZN_ICON_GENERIC;
    draw_rows(silhouettes[icon], x, y, s, color);
}

void zn_draw_icon_state(ZnProgress progress, int x, int y, int s) {
    if (progress == ZN_PENDING) return;
    static const uint8_t check[ZN_ICON_SIZE] = {0, 0, 0x08, 0x10, 0xa0, 0x40, 0, 0};
    static const uint8_t ring[ZN_ICON_SIZE] = {0, 0, 0x60, 0x90, 0x90, 0x60, 0, 0};
    kae_draw_rect(x + 5*s, y + 5*s, 6*s, 6*s, 0x18271f);
    draw_rows(progress == ZN_OBTAINED ? check : ring, x + 5*s, y + 4*s, s,
              progress == ZN_OBTAINED ? 0x9de2a9 : 0xf5edda);
}
