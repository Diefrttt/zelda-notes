#ifndef ZN_HUD_H
#define ZN_HUD_H

#include <kaegae.h>
#include "map_panel.h"

enum {
    ZN_HUD_FOREST = 0x18271f, ZN_HUD_INSET = 0x202f25, ZN_HUD_RELIEF = 0x304838,
    ZN_HUD_GOLD = 0xd5b56c, ZN_HUD_IVORY = 0xf5edda, ZN_HUD_MUTED = 0xc2d0bd,
};

typedef struct {
    ZnMapRect frame;
    int scale;
    bool visible;
} ZnHudLayout;

int zn_hud_scale(int width, int height);
ZnHudLayout zn_hud_layout(int width, int height, int title_px, int count_px);
void zn_draw_hud(const KaeFrame *frame, const ZnGameSnapshot *snapshot);

void zn_map_draw(const KaeFrame *frame, const ZnMapPanel *panel, const ZnGameSnapshot *snapshot);
void zn_draw_map_markers(const ZnMapPanel *panel, const ZnGameSnapshot *snapshot,
                         ZnMapViewport view, int scale);

#endif
