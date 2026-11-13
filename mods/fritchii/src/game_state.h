#ifndef ZN_GAME_STATE_H
#define ZN_GAME_STATE_H

#include <stdbool.h>
#include "catalog.h"

typedef struct {
    uint64_t id;
    uint32_t metadata;
    uint8_t collected;
    uint8_t reserved[3];
} ZnCollectFlag;

typedef enum { ZN_NO_DATA, ZN_PENDING, ZN_OBTAINED } ZnProgress;

typedef struct {
    bool ready, collect_sign_known;
    uint8_t age;
    uint16_t zone, obtained_count;
    uint64_t obtained[ZN_MAX_COLLECT_SIGNS];
} ZnGameSnapshot;

typedef struct { uint16_t collected, known, unknown; } ZnZoneCount;

uint16_t zn_resolve_zone(const char *const names[static 4]);
bool zn_collect_sign(const volatile ZnCollectFlag *entries, size_t count, uint64_t id);
ZnProgress zn_marker_progress(const ZnMarker *marker, const ZnGameSnapshot *snapshot);
ZnZoneCount zn_count_zone(const ZnGameSnapshot *snapshot, uint16_t zone);
ZnGameSnapshot zn_read_snapshot(void);

#endif
