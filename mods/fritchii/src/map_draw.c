#include "hud.h"
#include "hud_icons.h"
#include "map_texture.h"
#include "zn_lang.h"

enum {
    COL_FRAME_BG = 0x142018,
    COL_HEADER_BG = 0x1b2c21,
    COL_COL_BG = 0x161a19,
    COL_CARD_BG = 0x1e2421,
    COL_CARD_SEL = 0x273c2d,
    COL_BORDER_GREEN = 0x3a5641,
    COL_GOLD = 0xd8b25a,
    COL_GOLD_DIM = 0x7c6838,
    COL_PILL_BG = 0x203528,
    COL_PILL_ACT = 0x2e523a,
    COL_IVORY = 0xf0f4f0,
    COL_MUTED = 0x9ca8a0,
    COL_DIM = 0x6c7870,
    COL_TEAL = 0x60d0b0,
    COL_OK = 0x9de2a9,
    COL_UNKNOWN = 0xa9b7ac,
};

enum {
    CAT_COLS = 4,
    MAX_VISIBLE_ROWS = 9,
    MAX_COMPOSE_PINS = 96,
};

static const char *const progress_short[] = {"[--]", "[  ]", "[OK]"};
#if ZN_LANG_EN
static const char *const progress_names[] = {"No data", "Pending", "Collected"};
static const char *const progress_filter_names[] = {"All", "No data", "Pending", "Collected"};
#else
static const char *const progress_names[] = {"Sin datos", "Pendiente", "Obtenido"};
static const char *const progress_filter_names[] = {"Todos", "Sin datos", "Pendiente", "Obtenido"};
#endif

static uint32_t state_color(ZnProgress state, uint32_t category) {
    return state == ZN_OBTAINED ? COL_OK : state == ZN_NO_DATA ? COL_UNKNOWN : category;
}

static size_t append_str(char *dst, size_t cap, size_t pos, const char *src) {
    if (!dst || !cap || !src) return pos;
    while (*src && pos + 1 < cap) dst[pos++] = *src++;
    dst[pos] = '\0';
    return pos;
}

static size_t append_uint(char *dst, size_t cap, size_t pos, int v) {
    char buf[16];
    int n = 0;
    if (v < 0) {
        if (pos + 1 < cap) dst[pos++] = '-';
        v = -v;
    }
    do {
        buf[n++] = (char)('0' + (v % 10));
        v /= 10;
    } while (v && n < 16);
    while (n-- > 0 && pos + 1 < cap) dst[pos++] = buf[n];
    dst[pos] = '\0';
    return pos;
}

static void draw_border(int x, int y, int w, int h, int t, uint32_t rgb) {
    if (w <= 0 || h <= 0 || t <= 0) return;
    kae_draw_rect(x, y, w, t, rgb);
    kae_draw_rect(x, y + h - t, w, t, rgb);
    if (h > 2 * t) {
        kae_draw_rect(x, y + t, t, h - 2 * t, rgb);
        kae_draw_rect(x + w - t, y + t, t, h - 2 * t, rgb);
    }
}

/* Fill 'outer' with 'rgb' everywhere except the NVN-blitted 'hole' box. */
static void fill_around_box(ZnMapRect outer, ZnMapRect hole, uint32_t rgb) {
    int ox0 = outer.x, oy0 = outer.y, ox1 = outer.x + outer.w, oy1 = outer.y + outer.h;
    int hx0 = hole.x > ox0 ? hole.x : ox0;
    int hy0 = hole.y > oy0 ? hole.y : oy0;
    int hx1 = (hole.x + hole.w) < ox1 ? (hole.x + hole.w) : ox1;
    int hy1 = (hole.y + hole.h) < oy1 ? (hole.y + hole.h) : oy1;
    if (hx0 >= hx1 || hy0 >= hy1) {
        if (outer.w > 0 && outer.h > 0) kae_draw_rect(ox0, oy0, outer.w, outer.h, rgb);
        return;
    }
    if (hy0 > oy0) kae_draw_rect(ox0, oy0, outer.w, hy0 - oy0, rgb);
    if (hy1 < oy1) kae_draw_rect(ox0, hy1, outer.w, oy1 - hy1, rgb);
    if (hx0 > ox0) kae_draw_rect(ox0, hy0, hx0 - ox0, hy1 - hy0, rgb);
    if (hx1 < ox1) kae_draw_rect(hx1, hy0, ox1 - hx1, hy1 - hy0, rgb);
}

static void utf8_truncate(char *dst, size_t cap, const char *src, int max_glyphs) {
    if (!dst || !cap) return;
    if (!src || max_glyphs <= 0) {
        dst[0] = '\0';
        return;
    }
    int total_glyphs = 0;
    for (const unsigned char *p = (const unsigned char *)src; *p; ++p)
        if ((*p & 0xc0) != 0x80) ++total_glyphs;
    if (total_glyphs <= max_glyphs) {
        if (dst != src) {
            append_str(dst, cap, 0, src);
        } else {
            size_t len = 0;
            while (src[len] && len + 1 < cap) ++len;
            dst[len] = '\0';
        }
        return;
    }
    int keep = max_glyphs > 2 ? max_glyphs - 2 : max_glyphs;
    size_t bytes = 0;
    int glyphs = 0;
    while (src[bytes] && glyphs < keep && bytes + 4 < cap) {
        ++bytes;
        while (((unsigned char)src[bytes] & 0xc0) == 0x80 && bytes + 4 < cap) ++bytes;
        ++glyphs;
    }
    if (dst != src) {
        for (size_t i = 0; i < bytes; ++i) dst[i] = src[i];
    }
    dst[bytes] = '\0';
    if (max_glyphs > 2) append_str(dst, cap, bytes, "..");
}

static int draw_lines_ex(int x, int y, int width, int ts, uint32_t color,
                         const char *text, int max_lines, int skip_lines) {
    if (!text) return y;
    int limit = width / (8 * ts);
    if (limit < 1 || max_lines <= 0) return y;
    if (limit > 120) limit = 120;
    int line_h = 18 * ts;
    int drawn = 0;
    while (*text != '\0' && drawn < max_lines) {
        char line[384];
        int glyphs = 0, bytes = 0, space = -1;
        bool newline = false;
        while (text[bytes] != '\0' && glyphs < limit) {
            if (text[bytes] == '\n') {
                newline = true;
                break;
            }
            if ((unsigned char)text[bytes] == ' ') space = bytes;
            ++bytes;
            while (((unsigned char)text[bytes] & 0xc0) == 0x80 && bytes < 380) ++bytes;
            ++glyphs;
        }
        if (!newline && text[bytes] != '\0' && text[bytes] != '\n' && space > 0) bytes = space;
        for (int i = 0; i < bytes; ++i) line[i] = text[i];
        line[bytes] = '\0';
        if (skip_lines > 0) {
            --skip_lines;
        } else {
            kae_draw_text(x, y, ts, color, line);
            y += line_h;
            ++drawn;
        }
        text += bytes;
        if (*text == '\n') ++text;
        else while (*text == ' ') ++text;
    }
    return y;
}

