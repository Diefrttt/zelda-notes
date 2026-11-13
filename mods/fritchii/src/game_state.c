#include "game_state.h"

_Static_assert(sizeof(ZnCollectFlag) == 16 && offsetof(ZnCollectFlag, collected) == 12,
               "CollectSign entry layout");

static bool named(const char *name, const char *alias) {
    while (*alias != '\0' && *name == *alias) {
        ++name;
        ++alias;
    }
    if (*alias != '\0') return false;
    if (*name == '\0') return true;
    const char *suffix = name[0] == '_' && name[1] == 'C' ? "_Child" : "_Adult";
    while (*suffix != '\0' && *name == *suffix) {
        ++name;
        ++suffix;
    }
    return *name == '\0' && *suffix == '\0';
}

uint16_t zn_resolve_zone(const char *const names[static 4]) {
    uint16_t zone = ZN_NO_INDEX;
    bool ranch_seen = false;
    for (size_t i = 0; i < 4; ++i) {
        if (names[i][0] == '\0') continue;
        size_t alias = 0;
        while (alias < zn_scene_alias_count && !named(names[i], zn_scene_aliases[alias].name)) ++alias;
        if (alias == zn_scene_alias_count) return ZN_NO_INDEX;
        if (ranch_seen && named(names[i], "HyruleField")) continue;
        zone = zn_scene_aliases[alias].zone;
        ranch_seen = named(names[i], "LonLonRanch");
    }
    return zone;
}

bool zn_collect_sign(const volatile ZnCollectFlag *entries, size_t count, uint64_t id) {
    size_t lo = 0;
    size_t hi = count;
    while (lo < hi) {
        size_t mid = lo + (hi - lo) / 2;
        if (entries[mid].id < id) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo < count && entries[lo].id == id && entries[lo].collected == 1;
}

ZnProgress zn_marker_progress(const ZnMarker *marker, const ZnGameSnapshot *snapshot) {
    if (!snapshot->ready || !snapshot->collect_sign_known || marker->source == ZN_SOURCE_NONE) {
        return ZN_NO_DATA;
    }
    for (size_t i = 0; i < snapshot->obtained_count; ++i) {
        if (snapshot->obtained[i] == marker->game_id) return ZN_OBTAINED;
    }
    return ZN_PENDING;
}

ZnZoneCount zn_count_zone(const ZnGameSnapshot *snapshot, uint16_t zone) {
    ZnZoneCount count = {0};
    if (!snapshot->ready || zone >= zn_zone_count) return count;
    for (size_t i = 0; i < zn_marker_count; ++i) {
        const ZnMarker *marker = &zn_markers[i];
        if (marker->zone != zone || !(marker->age & snapshot->age)) continue;
        ZnProgress state = zn_marker_progress(marker, snapshot);
        if (state == ZN_NO_DATA) {
            ++count.unknown;
        } else {
            ++count.known;
            count.collected += state == ZN_OBTAINED;
        }
    }
    return count;
}
