#ifndef ZN_HUD_ICONS_H
#define ZN_HUD_ICONS_H

#include "game_state.h"

enum { ZN_ICON_SIZE = 8, ZN_ICON_BADGE_SIZE = 12 };

void zn_draw_category_icon(ZnCategoryIcon icon, int x, int y, int scale, uint32_t color);
void zn_draw_icon_state(ZnProgress progress, int x, int y, int scale);

#endif
