#ifndef ZN_MAP_PANEL_H
#define ZN_MAP_PANEL_H

#include "game_state.h"

typedef uint32_t ZnMapInput;
enum { ZN_MAP_CONTROLLER_STYLES = 5, ZN_MAP_CONTROLLER_COUNT = 2 * ZN_MAP_CONTROLLER_STYLES };
enum {
    ZN_MAP_TOGGLE = 1u << 0,
    ZN_MAP_ACCEPT = 1u << 1,         /* A */
    ZN_MAP_BACK = 1u << 2,           /* B */
    ZN_MAP_PREV_ZONE = 1u << 3,      /* ZL */
    ZN_MAP_NEXT_ZONE = 1u << 4,      /* ZR */
    ZN_MAP_NAV_UP = 1u << 5,         /* D-Pad UP */
    ZN_MAP_NAV_DOWN = 1u << 6,       /* D-Pad DOWN */
    ZN_MAP_NAV_LEFT = 1u << 7,       /* D-Pad LEFT */
    ZN_MAP_NAV_RIGHT = 1u << 8,      /* D-Pad RIGHT */
    ZN_MAP_PREV_COL = 1u << 9,       /* L */
    ZN_MAP_NEXT_COL = 1u << 10,      /* R */
    ZN_MAP_NEXT_PROGRESS = 1u << 11, /* X */
    ZN_MAP_NEXT_AGE_FLOOR = 1u << 12,/* Y */
    ZN_MAP_ZOOM_IN = 1u << 13,
    ZN_MAP_ZOOM_OUT = 1u << 14,
};

typedef enum {
    ZN_COL_CATEGORIES = 0,
    ZN_COL_MAP = 1,
    ZN_COL_OBJECTIVES = 2,
    ZN_COL_COUNT = 3,
} ZnPanelColumn;

typedef struct { float x, y; } ZnPoint;
typedef struct { int x, y, w, h; } ZnMapRect;
typedef struct { ZnBounds focus; ZnPoint center; float zoom; } ZnMapView;
typedef struct { ZnBounds visible; ZnMapRect source, destination; } ZnMapViewport;

typedef struct {
    bool is_focus;
    uint8_t section;
    uint8_t col;
    uint16_t row;
    uint16_t cat_index;
} ZnCatNavItem;

typedef struct {
    bool open;
    uint8_t age, progress, active_col, last_cat_col;
    uint16_t zone, floor, selected;
    uint16_t cat_cursor, cat_scroll, desc_scroll;
    uint64_t focus_mask; /* 0 = all categories visible */
    ZnMapView view;
} ZnMapPanel;

typedef struct { uint32_t held; uint64_t consumed; } ZnMapController;

ZnMapController *zn_map_controller(ZnMapController states[static ZN_MAP_CONTROLLER_COUNT],
                                  uint32_t controller, uint32_t style);
bool zn_map_can_draw(int width, int height);
ZnMapInput zn_map_pressed(uint32_t *held, ZnMapInput current);
void zn_map_update(ZnMapPanel *panel, ZnMapInput input, const ZnGameSnapshot *snapshot);
uint16_t zn_map_next_variant(const ZnMapPanel *panel);
bool zn_map_matches(const ZnMapPanel *panel, const ZnMarker *marker, const ZnGameSnapshot *snapshot);
const char *zn_map_hint(const ZnMarker *marker);
ZnPoint zn_map_project(ZnPoint point, ZnBounds data, ZnBounds viewport);
ZnMapView zn_map_initial_view(uint16_t floor, uint16_t zone);
void zn_map_move(ZnMapView *view, const ZnMapArtwork *art, ZnMapInput actions, int stick_x, int stick_y);
ZnMapViewport zn_map_viewport(ZnMapView view, const ZnMapArtwork *artwork, ZnMapRect panel);

void zn_panel_switch_column(ZnMapPanel *panel, int delta);
uint16_t zn_cat_nav_count(void);
bool zn_cat_nav_item(uint16_t nav_idx, ZnCatNavItem *out);
void zn_panel_move_categories(ZnMapPanel *panel, int dx, int dy);
void zn_panel_activate_category_cursor(ZnMapPanel *panel, const ZnGameSnapshot *snapshot);
void zn_panel_clear_focus(ZnMapPanel *panel, const ZnGameSnapshot *snapshot);
bool zn_panel_category_visible(const ZnMapPanel *panel, uint16_t cat_index);
bool zn_panel_section_focused(const ZnMapPanel *panel, uint8_t section);
void zn_panel_global_counts(const ZnGameSnapshot *snapshot, uint16_t cat_index, int *out_done, int *out_total);

#endif
