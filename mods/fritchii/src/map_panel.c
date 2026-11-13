#include "map_panel.h"

ZnMapController *zn_map_controller(ZnMapController states[static ZN_MAP_CONTROLLER_COUNT],
                                  uint32_t controller, uint32_t style) {
    if ((controller != 0 && controller != 0x20) || style >= ZN_MAP_CONTROLLER_STYLES) return NULL;
    return &states[(controller == 0 ? 0 : ZN_MAP_CONTROLLER_STYLES) + style];
}

bool zn_map_can_draw(int width, int height) {
    return width >= 560 && height >= 350;
}

ZnMapInput zn_map_pressed(uint32_t *held, ZnMapInput current) {
    ZnMapInput pressed = current & ~*held;
    *held = current;
    return pressed;
}

static bool in_zone(const ZnMapPanel *panel, const ZnMarker *marker) {
    return marker->zone == panel->zone && (marker->age & panel->age) != 0;
}

static bool valid_bounds(ZnBounds b) {
    return b.max_x > b.min_x && b.max_y > b.min_y;
}

static float clampf(float value, float low, float high) {
    return value < low ? low : value > high ? high : value;
}

static uint64_t all_grouped_mask(void) {
    uint64_t mask = 0;
    for (uint16_t s = 0; s < zn_section_count; ++s) {
        for (uint16_t k = 0; k < zn_sections[s].category_count; ++k) {
            uint16_t idx = zn_sections[s].first_category + k;
            if (idx < 64) mask |= (1ULL << idx);
        }
    }
    return mask;
}

static uint64_t section_mask(uint8_t section) {
    if (section >= zn_section_count) return 0;
    uint64_t mask = 0;
    for (uint16_t k = 0; k < zn_sections[section].category_count; ++k) {
        uint16_t idx = zn_sections[section].first_category + k;
        if (idx < 64) mask |= (1ULL << idx);
    }
    return mask;
}

bool zn_panel_category_visible(const ZnMapPanel *panel, uint16_t cat_index) {
    if (panel->focus_mask == 0) return true;
    if (cat_index >= 64) return false;
    return (panel->focus_mask & (1ULL << cat_index)) != 0;
}

bool zn_panel_section_focused(const ZnMapPanel *panel, uint8_t section) {
    uint64_t sm = section_mask(section);
    return panel->focus_mask != 0 && sm != 0 && (panel->focus_mask & sm) == sm;
}

void zn_panel_global_counts(const ZnGameSnapshot *snapshot, uint16_t cat_index, int *out_done, int *out_total) {
    int done = 0;
    int total = cat_index < zn_category_count ? zn_category_meta[cat_index].total_count : 0;
    if (snapshot && snapshot->ready && cat_index < zn_category_count) {
        for (size_t i = 0; i < zn_marker_count; ++i) {
            if (zn_markers[i].category == cat_index &&
                zn_marker_progress(&zn_markers[i], snapshot) == ZN_OBTAINED) {
                ++done;
            }
        }
    }
    if (out_done) *out_done = done;
    if (out_total) *out_total = total;
}

uint16_t zn_cat_nav_count(void) {
    uint16_t count = 0;
    for (uint16_t s = 0; s < zn_section_count; ++s) {
        count = (uint16_t)(count + 1 + zn_sections[s].category_count);
    }
    return count;
}

bool zn_cat_nav_item(uint16_t nav_idx, ZnCatNavItem *out) {
    uint16_t cursor = 0;
    uint16_t row = 0;
    for (uint16_t s = 0; s < zn_section_count; ++s) {
        if (cursor == nav_idx) {
            if (out) *out = (ZnCatNavItem){ .is_focus = true, .section = (uint8_t)s, .col = 0, .row = row, .cat_index = ZN_NO_INDEX };
            return true;
        }
        ++cursor;
        ++row;
        uint16_t cnt = zn_sections[s].category_count;
        uint16_t rows_in_sec = (uint16_t)((cnt + 3) / 4);
        if (nav_idx < cursor + cnt) {
            uint16_t off = (uint16_t)(nav_idx - cursor);
            if (out) {
                *out = (ZnCatNavItem){
                    .is_focus = false,
                    .section = (uint8_t)s,
                    .col = (uint8_t)(off % 4),
                    .row = (uint16_t)(row + off / 4),
                    .cat_index = (uint16_t)(zn_sections[s].first_category + off),
                };
            }
            return true;
        }
        cursor = (uint16_t)(cursor + cnt);
        row = (uint16_t)(row + rows_in_sec);
    }
    return false;
}