static int draw_lines(int x, int y, int width, int ts, uint32_t color, const char *text, int lines) {
    return draw_lines_ex(x, y, width, ts, color, text, lines, 0);
}

static void draw_centered_text(int box_x, int box_w, int y, int ts, uint32_t rgb, const char *text) {
    int max_glyphs = box_w / (8 * ts);
    if (max_glyphs < 1 || !text || !*text) return;
    char buf[96];
    utf8_truncate(buf, sizeof buf, text, max_glyphs);
    int w = kae_text_width(ts, buf);
    int tx = box_x + (box_w > w ? (box_w - w) / 2 : 0);
    kae_draw_text(tx, y, ts, rgb, buf);
}

static bool marker_point(const ZnMapPanel *panel, const ZnGameSnapshot *snapshot,
                         const ZnMarker *marker, ZnMapViewport view, ZnPoint *point) {
    if (!zn_map_matches(panel, marker, snapshot)) return false;
    ZnBounds data = view.visible;
    if (marker->x < data.min_x || marker->x > data.max_x ||
        marker->y < data.min_y || marker->y > data.max_y) return false;
    ZnMapRect d = view.destination;
    ZnBounds pixels = {(float)d.x, (float)d.y, (float)(d.x + d.w - 1), (float)(d.y + d.h - 1)};
    *point = zn_map_project((ZnPoint){marker->x, marker->y}, data, pixels);
    return true;
}

static void draw_badge(const ZnMarker *marker, ZnProgress state, ZnMapRect badge,
                       int s, uint32_t color) {
    kae_draw_rect(badge.x, badge.y, badge.w, badge.h, ZN_HUD_FOREST);
    zn_draw_category_icon(zn_category_icons[marker->category], badge.x + s, badge.y + s, s, color);
    zn_draw_icon_state(state, badge.x + s, badge.y + s, s);
}

static ZnMapRect badge_at(ZnPoint p, int s) {
    int size = ZN_ICON_BADGE_SIZE * s;
    return (ZnMapRect){(int)p.x - size / 2, (int)p.y - size / 2, size, size};
}

static bool inside(ZnMapRect r, ZnMapRect d) {
    return r.x >= d.x && r.y >= d.y && r.x + r.w <= d.x + d.w && r.y + r.h <= d.y + d.h;
}

