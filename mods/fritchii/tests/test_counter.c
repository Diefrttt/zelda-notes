#include <assert.h>
#include <string.h>
#include "../src/counter.h"

int main(void) {
    char out[8];
    assert(zn_format_zone_count((ZnZoneCount){.known = 3}, out));
    assert(strcmp(out, "0/3") == 0);
    assert(zn_format_zone_count((ZnZoneCount){.collected = 10, .known = 128, .unknown = 40}, out));
    assert(strcmp(out, "10/128") == 0);
    assert(!zn_format_zone_count((ZnZoneCount){.unknown = 3}, out) && out[0] == '\0');
}
