#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "hud.h"
#include "hud_icons.h"
#include "map_texture.h"
#include "zn_lang.h"

static const char long_desc_331[] =
    "En la ladera norte junto al arbol marchito del Rancho Lon Lon, coloca una judia magica durante la infancia y vuelve como adulto para subir en la planta flotante hasta la cornisa oculta detras del corral donde descansa la Skulltula dorada esperando la noche tranquila de Hyrule para dejarte el emblema final del sector escondido aqui";

#define MARKER_EX(x_, y_, cat_, name_, hint_) {.x = x_, .y = y_, .category = cat_, .name = name_, .hint = hint_}
#define MARKER(x_, y_) MARKER_EX(x_, y_, 0, "Skulltula de prueba", long_desc_331)

const ZnMarker zn_markers[] = {
    MARKER(0, 0), MARKER(20, 20), MARKER(20, 20), MARKER(60, 20), MARKER(100, 20),
    MARKER(140, 20), MARKER(180, 20), MARKER(220, 20), MARKER(20, 60), MARKER(60, 60),
    MARKER(100, 60), MARKER(140, 60), MARKER(180, 60), MARKER_EX(239, 119, 1, "Pieza de corazon", "Salta desde la cascada con la cuco"),
};
const size_t zn_marker_count = sizeof zn_markers / sizeof zn_markers[0];
const ZnLabel zn_zones[] = {{"Campo de Hyrule junto a los lagos y cascadas reales de Zelda Notes", 0}};
const ZnLabel zn_floors[] = {{"General", 0}, {"2F", 0}};
const ZnLabel zn_categories[] = {
    {"Skulltulas doradas", 0xd8b25a},
    {"Piezas de corazon", 0xe05278},
    {"Grandes Poes", 0x3dc47e},
    {"Botellas", 0x9fc4a2},
};
const ZnCategoryIcon zn_category_icons[] = {ZN_ICON_SKULLTULA, ZN_ICON_HEART, ZN_ICON_GENERIC, ZN_ICON_BOTTLE};
const ZnSection zn_sections[] = {
#if ZN_LANG_EN
    {"collect", "Collectibles", 0, 4},
#else
    {"collect", "Coleccionables", 0, 4},
#endif
};
const ZnCategoryMeta zn_category_meta[] = {
    {64001u, 0, 0, 100},
    {64002u, 0, 1, 36},
    {64003u, 0, 2, 10},
    {64006u, 0, 3, 5},
};
const uint16_t zn_zone_count = 1, zn_floor_count = 2, zn_category_count = 4, zn_section_count = 1;
const ZnMapArtwork zn_artwork[] = {
    {640057, 64005, 512, 512, 0, ZN_ALL_AGES, {0, 0, 512, 512}},
    {640059, 64005, 512, 512, 0, ZN_ALL_AGES, {0, 0, 512, 512}},
};

static const ZnMapViewport view = {
    .visible = {0, 0, 239, 119},
    .source = {0, 0, 240, 120},
    .destination = {10, 10, 240, 120},
};
static ZnMapRect terrain;
static ZnMapRect terrain_box;
static int frame_w, frame_h;
static bool compose_ready = true, texture_ready = true, atlas_ready = true;
static bool empty_label, fallback_label, col_cats_seen, col_map_seen, col_obj_seen, guide_seen, active_tag_seen;
static int badges, badges_at_overlap, text_calls, rects;
static int badge_size;
static int atlas_scale, category_labels, objective_text_scale;
static bool floor_hint_seen, objectives_hint_seen, in_view_seen, section_hint_seen, cat_hearts_seen, footer_ok;
static bool map_loading, loading_label;
static int compose_calls, compose_pins;
static bool strict_bounds;
static uint32_t last_color;
static ZnProgress progress = ZN_PENDING;

typedef struct { int x, y, w, h; ZnSpriteSlot slot; uint8_t icon_idx; } BlitRec;
static BlitRec blits[128];
static int blit_count;

typedef struct { int x, y, w, h; } RectRec;
static RectRec drawn_rects[32768];
static char drawn_desc[1024];
static size_t drawn_desc_len;
static bool in_desc_body;