void zn_panel_switch_column(ZnMapPanel *panel, int delta) {
    int c = ((int)panel->active_col + (delta % ZN_COL_COUNT) + ZN_COL_COUNT) % ZN_COL_COUNT;
    panel->active_col = (uint8_t)c;
}

void zn_panel_move_categories(ZnMapPanel *panel, int dx, int dy) {
    uint16_t total = zn_cat_nav_count();
    if (!total) return;
    if (panel->cat_cursor >= total) panel->cat_cursor = 0;

    ZnCatNavItem cur;
    if (!zn_cat_nav_item(panel->cat_cursor, &cur)) return;

    if (dx != 0 && !cur.is_focus) {
        int next_idx = (int)panel->cat_cursor + (dx < 0 ? -1 : 1);
        ZnCatNavItem cand;
        if (next_idx >= 0 && next_idx < total && zn_cat_nav_item((uint16_t)next_idx, &cand) &&
            !cand.is_focus && cand.row == cur.row) {
            panel->cat_cursor = (uint16_t)next_idx;
            panel->last_cat_col = cand.col;
            return;
        }
    }

    if (dy != 0) {
        int target_row = (int)cur.row + (dy < 0 ? -1 : 1);
        if (target_row < 0) target_row = 0;
        uint16_t best = panel->cat_cursor;
        int best_dist = 999;
        uint8_t desired_col = cur.is_focus ? panel->last_cat_col : cur.col;
        for (uint16_t i = 0; i < total; ++i) {
            ZnCatNavItem cand;
            if (!zn_cat_nav_item(i, &cand) || (int)cand.row != target_row) continue;
            if (cand.is_focus) { best = i; break; }
            int d = (int)cand.col - (int)desired_col;
            if (d < 0) d = -d;
            if (d < best_dist) { best_dist = d; best = i; }
        }
        panel->cat_cursor = best;
        if (zn_cat_nav_item(best, &cur) && !cur.is_focus) panel->last_cat_col = cur.col;
    }
}

static bool floor_in_zone(uint16_t floor, uint16_t zone, uint8_t age) {
    const ZnMapArtwork *art = &zn_artwork[floor];
    if (!(art->age & age)) return false;
    if (art->map_id != 65000) return art->zone == zone;
    for (uint16_t i = 0; i < zn_floor_count; ++i) {
        if (zn_artwork[i].map_id != 65000 && zn_artwork[i].zone == zone) return false;
    }
    return valid_bounds(zn_world_bounds[zone][art->age == ZN_ADULT]);
}

static uint16_t next_floor(const ZnMapPanel *panel, uint16_t current) {
    uint16_t start = current == ZN_NO_INDEX ? 0 : (current + 1) % zn_floor_count;
    for (uint16_t offset = 0; offset < zn_floor_count; ++offset) {
        uint16_t floor = (start + offset) % zn_floor_count;
        if (floor_in_zone(floor, panel->zone, panel->age)) return floor;
    }
    return ZN_NO_INDEX;
}

uint16_t zn_map_next_variant(const ZnMapPanel *panel) {
    if (panel->floor < zn_floor_count && zn_artwork[panel->floor].map_id != 65000)
        return next_floor(panel, panel->floor);

    ZnMapPanel other = *panel;
    uint8_t age = panel->floor < zn_floor_count ? zn_artwork[panel->floor].age : panel->age;
    other.age = age == ZN_CHILD ? ZN_ADULT : ZN_CHILD;
    uint16_t floor = next_floor(&other, ZN_NO_INDEX);
    return floor == ZN_NO_INDEX ? panel->floor : floor;
}

