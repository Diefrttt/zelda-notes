#include <assert.h>
#include <string.h>
#include "hud.h"

const ZnLabel zn_zones[] = {{"Región de los Álamos y montañas de Hyrule", 0}};
const uint16_t zn_zone_count = 1;
static int width, height, text_calls, rects;
static ZnZoneCount count;
static char title[128];
static bool count_first;

static void inside(ZnMapRect r, int w, int h) {
    assert(r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0);
    assert(r.x + r.w <= w && r.y + r.h <= h);
}

ZnZoneCount zn_count_zone(const ZnGameSnapshot *s, uint16_t zone) {
    assert(s->ready && zone == 0);
    return count;
}

void kae_draw_rect(int x, int y, int w, int h, uint32_t color) {
    (void)color;
    inside((ZnMapRect){x, y, w, h}, width, height);
    ++rects;
}

int kae_text_width(int s, const char *text) {
    int glyphs = 0;
    while (*text) {
        unsigned char c = (unsigned char)*text++;
        assert(c < 128 || (c & 0xe0) == 0xc0);
        if (c >= 128) assert(((unsigned char)*text++ & 0xc0) == 0x80);
        ++glyphs;
    }
    return glyphs * 8 * s;
}

int kae_text_height(int s, const char *text) {
    assert(text && *text);
    return 16*s;
}

int kae_draw_text(int x, int y, int s, uint32_t color, const char *text) {
    (void)color;
    int w = kae_text_width(s, text);
    inside((ZnMapRect){x, y, w, kae_text_height(s, text)}, width, height);
    if (strcmp(text, "1/3") == 0) {
        count_first = text_calls == 0;
    } else {
        size_t n = strlen(text) + 1;
        assert(n <= sizeof title);
        memcpy(title, text, n);
    }
    ++text_calls;
    return x + w;
}

static void draw(int w, int h, bool ready) {
    width = w;
    height = h;
    text_calls = rects = 0;
    count_first = false;
    title[0] = '\0';
    KaeFrame frame = {.width = w, .height = h};
    ZnGameSnapshot snapshot = {.ready = ready, .zone = 0, .age = ZN_ADULT};
    zn_draw_hud(&frame, &snapshot);
}

int main(void) {
    static const int sizes[][2] = {{320,240}, {560,350}, {1280,720}, {1920,1080}};
    for (unsigned i = 0; i < sizeof sizes / sizeof sizes[0]; ++i) {
        int w = sizes[i][0], h = sizes[i][1];
        ZnHudLayout l = zn_hud_layout(w, h, 200, 40);
        assert(l.visible);
        assert(l.scale == (i == 3 ? 2 : 1));
        assert(l.frame.h == 50*l.scale);
        inside(l.frame, w, h);
    }
    assert(!zn_hud_layout(25, 20, 0, 40).visible);
    assert(!zn_hud_layout(560, 350, 120, 0).visible);

    count = (ZnZoneCount){.collected = 1, .known = 3};
    draw(560, 350, true);
    assert(text_calls == 2);
    assert(count_first);
    assert(strstr(title, "...") != NULL);
    draw(320, 240, true);
    assert(text_calls == 2 && count_first);
    draw(560, 350, false);
    assert(text_calls == 0 && rects == 0);
    count = (ZnZoneCount){0};
    draw(560, 350, true);
    assert(text_calls == 0 && rects == 0);
}
