#include <assert.h>
#include "../src/map_panel.h"

int main(void) {
    ZnMapPanel panel = {0};
    ZnGameSnapshot snapshot = {.ready = true, .age = ZN_CHILD, .zone = 0};
    ZnMapController controllers[ZN_MAP_CONTROLLER_COUNT] = {0};
    ZnMapController *primary = zn_map_controller(controllers, 0, 0);
    ZnMapController *handheld = zn_map_controller(controllers, 0x20, 1);
    assert(primary && handheld && primary != handheld);
    assert(zn_map_controller(controllers, 1, 0) == 0);
    assert(zn_map_controller(controllers, 0, 5) == 0);
    assert(!zn_map_can_draw(559, 720) && !zn_map_can_draw(1280, 349));
    assert(zn_map_can_draw(560, 350));

    zn_map_update(&panel, zn_map_pressed(&primary->held, ZN_MAP_TOGGLE | ZN_MAP_ACCEPT), &snapshot);
    assert(panel.open && panel.active_col == ZN_COL_CATEGORIES && panel.focus_mask == 0);
    assert(zn_map_pressed(&handheld->held, 0) == 0);

    /* L / R cycle columns cyclically: 0 -> 1 -> 2 -> 0 and backwards */
    zn_map_update(&panel, ZN_MAP_NEXT_COL, &snapshot);
    assert(panel.active_col == ZN_COL_MAP);
    zn_map_update(&panel, ZN_MAP_NEXT_COL, &snapshot);
    assert(panel.active_col == ZN_COL_OBJECTIVES);
    zn_map_update(&panel, ZN_MAP_NEXT_COL, &snapshot);
    assert(panel.active_col == ZN_COL_CATEGORIES);
    zn_map_update(&panel, ZN_MAP_PREV_COL, &snapshot);
    assert(panel.active_col == ZN_COL_OBJECTIVES);
    zn_map_update(&panel, ZN_MAP_NEXT_COL, &snapshot);
    assert(panel.active_col == ZN_COL_CATEGORIES);

    /* Category grid & Focus navigation: cursor 0 = Section 0 Focus, Down -> Sec 0 item 0 */
    ZnCatNavItem item = {0};
    assert(zn_cat_nav_item(panel.cat_cursor, &item) && item.is_focus && item.section == 0);
    zn_map_update(&panel, ZN_MAP_NAV_DOWN, &snapshot);
    assert(zn_cat_nav_item(panel.cat_cursor, &item) && !item.is_focus && item.col == 0 && item.cat_index == 0);
    zn_map_update(&panel, ZN_MAP_NAV_RIGHT, &snapshot);
    zn_map_update(&panel, ZN_MAP_NAV_RIGHT, &snapshot);
    zn_map_update(&panel, ZN_MAP_NAV_RIGHT, &snapshot); /* stops at col 2 in 3-item section */
    assert(zn_cat_nav_item(panel.cat_cursor, &item) && item.col == 2 && item.cat_index == 2);

    /* Activating category focuses only that category; A again restores all; Section Focus turns on whole section */
    zn_map_update(&panel, ZN_MAP_ACCEPT, &snapshot);
    assert(panel.focus_mask == (1ULL << 2));
    assert(zn_panel_category_visible(&panel, 2) && !zn_panel_category_visible(&panel, 0));
    zn_map_update(&panel, ZN_MAP_ACCEPT, &snapshot);
    assert(panel.focus_mask == 0); /* empty reverts to all */

    zn_map_update(&panel, ZN_MAP_NAV_DOWN, &snapshot); /* Sec 1 Focus button */
    assert(zn_cat_nav_item(panel.cat_cursor, &item) && item.is_focus && item.section == 1);
    zn_map_update(&panel, ZN_MAP_ACCEPT, &snapshot);
    assert(zn_panel_section_focused(&panel, 1));
    assert(zn_panel_category_visible(&panel, zn_sections[1].first_category));
    assert(!zn_panel_category_visible(&panel, 0));

    /* B clears active Focus before closing panel */
    zn_map_update(&panel, ZN_MAP_BACK, &snapshot);
    assert(panel.open && panel.focus_mask == 0);
    zn_map_update(&panel, ZN_MAP_BACK, &snapshot);
    assert(!panel.open);

    /* Global counters for Gold Skulltulas (64001 = index 5): count obtained markers matching snapshot */
    const uint16_t skull_cat = zn_sections[1].first_category + 2;
    size_t signs = 0;
    for (size_t i = 0; i < zn_marker_count && signs < 17; ++i) {
        if (zn_markers[i].category == skull_cat &&
            zn_markers[i].source == ZN_SOURCE_COLLECT_SIGN && zn_markers[i].game_id != 0) {
            snapshot.obtained[signs++] = zn_markers[i].game_id;
        }
    }
    snapshot.collect_sign_known = true;
    snapshot.obtained_count = (uint16_t)signs;
    int done = -1, total = -1;
    zn_panel_global_counts(&snapshot, skull_cat, &done, &total);
    assert(done == 17 && total == 100);

    ZnMarker no_hint = {.name = "Ficha sin pista", .hint = ""};
    assert(zn_map_hint(&no_hint) == no_hint.name);
    ZnPoint point = zn_map_project((ZnPoint){7, 9}, (ZnBounds){7, 9, 7, 9},
                                   (ZnBounds){0, 10, 100, 70});
    assert(point.x == 50 && point.y == 40);
    point = zn_map_project((ZnPoint){0, 10}, (ZnBounds){0, 0, 10, 10},
                           (ZnBounds){0, 0, 100, 100});
    assert(point.x == 0 && point.y == 0);

    ZnMapArtwork art = {.width = 256, .height = 256, .bounds = {0, -256, 256, 0}};
    ZnMapView view = {.focus = art.bounds, .center = {128, -128}, .zoom = 2};
    ZnMapViewport crop = zn_map_viewport(view, &art, (ZnMapRect){20, 30, 256, 128});
    assert(crop.source.x == 64 && crop.source.y == 64 && crop.source.w == 128 && crop.source.h == 128);
    assert(crop.destination.x == 84 && crop.destination.y == 30);
    ZnPoint landmark = zn_map_project((ZnPoint){128, -128}, crop.visible,
        (ZnBounds){84, 30, 212, 158});
    assert(landmark.x == 148 && landmark.y == 94);
    view.center.x = 160;
    crop = zn_map_viewport(view, &art, (ZnMapRect){20, 30, 256, 128});
    assert(crop.source.x == 96 && crop.visible.min_x == 96);
    snapshot.age = ZN_ADULT;
    const uint16_t field = zn_resolve_zone((const char *const[4]){"HyruleField", "", "", ""});
    snapshot.zone = field;
    zn_map_update(&panel, ZN_MAP_TOGGLE, &snapshot);
    assert(panel.open && panel.floor < zn_floor_count && zn_artwork[panel.floor].id == 650001);
    zn_map_update(&panel, ZN_MAP_NEXT_AGE_FLOOR, &snapshot);
    assert(panel.age == ZN_CHILD && zn_artwork[panel.floor].id == 650000);
    zn_map_update(&panel, ZN_MAP_NEXT_AGE_FLOOR, &snapshot);
    assert(panel.age == ZN_ADULT && zn_artwork[panel.floor].id == 650001);
    snapshot.ready = false;
    zn_map_update(&panel, ZN_MAP_TOGGLE, &snapshot);
    assert(!panel.open);

    uint16_t first_dungeon_floor = ZN_NO_INDEX;
    for (uint16_t i = 0; i < zn_floor_count; ++i)
        if (zn_artwork[i].id == 640080) first_dungeon_floor = i;
    assert(first_dungeon_floor < zn_floor_count);
    ZnMapPanel dungeon = {.open = true, .age = ZN_CHILD, .floor = first_dungeon_floor,
                          .zone = zn_artwork[first_dungeon_floor].zone};
    zn_map_update(&dungeon, ZN_MAP_NEXT_AGE_FLOOR, &snapshot);
    assert(dungeon.age == ZN_CHILD && zn_artwork[dungeon.floor].id == 640081);
    for (int i = 1; i < 9; ++i) zn_map_update(&dungeon, ZN_MAP_NEXT_AGE_FLOOR, &snapshot);
    assert(dungeon.age == ZN_CHILD && dungeon.floor == first_dungeon_floor);

    for (uint16_t i = 0; i < zn_floor_count; ++i) {
        if (zn_artwork[i].id != 640076) continue;
        ZnMapPanel single = {.open = true, .age = ZN_ADULT, .floor = i, .zone = zn_artwork[i].zone,
                             .view = zn_map_initial_view(i, zn_artwork[i].zone)};
        single.view.zoom = 2;
        zn_map_update(&single, ZN_MAP_NEXT_AGE_FLOOR, &snapshot);
        assert(single.age == ZN_ADULT && single.floor == i && single.view.zoom == 2);
    }

    uint16_t empty = ZN_NO_INDEX;
    for (uint16_t floor = 0; floor < zn_floor_count && empty == ZN_NO_INDEX; ++floor) {
        bool any = false;
        for (size_t i = 0; i < zn_marker_count && !any; ++i) any = zn_markers[i].floor == floor;
        if (!any) empty = floor;
    }
    assert(empty != ZN_NO_INDEX && empty < zn_floor_count);
    ZnMapPanel empty_panel = {.zone = zn_artwork[empty].zone, .age = zn_artwork[empty].age,
        .floor = empty, .focus_mask = 0, .selected = ZN_NO_INDEX,
        .view = zn_map_initial_view(empty, zn_artwork[empty].zone)};
    assert(empty_panel.zone < zn_zone_count && empty_panel.view.focus.max_x > empty_panel.view.focus.min_x);
    snapshot.ready = true;
    snapshot.age = empty_panel.age;
    snapshot.zone = empty_panel.zone;
    for (size_t i = 0; i < zn_marker_count; ++i) {
        assert(!zn_map_matches(&empty_panel, &zn_markers[i], &snapshot));
    }
}
