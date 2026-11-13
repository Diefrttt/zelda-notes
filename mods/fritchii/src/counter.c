#include "counter.h"

static char *append_number(char *out, unsigned value) {
    if (value >= 100) *out++ = (char)('0' + value / 100);
    if (value >= 10) *out++ = (char)('0' + (value / 10) % 10);
    *out++ = (char)('0' + value % 10);
    return out;
}

bool zn_format_zone_count(ZnZoneCount count, char out[static 8]) {
    if (count.known == 0 || count.known > 999 || count.collected > count.known) {
        out[0] = '\0';
        return false;
    }
    char *cursor = append_number(out, count.collected);
    *cursor++ = '/';
    *append_number(cursor, count.known) = '\0';
    return true;
}