bool zn_map_can_draw(int w, int h) { return w >= 560 && h >= 350; }
ZnMapViewport zn_map_viewport(ZnMapView map, const ZnMapArtwork *art, ZnMapRect panel) {
    (void)map; (void)art;
    terrain_box = panel;
    ZnMapViewport result = view;
    result.destination = panel;
    return result;
}
bool zn_map_texture_draw(const ZnMapArtwork *art, ZnMapRect src, ZnMapRect dst) {
    (void)art; (void)src;
    if (!texture_ready) return false;
    terrain = dst;
    return true;
}
ZnMapTextureStatus zn_map_texture_compose_and_draw(const ZnMapArtwork *artwork, ZnMapRect crop, ZnMapRect destination,
                                     const ZnComposePin *pins, int pin_count,
                                     bool has_link, int link_x, int link_y, int scale, uint32_t view_hash) {
    (void)artwork; (void)crop; (void)pins; (void)has_link; (void)link_x; (void)link_y; (void)scale; (void)view_hash;
    assert(destination.w <= ZN_MAP_MAX_SIDE && destination.h <= ZN_MAP_VIEW_MAX_H);
    if (map_loading) return ZN_MAP_LOADING;
    if (!compose_ready) return ZN_MAP_UNAVAILABLE;
    terrain = destination;
    ++compose_calls;
    compose_pins = pin_count;
    return ZN_MAP_DRAWN;
}
uint16_t zn_map_next_variant(const ZnMapPanel *panel) { return panel->floor == 0 ? 1 : 0; }
bool zn_icon_atlas_ready(int scale) { atlas_scale = scale; return atlas_ready; }
bool zn_icon_draw(uint8_t icon_index, ZnSpriteSlot slot, int scale, int dx, int dy) {
    if (!atlas_ready || icon_index >= zn_category_count || blit_count >= 128) return false;
    assert(scale == atlas_scale);
    int sz = (slot == ZN_SPRITE_PIN_MINI) ? (scale >= 2 ? 24 : 18) : (scale >= 2 ? 48 : 32);
    blits[blit_count++] = (BlitRec){dx, dy, sz, sz, slot, icon_index};
    return true;
}
bool zn_map_matches(const ZnMapPanel *p, const ZnMarker *m, const ZnGameSnapshot *s) {
    (void)s;
    if (p->selected == ZN_NO_INDEX) return false;
    if (p->focus_mask == 0) return true;
    return ((p->focus_mask >> m->category) & 1ull) != 0;
}
ZnPoint zn_map_project(ZnPoint point, ZnBounds data, ZnBounds dst) {
    float rx = data.max_x > data.min_x ? (point.x - data.min_x) / (data.max_x - data.min_x) : 0.0f;
    float ry = data.max_y > data.min_y ? (point.y - data.min_y) / (data.max_y - data.min_y) : 0.0f;
    return (ZnPoint){dst.min_x + rx * (dst.max_x - dst.min_x), dst.min_y + ry * (dst.max_y - dst.min_y)};
}
ZnProgress zn_marker_progress(const ZnMarker *m, const ZnGameSnapshot *s) { (void)m; (void)s; return progress; }
const char *zn_map_hint(const ZnMarker *m) { return m->hint; }
bool zn_panel_category_visible(const ZnMapPanel *panel, uint16_t cat_index) {
    if (panel->focus_mask == 0) return true;
    return cat_index < 64 && ((panel->focus_mask >> cat_index) & 1ull) != 0;
}
bool zn_panel_section_focused(const ZnMapPanel *panel, uint8_t section) {
    (void)section;
    return panel->focus_mask == 0xFull;
}
void zn_panel_global_counts(const ZnGameSnapshot *snapshot, uint16_t cat_index, int *out_done, int *out_total) {
    (void)snapshot;
    *out_done = 3;
    *out_total = cat_index < zn_category_count ? zn_category_meta[cat_index].total_count : 0;
}
uint16_t zn_cat_nav_count(void) { return 5; }
bool zn_cat_nav_item(uint16_t nav_idx, ZnCatNavItem *out) {
    if (nav_idx >= 5) return false;
    if (nav_idx == 0) *out = (ZnCatNavItem){true, 0, 0, 0, ZN_NO_INDEX};
    else *out = (ZnCatNavItem){false, 0, (uint8_t)(nav_idx - 1), 1, (uint16_t)(nav_idx - 1)};
    return true;
}

void kae_draw_rect(int x, int y, int w, int h, uint32_t rgb) {
    if (strict_bounds) {
        ZnMapRect b = view.destination;
        assert(x >= b.x && y >= b.y && x + w <= b.x + b.w && y + h <= b.y + b.h);
        assert(w > 0 && h > 0);
    }
    if (frame_w) assert(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= frame_w && y + h <= frame_h);
    if (rects < 32768) drawn_rects[rects] = (RectRec){x, y, w, h};
    if (w == badge_size && h == badge_size) {
        ++badges;
        if (x == 30 - badge_size / 2 && y == 30 - badge_size / 2) ++badges_at_overlap;
    }
    ++rects;
    last_color = rgb;
}

