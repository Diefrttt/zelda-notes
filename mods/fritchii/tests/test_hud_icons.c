#include <assert.h>
#include <kaegae.h>
#include "hud_icons.h"

static int pixels[8][8];
static unsigned rects;
static int unit = 1;

void kae_draw_rect(int x, int y, int w, int h, uint32_t color) {
    assert(color != 0 && x >= 0 && y >= 0 && x + w <= 8*unit && y + h <= 8*unit);
    assert(x % unit == 0 && y % unit == 0 && w % unit == 0 && h % unit == 0);
    for (int yy = y/unit; yy < (y+h)/unit; ++yy)
        for (int xx = x/unit; xx < (x+w)/unit; ++xx) pixels[yy][xx] = 1;
    ++rects;
}

static uint64_t mask(ZnCategoryIcon icon, int scale) {
    unit = scale;
    rects = 0;
    for (int y = 0; y < 8; ++y)
        for (int x = 0; x < 8; ++x) pixels[y][x] = 0;
    zn_draw_category_icon(icon, 0, 0, unit, 0xd5b56c);
    assert(rects > 0 && rects <= 24);
    uint64_t result = 0;
    for (int y = 0; y < 8; ++y)
        for (int x = 0; x < 8; ++x) result |= (uint64_t)pixels[y][x] << (8*y+x);
    return result;
}

int main(void) {
    for (int i = ZN_ICON_GENERIC; i < ZN_ICON_COUNT; ++i) {
        uint64_t shape = mask(i, 1);
        assert(shape == mask(i, 2));
        for (int j = ZN_ICON_GENERIC; j < i; ++j) assert(shape != mask(j, 1));
    }
    unit = 1;
    rects = 0;
    zn_draw_icon_state(ZN_PENDING, -5, -5, 1);
    assert(rects == 0);
    zn_draw_icon_state(ZN_OBTAINED, -5, -5, 1);
    unsigned obtained = rects;
    assert(obtained > 0);
    rects = 0;
    zn_draw_icon_state(ZN_NO_DATA, -5, -5, 1);
    assert(rects > 0 && rects != obtained);
}
