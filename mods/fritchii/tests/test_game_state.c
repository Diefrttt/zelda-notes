#include <assert.h>
#include "../src/game_state.h"

int main(void) {
    const ZnCollectFlag table[] = {
        {.id = 42, .collected = 1}, {.id = 43, .collected = 0}, {.id = 45, .collected = 1},
    };
    assert(zn_collect_sign(table, 3, 42));
    assert(!zn_collect_sign(table, 3, 43));
    assert(!zn_collect_sign(table, 3, 44));
    assert(!zn_collect_sign(NULL, 0, 42));

    uint16_t ranch = zn_resolve_zone((const char *const[4]){"LonLonRanch_Child", "HyruleField_Child", "", ""});
    uint16_t field = zn_resolve_zone((const char *const[4]){"HyruleField_Adult", "", "", ""});
    assert(ranch != ZN_NO_INDEX && field != ZN_NO_INDEX && ranch != field);
    assert(zn_resolve_zone((const char *const[4]){"LonLonRanch", "Stable", "", ""}) == ZN_NO_INDEX);
    assert(zn_resolve_zone((const char *const[4]){"Title", "", "", ""}) == ZN_NO_INDEX);

    ZnGameSnapshot snapshot = {.ready = true, .age = ZN_ADULT, .zone = field, .collect_sign_known = true,
        .obtained_count = 1, .obtained = {42}};
    ZnMarker marker = {.game_id = 42, .source = ZN_SOURCE_COLLECT_SIGN};
    assert(zn_marker_progress(&marker, &snapshot) == ZN_OBTAINED);
    marker.game_id = 43;
    assert(zn_marker_progress(&marker, &snapshot) == ZN_PENDING);
    marker.source = ZN_SOURCE_GAME_DATA_BOOL;
    marker.game_id = 42;
    assert(zn_marker_progress(&marker, &snapshot) == ZN_OBTAINED);
    marker.game_id = 43;
    assert(zn_marker_progress(&marker, &snapshot) == ZN_PENDING);
    marker.source = ZN_SOURCE_NONE;
    assert(zn_marker_progress(&marker, &snapshot) == ZN_NO_DATA);
    assert(zn_count_zone(&snapshot, field).known > 0);
    assert(zn_count_zone(&snapshot, ZN_NO_INDEX).known == 0);
    snapshot.ready = false;
    assert(zn_count_zone(&snapshot, field).known == 0);
}