int kae_draw_text(int x, int y, int s, uint32_t color, const char *text) {
    (void)color;
    int glyphs = 0;
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p)
        if ((*p & 0xc0) != 0x80) ++glyphs;
    if (frame_w) assert(x >= 0 && y >= 0 && x + glyphs * 8 * s <= frame_w && y + 16 * s <= frame_h);
#if ZN_LANG_EN
    if (strncmp(text, "No markers", 10) == 0) empty_label = true;
    if (strcmp(text, "Map unavailable") == 0) fallback_label = true;
    if (strcmp(text, "Loading map...") == 0) loading_label = true;
    if (strcmp(text, "[Y] Switch floor") == 0) floor_hint_seen = true;
    if (strstr(text, "[Up/Down] Target")) objectives_hint_seen = true;
    if (strncmp(text, "CATEG", 5) == 0) col_cats_seen = true;
    if (strncmp(text, "MAP", 3) == 0) col_map_seen = true;
    if (strncmp(text, "OBJECTIV", 8) == 0) col_obj_seen = true;
    if (strncmp(text, "HOW TO GET", 10) == 0) guide_seen = true;
    if (strcmp(text, "[ACTIVE]") == 0) active_tag_seen = true;
    if (strncmp(text, "In view:", 8) == 0) in_view_seen = true;
    if (strncmp(text, "Section: Collectibles", 21) == 0) section_hint_seen = true;
    if (strcmp(text, "Hearts") == 0) cat_hearts_seen = true;
    if (strncmp(text, "[L/R] Column  ", 14) == 0 && strstr(text, "[Up/Down] Target") && strstr(text, "[B] Close")) footer_ok = true;
#else
    if (strncmp(text, "Sin marcadores", 14) == 0) empty_label = true;
    if (strcmp(text, "Mapa no disponible") == 0) fallback_label = true;
    if (strcmp(text, "Cargando mapa...") == 0) loading_label = true;
    if (strcmp(text, "[Y] Cambiar plano") == 0) floor_hint_seen = true;
    if (strstr(text, "[Arr./Ab.] Objetivo")) objectives_hint_seen = true;
    if (strncmp(text, "CATEG", 5) == 0) col_cats_seen = true;
    if (strncmp(text, "MAPA", 4) == 0) col_map_seen = true;
    if (strncmp(text, "OBJETIV", 7) == 0) col_obj_seen = true;
    if (strncmp(text, "CÓMO CONSEGUIRLO", 13) == 0) guide_seen = true;
    if (strcmp(text, "[ACTIVA]") == 0) active_tag_seen = true;
    if (strncmp(text, "En vista:", 9) == 0) in_view_seen = true;
    if (strncmp(text, "Sección: ", 10) == 0) section_hint_seen = true;
    if (strcmp(text, "P. Coraz.") == 0) cat_hearts_seen = true;
    if (strncmp(text, "[L/R] Columna  ", 15) == 0 && strstr(text, "[Arr./Ab.] Objetivo") && strstr(text, "[B] Cerrar")) footer_ok = true;
#endif
    if (strcmp(text, "Skulltula") == 0) ++category_labels;
    if (strcmp(text, "Skulltula de prueba") == 0 && !guide_seen) objective_text_scale = s;
    if (in_desc_body && !strstr(text, "[L/R]")) {
        size_t len = strlen(text);
        if (drawn_desc_len + len + 2 < sizeof drawn_desc) {
            if (drawn_desc_len) drawn_desc[drawn_desc_len++] = ' ';
            memcpy(drawn_desc + drawn_desc_len, text, len);
            drawn_desc_len += len;
            drawn_desc[drawn_desc_len] = '\0';
        }
    }
#if ZN_LANG_EN
    if (guide_seen && strstr(text, " | ") && (strstr(text, "Pending") || strstr(text, "Collected") || strstr(text, "No data"))) {
#else
    if (guide_seen && strstr(text, " | ") && (strstr(text, "Pendiente") || strstr(text, "Obtenido") || strstr(text, "Sin datos"))) {
#endif
        in_desc_body = true;
    }
    ++text_calls;
    return x + glyphs * 8 * s;
}

int kae_text_width(int s, const char *text) {
    int glyphs = 0;
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p)
        if ((*p & 0xc0) != 0x80) ++glyphs;
    return glyphs * 8 * s;
}

