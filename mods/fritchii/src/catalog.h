#ifndef ZN_CATALOG_H
#define ZN_CATALOG_H

#include <stddef.h>
#include <stdint.h>

enum {
    ZN_NO_INDEX = UINT16_MAX,
    ZN_NO_ICON_INDEX = UINT8_MAX,
    ZN_CHILD = 1,
    ZN_ADULT = 2,
    ZN_ALL_AGES = 3,
    ZN_SOURCE_NONE = 0,
    ZN_SOURCE_COLLECT_SIGN = 1,
    ZN_SOURCE_GAME_DATA_BOOL = 2,
    ZN_MAX_COLLECT_SIGNS = 640,
};

typedef struct {
    uint64_t game_id;
    const char *id, *name, *hint;
    float x, y;
    uint16_t zone, floor, category;
    uint8_t age, source;
} ZnMarker;

typedef struct {
    const char *name;
    uint32_t color;
} ZnLabel;

typedef struct {
    const char *id;
    const char *title;
    uint16_t first_category;
    uint16_t category_count;
} ZnSection;

typedef struct {
    uint32_t id;
    uint8_t section;
    uint8_t icon_index;
    uint16_t total_count;
} ZnCategoryMeta;

typedef enum {
    ZN_ICON_GENERIC, ZN_ICON_SKULLTULA, ZN_ICON_HEART, ZN_ICON_CHEST, ZN_ICON_KEY,
    ZN_ICON_RUPEE, ZN_ICON_BOTTLE, ZN_ICON_OCARINA, ZN_ICON_SWORD, ZN_ICON_SHIELD,
    ZN_ICON_FAIRY, ZN_ICON_DOOR, ZN_ICON_PERSON, ZN_ICON_COUNT,
} ZnCategoryIcon;

typedef struct {
    const char *name;
    uint16_t zone;
} ZnSceneAlias;

typedef struct { float min_x, min_y, max_x, max_y; } ZnBounds;

typedef struct {
    uint32_t id, map_id;
    uint16_t width, height, zone;
    uint8_t age;
    ZnBounds bounds;
} ZnMapArtwork;

extern const ZnMarker zn_markers[];
extern const size_t zn_marker_count;
extern const ZnLabel zn_zones[], zn_floors[], zn_categories[];
extern const ZnSection zn_sections[];
extern const ZnCategoryMeta zn_category_meta[];
extern const ZnCategoryIcon zn_category_icons[];
extern const uint16_t zn_zone_count, zn_floor_count, zn_category_count, zn_section_count;
extern const ZnSceneAlias zn_scene_aliases[];
extern const size_t zn_scene_alias_count;
extern const ZnMapArtwork zn_artwork[];
extern const ZnBounds zn_world_bounds[][2];

#endif