bool zn_map_matches(const ZnMapPanel *panel, const ZnMarker *marker, const ZnGameSnapshot *snapshot) {
    return in_zone(panel, marker) && marker->floor == panel->floor &&
        zn_panel_category_visible(panel, marker->category) &&
        (panel->progress == 0 || panel->progress == 1 + zn_marker_progress(marker, snapshot));
}

static void move_selection(ZnMapPanel *panel, const ZnGameSnapshot *snapshot, int direction) {
    uint16_t first = ZN_NO_INDEX;
    uint16_t last = ZN_NO_INDEX;
    uint16_t before = ZN_NO_INDEX;
    uint16_t after = ZN_NO_INDEX;
    for (uint16_t i = 0; i < zn_marker_count; ++i) {
        if (!zn_map_matches(panel, &zn_markers[i], snapshot)) continue;
        if (first == ZN_NO_INDEX) first = i;
        last = i;
        if (i < panel->selected) before = i;
        if (i > panel->selected && after == ZN_NO_INDEX) after = i;
    }
    if (direction < 0) {
        panel->selected = before != ZN_NO_INDEX ? before : last;
        panel->desc_scroll = 0;
    } else if (direction > 0) {
        panel->selected = after != ZN_NO_INDEX ? after : first;
        panel->desc_scroll = 0;
    } else if (panel->selected >= zn_marker_count ||
               !zn_map_matches(panel, &zn_markers[panel->selected], snapshot)) {
        panel->selected = first;
        panel->desc_scroll = 0;
    }
}

void zn_panel_activate_category_cursor(ZnMapPanel *panel, const ZnGameSnapshot *snapshot) {
    ZnCatNavItem item;
    if (!zn_cat_nav_item(panel->cat_cursor, &item)) return;
    uint64_t all = all_grouped_mask();
    if (item.is_focus) {
        uint64_t sm = section_mask(item.section);
        if (panel->focus_mask == 0) {
            panel->focus_mask = sm;
        } else if ((panel->focus_mask & sm) == sm) {
            panel->focus_mask &= ~sm;
        } else {
            panel->focus_mask |= sm;
        }
    } else if (item.cat_index < 64) {
        uint64_t bit = 1ULL << item.cat_index;
        if (panel->focus_mask == 0) panel->focus_mask = bit;
        else panel->focus_mask ^= bit;
    }
    if ((panel->focus_mask & all) == 0 || (panel->focus_mask & all) == all) {
        panel->focus_mask = 0;
    }
    move_selection(panel, snapshot, 0);
}

void zn_panel_clear_focus(ZnMapPanel *panel, const ZnGameSnapshot *snapshot) {
    panel->focus_mask = 0;
    move_selection(panel, snapshot, 0);
}

static void center_view_on_selected(ZnMapPanel *panel) {
    if (panel->selected >= zn_marker_count || panel->floor >= zn_floor_count) return;
    const ZnMapArtwork *art = &zn_artwork[panel->floor];
    const ZnMarker *m = &zn_markers[panel->selected];
    panel->view.center.x = clampf(m->x, art->bounds.min_x, art->bounds.max_x);
    panel->view.center.y = clampf(m->y, art->bounds.min_y, art->bounds.max_y);
}