static bool rects_overlap(int ax, int ay, int aw, int ah, int bx, int by, int bw, int bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

static void reset(int s) {
    badge_size = ZN_ICON_BADGE_SIZE * s;
    badges = badges_at_overlap = text_calls = rects = blit_count = compose_calls = compose_pins = 0;
    last_color = 0;
    category_labels = objective_text_scale = 0;
    floor_hint_seen = objectives_hint_seen = loading_label = false;
    in_view_seen = section_hint_seen = cat_hearts_seen = footer_ok = false;
    drawn_desc_len = 0;
    drawn_desc[0] = '\0';
    in_desc_body = false;
    empty_label = fallback_label = col_cats_seen = col_map_seen = col_obj_seen = guide_seen = active_tag_seen = false;
}

int main(void) {
    ZnGameSnapshot snapshot = {.ready = true};
    ZnMapPanel panel = {.selected = 2, .active_col = ZN_COL_CATEGORIES};
    strict_bounds = true;
    for (int s = 1; s <= 2; ++s) {
        reset(s);
        zn_draw_map_markers(&panel, &snapshot, view, s);
        assert(badges > 0 && rects < 300);
    }
    strict_bounds = false;

    static const int sizes[][2] = {{560, 350}, {1280, 720}, {1920, 1080}, {2560, 1440}};
    for (unsigned i = 0; i < sizeof sizes / sizeof sizes[0]; ++i) {
        frame_w = sizes[i][0];
        frame_h = sizes[i][1];
        KaeFrame frame = {.width = frame_w, .height = frame_h};
        int s = (frame_h >= 1000 && frame_w >= 1120) ? 2 : 1;

        /* Normal 3-column draw with GPU atlas + CPU pin map composition */
        reset(s);
        compose_ready = texture_ready = atlas_ready = true;
        panel.selected = 2;
        panel.active_col = ZN_COL_OBJECTIVES;
        zn_map_draw(&frame, &panel, &snapshot);

        assert(col_cats_seen && col_map_seen && col_obj_seen && guide_seen);
        if (frame_w >= 1280) assert(active_tag_seen);
        if (frame_w >= 1280 && !(floor_hint_seen && objectives_hint_seen && in_view_seen && section_hint_seen && cat_hearts_seen && footer_ok)) {
            fprintf(stderr, "Missing UI flags at %dx%d: floor=%d obj=%d in_view=%d sec=%d hearts=%d footer=%d\n",
                    frame_w, frame_h, floor_hint_seen, objectives_hint_seen, in_view_seen, section_hint_seen, cat_hearts_seen, footer_ok);
            assert(0);
        }
        if (frame_w >= 1280) assert(category_labels == 1 && objective_text_scale == s);
        assert(compose_calls == 1 && compose_pins > 0);
        assert(blit_count >= (frame_w >= 1280 ? 8 : 1)); /* category tiles + objective pins */
        assert(rects < 2048);
        assert(terrain.w > 0 && terrain.h > 0);
        if (frame_w >= 1280 && strcmp(drawn_desc, long_desc_331) != 0) {
            fprintf(stderr, "Guide at %dx%d: %s\n", frame_w, frame_h, drawn_desc);
            assert(0);
        }

        /* Crucial NVN rule: no kae_draw_rect may overlap any GPU-blitted icon or composed map */
        for (int r = 0; r < rects && r < 32768; ++r) {
            assert(!rects_overlap(drawn_rects[r].x, drawn_rects[r].y, drawn_rects[r].w, drawn_rects[r].h,
                                  terrain.x, terrain.y, terrain.w, terrain.h));
            for (int b = 0; b < blit_count; ++b) {
                if (rects_overlap(drawn_rects[r].x, drawn_rects[r].y, drawn_rects[r].w, drawn_rects[r].h,
                                  blits[b].x, blits[b].y, blits[b].w, blits[b].h)) {
                    fprintf(stderr, "Rect (%d,%d,%d,%d) overlaps blit (%d,%d,%d,%d) at %dx%d\n",
                            drawn_rects[r].x, drawn_rects[r].y, drawn_rects[r].w, drawn_rects[r].h,
                            blits[b].x, blits[b].y, blits[b].w, blits[b].h, frame_w, frame_h);
                    assert(0);
                }
            }
        }

        /* Empty filter + no terrain fallback */
        reset(s);
        ZnMapPanel empty = panel;
        empty.selected = ZN_NO_INDEX;
        compose_ready = texture_ready = atlas_ready = false;
        zn_map_draw(&frame, &empty, &snapshot);
        assert(empty_label && fallback_label);

        reset(s);
        map_loading = true;
        zn_map_draw(&frame, &empty, &snapshot);
        assert(loading_label && !fallback_label);
        map_loading = false;
    }
    return 0;
}