static bool overlaps(ZnMapRect a, ZnMapRect b) {
    return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

static void draw_clipped_dot(ZnMapRect d, ZnPoint p, int r, uint32_t color) {
    int left = (int)p.x - r, top = (int)p.y - r, right = (int)p.x + r + 1, bottom = (int)p.y + r + 1;
    if (left < d.x) left = d.x;
    if (top < d.y) top = d.y;
    if (right > d.x + d.w) right = d.x + d.w;
    if (bottom > d.y + d.h) bottom = d.y + d.h;
    if (right > left && bottom > top) kae_draw_rect(left, top, right - left, bottom - top, color);
}

void zn_draw_map_markers(const ZnMapPanel *panel, const ZnGameSnapshot *snapshot,
                         ZnMapViewport view, int s) {
    enum { MAX_ICONS = 8 };
    struct { size_t index; ZnMapRect box; } icons[MAX_ICONS];
    int icon_count = 0;
    const ZnMapRect dst = view.destination;
    ZnPoint selection = {0};
    const bool selected = panel->selected < zn_marker_count &&
        marker_point(panel, snapshot, &zn_markers[panel->selected], view, &selection);
    const ZnMapRect selection_box = badge_at(selection, s);

    for (int pass = 0; pass < 2; ++pass) {
        for (size_t i = 0; i < zn_marker_count; ++i) {
            const ZnMarker *m = &zn_markers[i];
            ZnPoint p;
            if (i == panel->selected || !marker_point(panel, snapshot, m, view, &p)) continue;
            ZnProgress state = zn_marker_progress(m, snapshot);
            if ((pass == 0) != (state != ZN_OBTAINED)) continue;
            if (icon_count < MAX_ICONS) {
                ZnMapRect box = badge_at(p, s);
                bool fits = inside(box, dst) && (!selected || !overlaps(box, selection_box));
                for (int k = 0; fits && k < icon_count; ++k) fits = !overlaps(box, icons[k].box);
                if (fits) {
                    icons[icon_count].index = i;
                    icons[icon_count++].box = box;
                    continue;
                }
            }
            int radius = 3 * s;
            draw_clipped_dot(dst, p, radius + s, ZN_HUD_FOREST);
            draw_clipped_dot(dst, p, radius, state_color(state, zn_categories[m->category].color));
        }
    }
    for (int k = 0; k < icon_count; ++k) {
        const ZnMarker *m = &zn_markers[icons[k].index];
        ZnProgress state = zn_marker_progress(m, snapshot);
        draw_badge(m, state, icons[k].box, s, state_color(state, zn_categories[m->category].color));
    }
    if (selected && inside(selection_box, dst)) {
        const ZnMarker *m = &zn_markers[panel->selected];
        draw_badge(m, zn_marker_progress(m, snapshot), selection_box, s, COL_GOLD);
    } else if (selected) {
        draw_clipped_dot(dst, selection, 4 * s, ZN_HUD_FOREST);
        draw_clipped_dot(dst, selection, 3 * s, COL_GOLD);
    }
}

static uint32_t hash_view_state(const ZnMapPanel *panel, const ZnGameSnapshot *snapshot,
                                const ZnMapArtwork *art, ZnMapViewport view, int s) {
    uint32_t h = 2166136261u;
    uint32_t vals[12] = {
        art->id,
        (uint32_t)view.source.x, (uint32_t)view.source.y, (uint32_t)view.source.w, (uint32_t)view.source.h,
        (uint32_t)view.destination.w, (uint32_t)view.destination.h,
        ((uint32_t)panel->zone << 16) | ((uint32_t)panel->floor << 4) | (panel->progress & 0xF),
        (uint32_t)(panel->focus_mask & 0xFFFFFFFFu), (uint32_t)(panel->focus_mask >> 32),
        ((uint32_t)panel->selected << 16) | (uint32_t)snapshot->obtained_count,
        (uint32_t)s,
    };
    for (int i = 0; i < 12; ++i) {
        h ^= vals[i];
        h *= 16777619u;
    }
    return h ? h : 1u;
}

static int column_header_height(int s) { return 16 * s + 9; }

static void draw_column_chrome(ZnMapRect col, const char *title, bool active, int s) {
    uint32_t bd = active ? COL_GOLD : COL_BORDER_GREEN;
    int hdr_h = column_header_height(s) - 3;
    draw_border(col.x, col.y, col.w, col.h, active ? (s >= 2 ? 2 : 1) : 1, bd);
    kae_draw_rect(col.x + 2, col.y + 2, col.w - 4, hdr_h, COL_HEADER_BG);
    kae_draw_rect(col.x + 2, col.y + 2 + hdr_h, col.w - 4, 1, active ? COL_GOLD_DIM : COL_BORDER_GREEN);

    int max_g = (col.w - 16) / (8 * s);
    bool show_active = active && max_g >= 18;
    char tbuf[48];
    utf8_truncate(tbuf, sizeof tbuf, title, show_active && max_g > 11 ? max_g - 10 : max_g);
    kae_draw_text(col.x + 8, col.y + 5, s, active ? COL_GOLD : COL_IVORY, tbuf);
    if (show_active) {
#if ZN_LANG_EN
        const char *tag = "[ACTIVE]";
#else
        const char *tag = "[ACTIVA]";
#endif
        int tw = kae_text_width(s, tag);
        if (col.x + col.w - 8 - tw > col.x + 8 + kae_text_width(s, tbuf))
            kae_draw_text(col.x + col.w - 8 - tw, col.y + 5, s, COL_GOLD, tag);
    }
}

typedef struct {
    int y_rel;
    int h;
    bool is_section;
    uint8_t section;
    uint16_t cat;
} CatRowEntry;

static const char *get_category_short_name(uint16_t cat) {
    if (cat >= zn_category_count) return "Item";
    const char *full = zn_categories[cat].name ? zn_categories[cat].name : "Item";
    switch (zn_category_meta[cat].id) {
#if ZN_LANG_EN
    case 64051u: return "Entrances";
    case 64052u: return "Warps";
    case 64053u: return "Respawn";
    case 64002u: return "Hearts";
    case 64004u: return "Contain.";
    case 64001u: return "Skulltula";
    case 64003u: return "Big Poes";
    case 64006u: return "Bottles";
    case 64007u: return "Fairies";
    case 64008u: return "Songs";
    case 64005u: return "S. Rupee";
    case 64031u: return "Shops";
    case 64032u: return "Gt. Fairy";
    case 64033u: return "Minigame";
    case 64041u: return "NPCs";
    case 64042u: return "Boss Door";
    case 64043u: return "Gossip";
    case 64044u: return "Bean Soil";
    case 64045u: return "Scrubs";
    case 64046u: return "Cows";
    case 64067u: return "Rumors";
    case 64061u: return "Weapons";
    case 64062u: return "Armor";
    case 64063u: return "Tools";
    case 64064u: return "Upgrades";
    case 64065u: return "Spells";
    case 64066u: return "Masks";
    case 64022u: return "Weapons";
    case 64023u: return "Shields";
    case 64024u: return "Gear";
    case 64025u: return "Maps";
    case 64026u: return "Compasses";
    case 64027u: return "Small Key";
    case 64028u: return "Boss Key";
    case 64021u: return "Other";
    case 64020u: return "Chests";
    case 64000u: return "Collect.";
#else
    case 64051u: return "Entradas";
    case 64052u: return "Portales";
    case 64053u: return "Respawn";
    case 64002u: return "P. Coraz.";
    case 64004u: return "Contened.";
    case 64001u: return "Skulltula";
    case 64003u: return "Gran Poe";
    case 64006u: return "Botellas";
    case 64007u: return "Hadas";
    case 64008u: return "Canciones";
    case 64005u: return "R. Plata";
    case 64031u: return "Tiendas";
    case 64032u: return "Gran Hada";
    case 64033u: return "Minijuego";
    case 64041u: return "Personaje";
    case 64042u: return "P. Jefe";
    case 64043u: return "Cotillas";
    case 64044u: return "Frijoles";
    case 64045u: return "Comercio";
    case 64046u: return "Vacas";
    case 64067u: return "Pistas";
    case 64061u: return "Armas";
    case 64062u: return "Esc./Ropa";
    case 64063u: return "Herram.";
    case 64064u: return "Mejoras";
    case 64065u: return "Hechizos";
    case 64066u: return "Máscaras";
    case 64022u: return "Armas";
    case 64023u: return "Escudos";
    case 64024u: return "Equipo";
    case 64025u: return "Mapas";
    case 64026u: return "Brújulas";
    case 64027u: return "Ll. Peq.";
    case 64028u: return "Ll. Jefe";
    case 64021u: return "Otros";
    case 64020u: return "Cofres";
    case 64000u: return "Colección";
#endif
    default: return full;
    }
}

static void draw_categories_column(ZnMapRect col, const ZnMapPanel *panel, const ZnGameSnapshot *snapshot,
                                   int s, bool active) {
#if ZN_LANG_EN
    draw_column_chrome(col, "CATEGORIES", active, s);
#else
    draw_column_chrome(col, "CATEGORÍAS", active, s);
#endif

    int hero_h = 16 * s + 8;
    int hero_y = col.y + column_header_height(s);
    kae_draw_rect(col.x + 2, hero_y, col.w - 4, hero_h, COL_HEADER_BG);
    kae_draw_rect(col.x + 2, hero_y + hero_h - 1, col.w - 4, 1, COL_BORDER_GREEN);

    /* Find cursor item row and section */
    ZnCatNavItem cursor_item = {false, 0, 0, 0, ZN_NO_INDEX};
    uint16_t nav_total = zn_cat_nav_count();
    if (panel->cat_cursor < nav_total) zn_cat_nav_item(panel->cat_cursor, &cursor_item);

    /* Dedicated Hero Category Banner at the top of the column */
    if (!cursor_item.is_focus && cursor_item.cat_index < zn_category_count) {
        uint16_t cidx = cursor_item.cat_index;
        int d = 0, t = 0;
        zn_panel_global_counts(snapshot, cidx, &d, &t);
        char ctag[32];
        size_t cp = append_str(ctag, sizeof ctag, 0, "[ ");
        cp = append_uint(ctag, sizeof ctag, cp, d);
        cp = append_str(ctag, sizeof ctag, cp, " / ");
        cp = append_uint(ctag, sizeof ctag, cp, t);
        append_str(ctag, sizeof ctag, cp, " ]");
        int ctw = kae_text_width(s, ctag);
        int max_gh = (col.w - 20 - ctw) / (8 * s);
        if (max_gh > 4) {
            char ttrunc[80];
            utf8_truncate(ttrunc, sizeof ttrunc, zn_categories[cidx].name, max_gh);
            kae_draw_text(col.x + 8, hero_y + 4, s, COL_GOLD, ttrunc);
        }
        kae_draw_text(col.x + col.w - 8 - ctw, hero_y + 4, s,
                      (d == t && t > 0) ? COL_OK : (d > 0 ? COL_TEAL : COL_MUTED), ctag);
    } else if (cursor_item.is_focus && cursor_item.section < zn_section_count) {
        char hbuf[80];
#if ZN_LANG_EN
        size_t hp = append_str(hbuf, sizeof hbuf, 0, "Section: ");
#else
        size_t hp = append_str(hbuf, sizeof hbuf, 0, "Sección: ");
#endif
        append_str(hbuf, sizeof hbuf, hp, zn_sections[cursor_item.section].title);
        char ttrunc[80];
        const char *ftag = "[A] Focus";
        int ftw = kae_text_width(s, ftag);
        utf8_truncate(ttrunc, sizeof ttrunc, hbuf, (col.w - 20 - ftw) / (8 * s));
        kae_draw_text(col.x + 8, hero_y + 4, s, COL_GOLD, ttrunc);
        kae_draw_text(col.x + col.w - 8 - ftw, hero_y + 4, s, COL_TEAL, ftag);
    }

    int body_x = col.x + 4;
    int body_y = hero_y + hero_h + 2;
    int body_w = col.w - 8;
    int body_h = (col.y + col.h - 2) - body_y;
    if (body_w < 32 || body_h < 32) {
        kae_draw_rect(col.x + 2, body_y, col.w - 4, body_h, COL_COL_BG);
        return;
    }

    int pad_x = s >= 2 ? 6 : 4;
    int tile_gap = s >= 2 ? 4 : 2;
    int inner_w = body_w - 2 * pad_x;
    int tile_w = (inner_w - (CAT_COLS - 1) * tile_gap) / CAT_COLS;
    if (tile_w < 16) tile_w = 16;

    bool atlas_ok = zn_icon_atlas_ready(s);
    int icon_sz = s >= 2 ? 48 : 32;
    bool compact_cats = (tile_w < icon_sz + 4);
    int label_s = tile_w >= 150 ? s : 1;
    int label_h = 16 * label_s;
    int sec_h = 16 * s + 4;
    int icon_h = compact_cats ? 8 : icon_sz;
    bool inline_count = s >= 2 && tile_w >= 112;
    int cat_h = icon_h + (inline_count ? label_h + 4 : 2 * label_h + 10);

    CatRowEntry entries[48];
    int entry_count = 0;
    int y_acc = 3;
    int cursor_top = 0, cursor_bot = 0;

    for (uint16_t sec = 0; sec < zn_section_count && entry_count < 48; ++sec) {
        entries[entry_count++] = (CatRowEntry){y_acc, sec_h, true, (uint8_t)sec, ZN_NO_INDEX};
        if (active && cursor_item.is_focus && cursor_item.section == sec) {
            cursor_top = y_acc;
            cursor_bot = y_acc + sec_h;
        }
        y_acc += sec_h + 3;

        uint16_t first = zn_sections[sec].first_category;
        uint16_t cnt = zn_sections[sec].category_count;
        for (uint16_t off = 0; off < cnt && entry_count < 48; off += CAT_COLS) {
            entries[entry_count++] = (CatRowEntry){y_acc, cat_h, false, (uint8_t)sec, (uint16_t)(first + off)};
            if (active && !cursor_item.is_focus && cursor_item.section == sec &&
                cursor_item.cat_index >= first + off && cursor_item.cat_index < first + off + CAT_COLS) {
                cursor_top = y_acc;
                cursor_bot = y_acc + cat_h;
            }
            y_acc += cat_h + 2;
        }
        y_acc += 2;
    }

    int scroll_y = 0;
    if (cursor_bot > body_h) scroll_y = cursor_bot - body_h + 4;
    if (cursor_top < scroll_y) scroll_y = cursor_top > 3 ? cursor_top - 3 : 0;

    /* Fill top margin above first drawn entry and gaps without painting over icon boxes */
    int drawn_y_cursor = body_y;
    for (int e = 0; e < entry_count; ++e) {
        int top = body_y + entries[e].y_rel - scroll_y;
        int bot = top + entries[e].h;
        if (top < body_y || bot > body_y + body_h) continue;

        if (top > drawn_y_cursor)
            kae_draw_rect(col.x + 2, drawn_y_cursor, col.w - 4, top - drawn_y_cursor, COL_COL_BG);

        if (entries[e].is_section) {
            uint8_t sec = entries[e].section;
            kae_draw_rect(col.x + 2, top, col.w - 4, entries[e].h, COL_HEADER_BG);
            draw_border(col.x + 2, top, col.w - 4, entries[e].h, 1, COL_BORDER_GREEN);
            bool pill_cursor = active && cursor_item.is_focus && cursor_item.section == sec;
            bool pill_focused = zn_panel_section_focused(panel, sec);
            int pill_w = body_w >= 140 ? 48 * s : 34 * s;
            int title_w = inner_w - pill_w - 6;
            if (title_w > 16) {
                char sbuf[40];
                utf8_truncate(sbuf, sizeof sbuf, zn_sections[sec].title, title_w / (8 * s));
                kae_draw_text(body_x + pad_x, top + 3, s,
                              pill_focused || panel->focus_mask == 0 ? COL_GOLD : COL_IVORY, sbuf);
            }
            int px = body_x + pad_x + inner_w - pill_w;
            uint32_t pbg = pill_focused ? COL_PILL_ACT : COL_PILL_BG;
            kae_draw_rect(px, top + 1, pill_w, sec_h - 2, pbg);
            draw_border(px, top + 1, pill_w, sec_h - 2, 1,
                        pill_cursor ? COL_GOLD : (pill_focused ? COL_TEAL : COL_BORDER_GREEN));
            draw_centered_text(px, pill_w, top + 3, s,
                               pill_cursor || pill_focused ? COL_IVORY : COL_MUTED,
                               pill_w >= 48 ? "Focus" : "Foc");
        } else {
            uint8_t sec = entries[e].section;
            uint16_t row_start = entries[e].cat;
            uint16_t sec_end = (uint16_t)(zn_sections[sec].first_category + zn_sections[sec].category_count);
            if (sec_end > zn_category_count) sec_end = zn_category_count;

            /* Left and right side margins around row */
            if (pad_x + 2 > 0) {
                kae_draw_rect(col.x + 2, top, body_x + pad_x - (col.x + 2), entries[e].h, COL_COL_BG);
                int row_right = body_x + pad_x + CAT_COLS * tile_w + (CAT_COLS - 1) * tile_gap;
                if (col.x + col.w - 2 > row_right)
                    kae_draw_rect(row_right, top, col.x + col.w - 2 - row_right, entries[e].h, COL_COL_BG);
            }

            for (int c = 0; c < CAT_COLS; ++c) {
                int tx = body_x + pad_x + c * (tile_w + tile_gap);
                if (c > 0 && tile_gap > 0)
                    kae_draw_rect(tx - tile_gap, top, tile_gap, entries[e].h, COL_COL_BG);

                uint16_t cat = (uint16_t)(row_start + c);
                if (cat >= sec_end) {
                    kae_draw_rect(tx, top, tile_w, entries[e].h, COL_COL_BG);
                    continue;
                }

                bool vis = zn_panel_category_visible(panel, cat);
                bool focused_bit = (panel->focus_mask != 0) && vis;
                bool is_cur = active && !cursor_item.is_focus && cursor_item.cat_index == cat;
                uint32_t tbg = is_cur ? 0x1f2922 : COL_COL_BG;
                ZnMapRect tile_box = {tx, top, tile_w, entries[e].h};

                uint8_t icon_idx = zn_category_meta[cat].icon_index;
                int ix = inline_count ? tx + 6 : tx + (tile_w - icon_sz) / 2;
                int iy = top + 2;
                ZnMapRect icon_box = {ix, iy, icon_sz, icon_sz};

                ZnSpriteSlot slot = vis ? ZN_SPRITE_CAT_ACTIVE : ZN_SPRITE_CAT_DIMMED;
                if (atlas_ok && icon_idx != ZN_NO_ICON_INDEX && !compact_cats &&
                    zn_icon_draw(icon_idx, slot, s, ix, iy)) {
                    fill_around_box(tile_box, icon_box, tbg);
                } else {
                    kae_draw_rect(tile_box.x, tile_box.y, tile_box.w, tile_box.h, tbg);
                    int fsz = 8;
                    zn_draw_category_icon(zn_category_icons[cat], inline_count ? ix + (icon_h - fsz) / 2 : tx + (tile_w - fsz) / 2,
                                          top + 2 + (icon_h - fsz) / 2, 1,
                                          vis ? zn_categories[cat].color : COL_DIM);
                }

                if (is_cur || focused_bit) {
                    draw_border(tx, top, tile_w, entries[e].h, is_cur ? 2 : 1,
                                is_cur ? COL_GOLD : COL_TEAL);
                } else {
                    draw_border(tx, top, tile_w, entries[e].h, 1, 0x243228);
                }

                /* 1 crisp line of category label */
                const char *sname = get_category_short_name(cat);
                uint32_t text_col = is_cur ? COL_GOLD : (vis ? COL_IVORY : COL_DIM);
                int name_y = top + icon_h + (inline_count ? 2 : 3);
                draw_centered_text(tx + 2, tile_w - 4, name_y, label_s, text_col, sname);

                /* Counter pill */
                int done = 0, total = 0;
                zn_panel_global_counts(snapshot, cat, &done, &total);
                char cbuf[24];
                size_t cp = 0;
                cp = append_uint(cbuf, sizeof cbuf, cp, done);
                cp = append_str(cbuf, sizeof cbuf, cp, "/");
                append_uint(cbuf, sizeof cbuf, cp, total);

                int pill_area_x = inline_count ? ix + icon_sz + 4 : tx + 5;
                int pill_area_w = tx + tile_w - 5 - pill_area_x;
                int pill_w = pill_area_w;
                if (pill_w > 96 * label_s) pill_w = 96 * label_s;
                int count_s = kae_text_width(label_s, cbuf) + 4 <= pill_w ? label_s : 1;
                int pill_h = 16 * count_s + 4;
                int pill_y = inline_count ? top + 2 + (icon_h - pill_h) / 2 : top + entries[e].h - pill_h - 2;
                int pill_x = pill_area_x + (pill_area_w - pill_w) / 2;

                uint32_t pbg = (done == total && total > 0) ? 0x1f3825 : (done > 0 ? COL_PILL_ACT : 0x18211b);
                uint32_t pbd = (done == total && total > 0) ? COL_OK : (done > 0 ? COL_TEAL : 0x243228);
                uint32_t cnt_col = (done == total && total > 0) ? COL_OK : (done > 0 ? COL_TEAL : (vis ? COL_MUTED : COL_DIM));

                kae_draw_rect(pill_x, pill_y, pill_w, pill_h, pbg);
                draw_border(pill_x, pill_y, pill_w, pill_h, 1, pbd);
                draw_centered_text(pill_x, pill_w, pill_y + 2, count_s, cnt_col, cbuf);
            }
        }
        drawn_y_cursor = bot;
    }

    int body_bot = col.y + col.h - 2;
    if (drawn_y_cursor < body_bot)
        kae_draw_rect(col.x + 2, drawn_y_cursor, col.w - 4, body_bot - drawn_y_cursor, COL_COL_BG);
}

static void draw_map_column(ZnMapRect col, const ZnMapPanel *panel, const ZnGameSnapshot *snapshot,
                            int s, bool active, const char *compact_variant) {
    char title[64];
#if ZN_LANG_EN
    size_t tpos = append_str(title, sizeof title, 0, "MAP");
#else
    size_t tpos = append_str(title, sizeof title, 0, "MAPA");
#endif
    if (panel->floor < zn_floor_count) {
        size_t pos = append_str(title, sizeof title, tpos, "  ");
        append_str(title, sizeof title, pos, zn_floors[panel->floor].name);
    }
    draw_column_chrome(col, title, active, s);

    int box_x = col.x + 6;
    int top = col.y + column_header_height(s);
    int bar_h = 16 * s + 8;
    int area_h = col.y + col.h - 2 - bar_h - top;
    int box_w = col.w - 12;
    int box_h = area_h;
    if (box_w > ZN_MAP_MAX_SIDE) box_w = ZN_MAP_MAX_SIDE;
    if (box_h > ZN_MAP_VIEW_MAX_H) box_h = ZN_MAP_VIEW_MAX_H;
    if (box_w < 16) box_w = 16;
    if (box_h < 16) box_h = 16;
    int box_y = top + (area_h - box_h) / 2;

    /* Fill chrome margins outside map_box */
    ZnMapRect inner = {col.x + 2, top, col.w - 4, col.y + col.h - 2 - top};
    ZnMapRect map_box = {box_x, box_y, box_w, box_h};
    fill_around_box(inner, map_box, COL_COL_BG);

    ZnMapTextureStatus status = ZN_MAP_UNAVAILABLE;
    ZnMapViewport view = {0};
    if (panel->floor < zn_floor_count) {
        const ZnMapArtwork *art = &zn_artwork[panel->floor];
        view = zn_map_viewport(panel->view, art, map_box);
        ZnMapRect dst = view.destination;
        if (dst.w > ZN_MAP_MAX_SIDE) dst.w = ZN_MAP_MAX_SIDE;
        if (dst.h > ZN_MAP_VIEW_MAX_H) dst.h = ZN_MAP_VIEW_MAX_H;

        ZnComposePin pins[MAX_COMPOSE_PINS];
        int pin_count = 0;
        for (int pass = 0; pass < 2 && pin_count < MAX_COMPOSE_PINS; ++pass) {
            for (size_t i = 0; i < zn_marker_count && pin_count < MAX_COMPOSE_PINS; ++i) {
                const ZnMarker *m = &zn_markers[i];
                bool is_sel = (i == panel->selected);
                if ((pass == 0 && is_sel) || (pass == 1 && !is_sel)) continue;
                ZnPoint pt;
                if (!marker_point(panel, snapshot, m, view, &pt)) continue;
                int lx = (int)(pt.x + 0.5f) - dst.x;
                int ly = (int)(pt.y + 0.5f) - dst.y;
                if (lx < 0 || ly < 0 || lx >= dst.w || ly >= dst.h) continue;
                uint8_t icon_idx = m->category < zn_category_count ? zn_category_meta[m->category].icon_index : ZN_NO_ICON_INDEX;
                pins[pin_count++] = (ZnComposePin){
                    .x = lx, .y = ly,
                    .icon_index = icon_idx,
                    .obtained = zn_marker_progress(m, snapshot) == ZN_OBTAINED,
                    .selected = is_sel,
                };
            }
        }
        uint32_t vhash = hash_view_state(panel, snapshot, art, view, s);
        status = zn_map_texture_compose_and_draw(art, view.source, dst, pins, pin_count,
                                                 false, 0, 0, s, vhash);
        if (status == ZN_MAP_DRAWN) {
            fill_around_box(map_box, dst, COL_COL_BG);
        } else if (status == ZN_MAP_UNAVAILABLE && zn_map_texture_draw(art, view.source, dst)) {
            status = ZN_MAP_DRAWN;
            fill_around_box(map_box, dst, COL_COL_BG);
            zn_draw_map_markers(panel, snapshot, view, s);
        }
    }

    if (status != ZN_MAP_DRAWN) {
        kae_draw_rect(map_box.x, map_box.y, map_box.w, map_box.h, COL_CARD_BG);
        if (status == ZN_MAP_UNAVAILABLE) {
#if ZN_LANG_EN
            draw_lines(map_box.x + 12, map_box.y + 12, map_box.w - 24, s, COL_IVORY, "Map unavailable", 2);
#else
            draw_lines(map_box.x + 12, map_box.y + 12, map_box.w - 24, s, COL_IVORY, "Mapa no disponible", 2);
#endif
        }
    }

    int bar_y = top + area_h;
    if (bar_y + bar_h <= col.y + col.h - 2) {
#if ZN_LANG_EN
        const char *info = "[R-Stick] Pan  [Up/Down] Zoom";
        if (compact_variant) info = compact_variant;
        if (status == ZN_MAP_LOADING) info = "Loading map...";
#else
        const char *info = "[Stick R] Mover  [Arr./Ab.] Zoom";
        if (compact_variant) info = compact_variant;
        if (status == ZN_MAP_LOADING) info = "Cargando mapa...";
#endif
        char trunc[80];
        utf8_truncate(trunc, sizeof trunc, info, (col.w - 16) / (8 * s));
        kae_draw_text(col.x + 8, bar_y + 3, s, COL_MUTED, trunc);
    }
}

static int find_obj_start(int max_rows, const ZnMapPanel *panel, const ZnGameSnapshot *snapshot) {
    int ordinal = 0;
    for (uint16_t i = 0; i < panel->selected && i < zn_marker_count; ++i) {
        if (zn_map_matches(panel, &zn_markers[i], snapshot)) ++ordinal;
    }
    int skip = ordinal > max_rows / 2 ? ordinal - max_rows / 2 : 0;
    return skip;
}

static void draw_objectives_column(ZnMapRect col, const ZnMapPanel *panel, const ZnGameSnapshot *snapshot,
                                   int s, bool active) {
#if ZN_LANG_EN
    draw_column_chrome(col, "OBJECTIVES & GUIDE", active, s);
#else
    draw_column_chrome(col, "OBJETIVOS Y GUÍA", active, s);
#endif

    int body_x = col.x + 2;
    int body_y = col.y + column_header_height(s);
    int body_w = col.w - 4;
    int body_h = col.y + col.h - 2 - body_y;
    int glyph_w = 8 * s;
    int text_h = 16 * s;

    int list_percent = s == 1 ? 54 : (body_h < 1000 ? 27 : 40);
    int list_h = body_h * list_percent / 100;
    if (list_h < 90) list_h = body_h / 2;
    int guide_y = body_y + list_h + 4;
    int guide_h = body_y + body_h - guide_y;

    /* Count matching objectives */
    int match_total = 0;
    for (size_t i = 0; i < zn_marker_count; ++i) {
        if (zn_map_matches(panel, &zn_markers[i], snapshot)) ++match_total;
    }

    int pad = 8;
    int ix_col = col.x + pad;
    int iw_col = col.w - 2 * pad;

    /* List header strip */
    int list_header_h = text_h + 8;
    kae_draw_rect(body_x, body_y, body_w, list_header_h, COL_COL_BG);
    char cnt_hdr[48];
#if ZN_LANG_EN
    size_t pos = append_str(cnt_hdr, sizeof cnt_hdr, 0, "In view: ");
    pos = append_uint(cnt_hdr, sizeof cnt_hdr, pos, match_total);
    append_str(cnt_hdr, sizeof cnt_hdr, pos, " objectives");
#else
    size_t pos = append_str(cnt_hdr, sizeof cnt_hdr, 0, "En vista: ");
    pos = append_uint(cnt_hdr, sizeof cnt_hdr, pos, match_total);
    append_str(cnt_hdr, sizeof cnt_hdr, pos, " objetivos");
#endif
    utf8_truncate(cnt_hdr, sizeof cnt_hdr, cnt_hdr, iw_col / glyph_w);
    kae_draw_text(ix_col, body_y + 3, s, COL_TEAL, cnt_hdr);

    int rows_y = body_y + list_header_h;
    int rows_h = body_y + list_h - rows_y;
    int row_h = text_h + 8;
    int row_gap = 4;
    int max_rows = rows_h / (row_h + row_gap);
    if (max_rows > MAX_VISIBLE_ROWS) max_rows = MAX_VISIBLE_ROWS;
    if (max_rows < 1) max_rows = 1;

    bool atlas_ok = zn_icon_atlas_ready(s);
    int mini_sz = s >= 2 ? 24 : 18;
    int drawn_y = rows_y;

    if (match_total == 0 || panel->selected >= zn_marker_count) {
        kae_draw_rect(body_x, rows_y, body_w, rows_h, COL_COL_BG);
#if ZN_LANG_EN
        draw_lines(ix_col, rows_y + 6, iw_col, s, COL_IVORY, "No markers match these filters", 2);
#else
        draw_lines(ix_col, rows_y + 6, iw_col, s, COL_IVORY, "Sin marcadores para estos filtros", 2);
#endif
        drawn_y = rows_y + rows_h;
    } else {
        int skip = find_obj_start(max_rows, panel, snapshot);
        int drawn = 0;
        for (size_t i = 0; i < zn_marker_count && drawn < max_rows; ++i) {
            const ZnMarker *m = &zn_markers[i];
            if (!zn_map_matches(panel, m, snapshot) || skip-- > 0) continue;
            if (drawn_y + row_h > body_y + list_h) break;

            bool is_sel = (i == panel->selected);
            uint32_t rbg = is_sel ? COL_CARD_SEL : COL_CARD_BG;
            ZnMapRect row_box = {ix_col, drawn_y, iw_col, row_h};
            kae_draw_rect(body_x, drawn_y, ix_col - body_x, row_h, COL_COL_BG);
            kae_draw_rect(ix_col + iw_col, drawn_y, body_x + body_w - (ix_col + iw_col), row_h, COL_COL_BG);

            int icon_x = ix_col + 5;
            int icon_y = drawn_y + (row_h - mini_sz) / 2;
            ZnMapRect icon_box = {icon_x, icon_y, mini_sz, mini_sz};
            uint8_t icon_idx = m->category < zn_category_count ? zn_category_meta[m->category].icon_index : ZN_NO_ICON_INDEX;

            if (atlas_ok && icon_idx != ZN_NO_ICON_INDEX && zn_icon_draw(icon_idx, ZN_SPRITE_PIN_MINI, s, icon_x, icon_y)) {
                fill_around_box(row_box, icon_box, rbg);
            } else {
                kae_draw_rect(row_box.x, row_box.y, row_box.w, row_box.h, rbg);
                uint32_t ccol = m->category < zn_category_count ? zn_categories[m->category].color : COL_GOLD;
                kae_draw_rect(icon_x, icon_y, mini_sz > 10 ? 10 : mini_sz, mini_sz > 10 ? 10 : mini_sz, ccol);
            }

            if (is_sel) draw_border(row_box.x, row_box.y, row_box.w, row_box.h, 1, COL_GOLD);

            ZnProgress st = zn_marker_progress(m, snapshot);
            const char *tag = progress_short[st];
            int tag_w = kae_text_width(s, tag);
            int text_x = icon_x + mini_sz + 6;
            int text_w = (ix_col + iw_col - 6 - tag_w - 6) - text_x;
            int text_y = drawn_y + (row_h - text_h) / 2;
            if (text_w >= glyph_w) {
                char nbuf[96];
                utf8_truncate(nbuf, sizeof nbuf, m->name, text_w / glyph_w);
                kae_draw_text(text_x, text_y, s, COL_IVORY, nbuf);
            }
            if (ix_col + iw_col - 6 - tag_w >= ix_col) {
                kae_draw_text(ix_col + iw_col - 6 - tag_w, text_y, s,
                              st == ZN_OBTAINED ? COL_OK : (st == ZN_NO_DATA ? COL_DIM : COL_MUTED), tag);
            }

            drawn_y += row_h;
            if (drawn + 1 < max_rows && drawn_y + row_gap <= body_y + list_h) {
                kae_draw_rect(body_x, drawn_y, body_w, row_gap, COL_COL_BG);
                drawn_y += row_gap;
            }
            ++drawn;
        }
    }

    if (drawn_y < guide_y) kae_draw_rect(body_x, drawn_y, body_w, guide_y - drawn_y, COL_COL_BG);

    /* Description Card: COMO CONSEGUIRLO / DETALLE */
    if (guide_h < 36) return;
    ZnMapRect card = {ix_col, guide_y, iw_col, guide_h - 4};
    kae_draw_rect(body_x, guide_y, ix_col - body_x, guide_h, COL_COL_BG);
    kae_draw_rect(ix_col + iw_col, guide_y, body_x + body_w - (ix_col + iw_col), guide_h, COL_COL_BG);
    kae_draw_rect(ix_col, guide_y + card.h, iw_col, 4, COL_COL_BG);
    kae_draw_rect(card.x, card.y, card.w, card.h, COL_CARD_BG);
    draw_border(card.x, card.y, card.w, card.h, 1, active ? COL_GOLD_DIM : COL_BORDER_GREEN);

    int g_hdr_h = text_h + 6;
    kae_draw_rect(card.x + 1, card.y + 1, card.w - 2, g_hdr_h, COL_HEADER_BG);
    kae_draw_rect(card.x + 1, card.y + 1 + g_hdr_h, card.w - 2, 1, COL_GOLD_DIM);
    if (card.w >= 40) {
        char ghdr[48];
#if ZN_LANG_EN
        utf8_truncate(ghdr, sizeof ghdr, "HOW TO GET IT", (card.w - 16) / glyph_w);
#else
        utf8_truncate(ghdr, sizeof ghdr, "CÓMO CONSEGUIRLO", (card.w - 16) / glyph_w);
#endif
        kae_draw_text(card.x + 8, card.y + 4, s, COL_GOLD, ghdr);
    }

    int cy = card.y + g_hdr_h + 6;
    int cw = card.w - 16;
    int card_bot = card.y + card.h - 4;
    int line_h = 18 * s;
    if (panel->selected < zn_marker_count && cw >= 16) {
        const ZnMarker *sel = &zn_markers[panel->selected];
        ZnProgress st = zn_marker_progress(sel, snapshot);
        int title_lines = (card_bot - cy) / line_h;
        cy = draw_lines(card.x + 8, cy, cw, s, COL_IVORY, sel->name, title_lines < 2 ? title_lines : 2);
        char meta[80];
        size_t mp = 0;
        if (sel->category < zn_category_count) mp = append_str(meta, sizeof meta, mp, zn_categories[sel->category].name);
        mp = append_str(meta, sizeof meta, mp, " | ");
        append_str(meta, sizeof meta, mp, progress_names[st]);
        if (cy + line_h + 2 <= card_bot) cy = draw_lines(card.x + 8, cy + 2, cw, s, COL_TEAL, meta, 1);
        if (cy + 8 <= card_bot) {
            kae_draw_rect(card.x + 8, cy + 2, cw, 1, COL_BORDER_GREEN);
            cy += 8;
        }
        int avail_lines = (card_bot - cy) / line_h;
        if (avail_lines > 0) {
            draw_lines_ex(card.x + 8, cy, cw, s, COL_IVORY, zn_map_hint(sel), avail_lines, panel->desc_scroll);
        }
    } else if (cw >= 16) {
        int lines = (card_bot - cy) / line_h;
#if ZN_LANG_EN
        draw_lines(card.x + 8, cy, cw, s, COL_IVORY, "Select an objective from the list or map.", lines < 3 ? lines : 3);
#else
        draw_lines(card.x + 8, cy, cw, s, COL_IVORY, "Selecciona un objetivo en la lista o el mapa.", lines < 3 ? lines : 3);
#endif
    }
}

static void draw_chip(int right_x, int y, int h, int s, const char *label, uint32_t bd_col, uint32_t text_col, int *out_left) {
    int tw = kae_text_width(s, label);
    int w = tw + 14;
    int x = right_x - w;
    kae_draw_rect(x, y, w, h, COL_PILL_BG);
    draw_border(x, y, w, h, 1, bd_col);
    kae_draw_text(x + 7, y + (h - 16 * s) / 2, s, text_col, label);
    *out_left = x;
}

void zn_map_draw(const KaeFrame *frame, const ZnMapPanel *panel, const ZnGameSnapshot *snapshot) {
    if (!zn_map_can_draw(frame->width, frame->height) || panel->zone >= zn_zone_count) return;
    int s = (frame->height >= 1000 && frame->width >= 1120) ? 2 : 1;
    int title_s = s;
    int x = frame->width / 28, y = frame->height / 20;
    int w = frame->width - 2 * x, h = frame->height - 2 * y;

    int hdr_h = title_s == 2 ? 48 : 30;
    int foot_h = 16 * s + 12;
    int pad = s >= 2 ? 12 : 6;
    int gap = s >= 2 ? 10 : 6;

    /* Outer double-framed Zelda box */
    kae_draw_rect(x, y, w, hdr_h + 2, COL_HEADER_BG);
    kae_draw_rect(x, y + h - foot_h, w, foot_h, COL_HEADER_BG);
    draw_border(x, y, w, h, 2, COL_BORDER_GREEN);
    draw_border(x + 3, y + 3, w - 6, h - 6, 1, COL_GOLD_DIM);
    kae_draw_rect(x + 4, y + hdr_h + 2, w - 8, 1, COL_GOLD);
    kae_draw_rect(x + 4, y + h - foot_h, w - 8, 1, COL_BORDER_GREEN);

    /* Right status chips in header */
    int chip_h = 16 * s + 6;
    int chip_y = y + (hdr_h - chip_h) / 2 + 1;
    int chip_limit = x + w - pad;
    uint16_t next_variant = zn_map_next_variant(panel);
    const char *variant = NULL;
    if (next_variant < zn_floor_count && next_variant != panel->floor)
#if ZN_LANG_EN
        variant = zn_artwork[next_variant].map_id == 65000 ? "[Y] Switch age" : "[Y] Switch floor";
#else
        variant = zn_artwork[next_variant].map_id == 65000 ? "[Y] Cambiar edad" : "[Y] Cambiar plano";
#endif
    if (w >= 720 * s) {
        int next_x = chip_limit;
#if ZN_LANG_EN
        draw_chip(next_x, chip_y, chip_h, s, "[ZL/ZR] Zone", COL_GOLD_DIM, COL_GOLD, &next_x);
#else
        draw_chip(next_x, chip_y, chip_h, s, "[ZL/ZR] Zona", COL_GOLD_DIM, COL_GOLD, &next_x);
#endif
        char prog[32] = "[X] ";
        append_str(prog, sizeof prog, 4, progress_filter_names[panel->progress & 3]);
        draw_chip(next_x - 8, chip_y, chip_h, s, prog, COL_BORDER_GREEN, COL_TEAL, &next_x);
        if (variant) draw_chip(next_x - 8, chip_y, chip_h, s, variant, COL_BORDER_GREEN, COL_IVORY, &next_x);
        chip_limit = next_x - 12;
    }

    /* Title: ZELDA NOTES | <zone> */
    int tx = x + pad;
    int ty = y + (hdr_h - 16 * title_s) / 2 + 2;
    tx = kae_draw_text(tx, ty, title_s, COL_GOLD, "ZELDA NOTES");
    tx = kae_draw_text(tx, ty, title_s, COL_MUTED, " | ");
    int rem_g = (chip_limit - tx) / (8 * title_s);
    if (rem_g >= 4) {
        char zbuf[96];
        utf8_truncate(zbuf, sizeof zbuf, zn_zones[panel->zone].name, rem_g);
        kae_draw_text(tx, ty, title_s, COL_IVORY, zbuf);
    }

    /* Body columns background top/bottom padding */
    int body_y = y + hdr_h + 6;
    int body_h = (y + h - foot_h - 4) - body_y;
    int avail_w = w - 2 * pad;
    int left_w = (avail_w * 29) / 100;
    int right_w = (avail_w * 31) / 100;
    int mid_w = avail_w - left_w - right_w - 2 * gap;

    /* Fill outer margins between frame and column boxes safely without touching columns */
    kae_draw_rect(x + 4, y + hdr_h + 3, w - 8, 3, COL_FRAME_BG);
    kae_draw_rect(x + 4, body_y, pad - 4, body_h, COL_FRAME_BG);
    kae_draw_rect(x + pad + left_w, body_y, gap, body_h, COL_FRAME_BG);
    kae_draw_rect(x + pad + left_w + gap + mid_w, body_y, gap, body_h, COL_FRAME_BG);
    int right_end = x + pad + avail_w;
    if (x + w - 4 > right_end) kae_draw_rect(right_end, body_y, x + w - 4 - right_end, body_h, COL_FRAME_BG);
    kae_draw_rect(x + 4, body_y + body_h, w - 8, 4, COL_FRAME_BG);

    ZnMapRect col_cats = {x + pad, body_y, left_w, body_h};
    ZnMapRect col_map = {x + pad + left_w + gap, body_y, mid_w, body_h};
    ZnMapRect col_obj = {col_map.x + mid_w + gap, body_y, right_w, body_h};

    draw_categories_column(col_cats, panel, snapshot, s, panel->active_col == ZN_COL_CATEGORIES);
    draw_map_column(col_map, panel, snapshot, s, panel->active_col == ZN_COL_MAP, w < 720 * s ? variant : NULL);
    draw_objectives_column(col_obj, panel, snapshot, s, panel->active_col == ZN_COL_OBJECTIVES);

    /* Footer controls */
#if ZN_LANG_EN
    const char *context = "[D-Pad] Move  [A] Filter";
    if (panel->active_col == ZN_COL_MAP) context = "[Left/Right] Target  [A] Center";
    if (panel->active_col == ZN_COL_OBJECTIVES) context = "[Up/Down] Target  [Left/Right] Guide  [A] Center";
    const char *prefix_str = "[L/R] Column  ";
    const char *close_str = panel->focus_mask ? "  [B] Clear filter" : "  [B] Close";
    const char *compact = panel->active_col == ZN_COL_OBJECTIVES ? "[Up/Down] Target" : context;
#else
    const char *context = "[Cruceta] Mover  [A] Filtrar";
    if (panel->active_col == ZN_COL_MAP) context = "[Izq./Der.] Objetivo  [A] Centrar";
    if (panel->active_col == ZN_COL_OBJECTIVES) context = "[Arr./Ab.] Objetivo  [Izq./Der.] Guía  [A] Centrar";
    const char *prefix_str = "[L/R] Columna  ";
    const char *close_str = panel->focus_mask ? "  [B] Quitar filtro" : "  [B] Cerrar";
    const char *compact = panel->active_col == ZN_COL_OBJECTIVES ? "[Arr./Ab.] Objetivo" : context;
#endif
    char foot_txt[144];
    size_t base_pos = append_str(foot_txt, sizeof foot_txt, 0, prefix_str);
    size_t foot_pos = append_str(foot_txt, sizeof foot_txt, base_pos, context);
    append_str(foot_txt, sizeof foot_txt, foot_pos, close_str);
    if (kae_text_width(s, foot_txt) > w - 2 * pad) {
        foot_pos = append_str(foot_txt, sizeof foot_txt, base_pos, compact);
        append_str(foot_txt, sizeof foot_txt, foot_pos, close_str);
    }
    draw_centered_text(x + pad, w - 2 * pad, y + h - foot_h + 6, s, COL_IVORY, foot_txt);
}