void zn_map_update(ZnMapPanel *panel, ZnMapInput input, const ZnGameSnapshot *snapshot) {
    if (input & ZN_MAP_TOGGLE) {
        if (panel->open) {
            panel->open = false;
        } else {
            *panel = (ZnMapPanel){
                .open = true,
                .age = snapshot->ready ? snapshot->age : ZN_ALL_AGES,
                .active_col = ZN_COL_CATEGORIES,
                .zone = snapshot->ready && snapshot->zone < zn_zone_count ? snapshot->zone : 0,
                .selected = ZN_NO_INDEX,
                .focus_mask = 0,
            };
            panel->floor = next_floor(panel, ZN_NO_INDEX);
            if (panel->floor < zn_floor_count && zn_artwork[panel->floor].map_id == 65000)
                panel->age = zn_artwork[panel->floor].age;
            panel->view = zn_map_initial_view(panel->floor, panel->zone);
            move_selection(panel, snapshot, 0);
        }
        return;
    }
    if (!panel->open) return;
    if (input & ZN_MAP_BACK) {
        if (panel->focus_mask != 0) zn_panel_clear_focus(panel, snapshot);
        else panel->open = false;
        return;
    }

    if (input & ZN_MAP_PREV_COL) zn_panel_switch_column(panel, -1);
    if (input & ZN_MAP_NEXT_COL) zn_panel_switch_column(panel, 1);

    if (input & (ZN_MAP_PREV_ZONE | ZN_MAP_NEXT_ZONE)) {
        panel->zone = (panel->zone + ((input & ZN_MAP_PREV_ZONE) ? zn_zone_count - 1 : 1)) % zn_zone_count;
        panel->floor = next_floor(panel, ZN_NO_INDEX);
        panel->view = zn_map_initial_view(panel->floor, panel->zone);
        panel->selected = ZN_NO_INDEX;
        panel->desc_scroll = 0;
        move_selection(panel, snapshot, 0);
    }
    if (input & ZN_MAP_NEXT_AGE_FLOOR) {
        uint16_t nf = zn_map_next_variant(panel);
        if (nf != ZN_NO_INDEX && nf != panel->floor) {
            panel->floor = nf;
            if (zn_artwork[nf].map_id == 65000) panel->age = zn_artwork[nf].age;
            panel->view = zn_map_initial_view(nf, panel->zone);
            move_selection(panel, snapshot, 0);
        }
    }
    if (input & ZN_MAP_NEXT_PROGRESS) {
        panel->progress = (panel->progress + 1) % 4;
        move_selection(panel, snapshot, 0);
    }

    if (panel->active_col == ZN_COL_CATEGORIES) {
        int dx = (input & ZN_MAP_NAV_LEFT) ? -1 : (input & ZN_MAP_NAV_RIGHT) ? 1 : 0;
        int dy = (input & ZN_MAP_NAV_UP) ? -1 : (input & ZN_MAP_NAV_DOWN) ? 1 : 0;
        if (dx != 0 || dy != 0) zn_panel_move_categories(panel, dx, dy);
        if (input & ZN_MAP_ACCEPT) zn_panel_activate_category_cursor(panel, snapshot);
    } else if (panel->active_col == ZN_COL_MAP) {
        if (input & (ZN_MAP_NAV_UP | ZN_MAP_ZOOM_IN) && panel->floor < zn_floor_count) {
            zn_map_move(&panel->view, &zn_artwork[panel->floor], ZN_MAP_ZOOM_IN, 0, 0);
        }
        if (input & (ZN_MAP_NAV_DOWN | ZN_MAP_ZOOM_OUT) && panel->floor < zn_floor_count) {
            zn_map_move(&panel->view, &zn_artwork[panel->floor], ZN_MAP_ZOOM_OUT, 0, 0);
        }
        int dir = (input & ZN_MAP_NAV_LEFT) ? -1 : (input & ZN_MAP_NAV_RIGHT) ? 1 : 0;
        if (dir != 0) move_selection(panel, snapshot, dir);
        if (input & ZN_MAP_ACCEPT) center_view_on_selected(panel);
    } else {
        int dir = (input & ZN_MAP_NAV_UP) ? -1 : (input & ZN_MAP_NAV_DOWN) ? 1 : 0;
        if (dir != 0) move_selection(panel, snapshot, dir);
        if (input & ZN_MAP_NAV_RIGHT) ++panel->desc_scroll;
        if ((input & ZN_MAP_NAV_LEFT) && panel->desc_scroll > 0) --panel->desc_scroll;
        if (input & ZN_MAP_ACCEPT) center_view_on_selected(panel);
    }
}

const char *zn_map_hint(const ZnMarker *marker) {
    return marker->hint[0] != '\0' ? marker->hint : marker->name;
}

ZnPoint zn_map_project(ZnPoint point, ZnBounds data, ZnBounds viewport) {
    float width = data.max_x - data.min_x;
    float height = data.max_y - data.min_y;
    float x = width > 0.0f ? (point.x - data.min_x) / width : 0.5f;
    float y = height > 0.0f ? (data.max_y - point.y) / height : 0.5f;
    return (ZnPoint){viewport.min_x + x * (viewport.max_x - viewport.min_x),
                     viewport.min_y + y * (viewport.max_y - viewport.min_y)};
}

