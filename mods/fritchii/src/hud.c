#include "hud.h"
#include "counter.h"
#include "hud_icons.h"

static int min_int(int a, int b) { return a < b ? a : b; }
static int max_int(int a, int b) { return a > b ? a : b; }

int zn_hud_scale(int width, int height) {
    return width >= 1120 && height >= 1080 ? 2 : 1;
}

ZnHudLayout zn_hud_layout(int width, int height, int title_px, int count_px) {
    const int s = zn_hud_scale(width, height);
    ZnHudLayout layout = {.scale = s};
    if (width <= 0 || height <= 0 || count_px <= 0) return layout;
    const int margin = max_int(4*s, height / 40);
    const int rim = 4*s;
    const int free_w = width - 2*(margin + rim);
    const int free_h = height - 2*(margin + rim);
    const int count_w = count_px + 26*s;
    const int footer_h = 42*s;
    if (free_h < footer_h || free_w < max_int(count_w, 36*s)) return layout;

    const int title_w = min_int(title_px, width / 3 - 12*s) + 12*s;
    const int inner_w = min_int(free_w, max_int(36*s, max_int(title_w, count_w)));
    const int frame_h = footer_h + 2*rim;
    layout.frame = (ZnMapRect){margin, height - margin - frame_h, inner_w + 2*rim, frame_h};
    layout.visible = true;
    return layout;
}

static void draw_title(int x, int y, int width, int s, const char *name) {
    if (kae_text_width(s, name) <= width) {
        kae_draw_text(x, y, s, ZN_HUD_IVORY, name);
        return;
    }
    char label[128] = "";
    if (kae_text_width(s, "...") > width) return;
    size_t bytes = 0;
    while (*name) {
        size_t n = 1;
        while (((unsigned char)name[n] & 0xc0) == 0x80) ++n;
        if (bytes + n + sizeof "..." > sizeof label) break;
        for (size_t i = 0; i < n; ++i) label[bytes + i] = name[i];
        label[bytes + n] = '.';
        label[bytes + n + 1] = '.';
        label[bytes + n + 2] = '.';
        label[bytes + n + 3] = '\0';
        if (kae_text_width(s, label) > width) break;
        bytes += n;
        name += n;
    }
    for (size_t i = 0; i < sizeof "..."; ++i) label[bytes + i] = "..."[i];
    kae_draw_text(x, y, s, ZN_HUD_IVORY, label);
}

static void draw_frame(ZnHudLayout layout, const char *name, const char *count) {
    ZnMapRect outer = layout.frame;
    int s = layout.scale, rim = 4*s;
    ZnMapRect foot = {outer.x + rim, outer.y + rim, outer.w - 2*rim, outer.h - 2*rim};
    kae_draw_rect(outer.x + s, outer.y, outer.w - 2*s, rim, ZN_HUD_FOREST);
    kae_draw_rect(outer.x + s, outer.y + outer.h - rim, outer.w - 2*s, rim, ZN_HUD_FOREST);
    kae_draw_rect(outer.x, outer.y + s, rim, outer.h - 2*s, ZN_HUD_FOREST);
    kae_draw_rect(outer.x + outer.w - rim, outer.y + s, rim, outer.h - 2*s, ZN_HUD_FOREST);
    kae_draw_rect(outer.x + 2*s, outer.y + s, outer.w - 4*s, s, ZN_HUD_GOLD);
    kae_draw_rect(outer.x + 2*s, outer.y + outer.h - 2*s, outer.w - 4*s, s, ZN_HUD_GOLD);
    kae_draw_rect(outer.x + s, outer.y + 2*s, s, outer.h - 4*s, ZN_HUD_RELIEF);
    kae_draw_rect(outer.x + outer.w - 2*s, outer.y + 2*s, s, outer.h - 4*s, ZN_HUD_RELIEF);
    kae_draw_rect(foot.x, foot.y, foot.w, foot.h, ZN_HUD_FOREST);
    kae_draw_rect(foot.x, foot.y, foot.w, s, ZN_HUD_RELIEF);
    /* Queue the counter first so a long zone name cannot exhaust the small command arena. */
    zn_draw_category_icon(ZN_ICON_SKULLTULA, foot.x + 6*s, foot.y + 26*s, s, ZN_HUD_GOLD);
    kae_draw_text(foot.x + 20*s, foot.y + 22*s, s, ZN_HUD_GOLD, count);
    draw_title(foot.x + 6*s, foot.y + 4*s, foot.w - 12*s, s, name);
}

void zn_draw_hud(const KaeFrame *frame, const ZnGameSnapshot *snapshot) {
    if (!snapshot->ready || snapshot->zone >= zn_zone_count) return;
    const char *name = zn_zones[snapshot->zone].name;
    char count[8];
    if (!zn_format_zone_count(zn_count_zone(snapshot, snapshot->zone), count)) return;
    int s = zn_hud_scale(frame->width, frame->height);
    int title_px = kae_text_width(s, name), count_px = kae_text_width(s, count);
    ZnHudLayout layout = zn_hud_layout(frame->width, frame->height, title_px, count_px);
    if (layout.visible) draw_frame(layout, name, count);
}