ZnMapView zn_map_initial_view(uint16_t floor, uint16_t zone) {
    if (floor >= zn_floor_count || zone >= zn_zone_count) return (ZnMapView){0};
    const ZnMapArtwork *art = &zn_artwork[floor];
    ZnBounds focus = art->bounds;
    if (art->map_id == 65000) {
        ZnBounds area = zn_world_bounds[zone][art->age == ZN_ADULT];
        if (valid_bounds(area)) {
            float px = (area.max_x - area.min_x) * 0.12f;
            float py = (area.max_y - area.min_y) * 0.12f;
            ZnBounds padded = {
                clampf(area.min_x - px, focus.min_x, focus.max_x),
                clampf(area.min_y - py, focus.min_y, focus.max_y),
                clampf(area.max_x + px, focus.min_x, focus.max_x),
                clampf(area.max_y + py, focus.min_y, focus.max_y),
            };
            if (valid_bounds(padded)) focus = padded;
        }
    }
    return (ZnMapView){focus, {(focus.min_x + focus.max_x) / 2, (focus.min_y + focus.max_y) / 2}, 1};
}

void zn_map_move(ZnMapView *view, const ZnMapArtwork *art, ZnMapInput actions, int stick_x, int stick_y) {
    if (view->zoom < 1.0f) return;
    if (actions & ZN_MAP_ZOOM_IN) view->zoom = clampf(view->zoom * 1.25f, 1, 4);
    if (actions & ZN_MAP_ZOOM_OUT) view->zoom = clampf(view->zoom / 1.25f, 1, 4);
    float dx = (view->focus.max_x - view->focus.min_x) / (view->zoom * 36.0f);
    float dy = (view->focus.max_y - view->focus.min_y) / (view->zoom * 36.0f);
    view->center.x += (stick_x < -6500 || stick_x > 6500) ? dx * stick_x / 32767.0f : 0;
    view->center.y += (stick_y < -6500 || stick_y > 6500) ? dy * stick_y / 32767.0f : 0;
    float half_w = dx * 18, half_h = dy * 18;
    view->center.x = clampf(view->center.x, art->bounds.min_x + half_w, art->bounds.max_x - half_w);
    view->center.y = clampf(view->center.y, art->bounds.min_y + half_h, art->bounds.max_y - half_h);
}

ZnMapViewport zn_map_viewport(ZnMapView view, const ZnMapArtwork *art, ZnMapRect panel) {
    if (art->width == 0 || art->height == 0 || !valid_bounds(art->bounds) ||
        !valid_bounds(view.focus) || panel.w <= 0 || panel.h <= 0) return (ZnMapViewport){0};
    float sx = art->width / (art->bounds.max_x - art->bounds.min_x);
    float sy = art->height / (art->bounds.max_y - art->bounds.min_y);
    float zoom = clampf(view.zoom, 1, 4);
    int w = (int)clampf((view.focus.max_x - view.focus.min_x) * sx / zoom + 0.5f, 1, art->width);
    int h = (int)clampf((view.focus.max_y - view.focus.min_y) * sy / zoom + 0.5f, 1, art->height);
    int x = (int)clampf((view.center.x - art->bounds.min_x) * sx - w / 2.0f + 0.5f, 0, art->width - w);
    int y = (int)clampf((art->bounds.max_y - view.center.y) * sy - h / 2.0f + 0.5f, 0, art->height - h);
    float scale_x = (float)panel.w / w;
    float scale_y = (float)panel.h / h;
    float scale = scale_x < scale_y ? scale_x : scale_y;
    int dw = (int)clampf(w * scale + 0.5f, 1, panel.w);
    int dh = (int)clampf(h * scale + 0.5f, 1, panel.h);
    return (ZnMapViewport){
        {art->bounds.min_x + x / sx, art->bounds.max_y - (y + h) / sy,
         art->bounds.min_x + (x + w) / sx, art->bounds.max_y - y / sy},
        {x, y, w, h}, {panel.x + (panel.w - dw) / 2, panel.y + (panel.h - dh) / 2, dw, dh},
    };
}
