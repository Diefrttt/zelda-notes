#include <kaegae.h>

#include "game_state.h"

enum {
    SCENE_MANAGER_GLOBAL = 0x4e97648,
    CURRENT_SCENE = 0x1f0,
    CHILDHOOD_HASH = 0xcea220d3u,
    SCENE_NAMES_HASH = 0xc458f1ebu,
    COLLECT_COUNT = 0xc58,
    COLLECT_TABLE = 0xc60,
    MAX_ENTRIES = 1 << 20,
};

static uintptr_t pointer_at(uintptr_t address) {
    if (address == 0 || !kae_readable((const void *)address, sizeof(uintptr_t))) {
        return 0;
    }
    return *(const volatile uintptr_t *)address;
}

static uint32_t u32_at(uintptr_t address) {
    if (address == 0 || !kae_readable((const void *)address, sizeof(uint32_t))) {
        return 0;
    }
    return *(const volatile uint32_t *)address;
}

/* GameData's hash index stores (hash, row index) with linear probing. */
static uintptr_t find_row(uintptr_t group, uint32_t hash, size_t stride) {
    uint32_t rows = u32_at(group);
    uintptr_t values = pointer_at(group + 8);
    uintptr_t index = pointer_at(group + 0x10);
    uint32_t buckets = u32_at(group + 0x1c);
    if (values == 0 || index == 0 || rows == 0 || rows > MAX_ENTRIES ||
        buckets == 0 || buckets > MAX_ENTRIES ||
        !kae_readable((const void *)index, (size_t)buckets * 8)) {
        return 0;
    }

    uint32_t slot = hash % buckets;
    for (uint32_t probes = 0; probes < buckets; ++probes) {
        const volatile uint32_t *entry = (const volatile uint32_t *)(index + (size_t)slot * 8);
        uint32_t key = entry[0];
        if (key == hash) {
            uint32_t row = entry[1];
            return row < rows ? values + (size_t)row * stride : 0;
        }
        if (key == 0) {
            return 0;
        }
        slot = (slot + 1) % buckets;
    }
    return 0;
}

static bool read_scene_names(uintptr_t manager, char names[static 4][64]) {
    uintptr_t row = find_row(manager + 0x670, SCENE_NAMES_HASH, 0x90);
    if (row == 0 || u32_at(row + 0x70) < 4) {
        return false;
    }
    uintptr_t strings = pointer_at(row + 0x78);
    if (strings == 0) {
        return false;
    }
    for (size_t i = 0; i < 4; ++i) {
        uintptr_t field = strings + i * 0x50;
        uintptr_t address = pointer_at(field);
        uint32_t size = u32_at(field + 8);
        if (address == 0 || size == 0 || size > 64 ||
            !kae_readable((const void *)address, size)) {
            return false;
        }
        const volatile char *text = (const volatile char *)address;
        size_t j = 0;
        for (; j + 1 < size; ++j) {
            char ch = text[j];
            if (ch == '\0') {
                break;
            }
            names[i][j] = ch;
        }
        names[i][j] = '\0';
    }
    return true;
}

static uint16_t active_zone(uintptr_t manager) {
    char scene_names[4][64];
    if (!read_scene_names(manager, scene_names)) {
        return ZN_NO_INDEX;
    }
    const char *const names[] = {scene_names[0], scene_names[1], scene_names[2], scene_names[3]};
    return zn_resolve_zone(names);
}

static uint8_t read_age(uintptr_t manager) {
    uintptr_t row = find_row(manager + 0x10, CHILDHOOD_HASH, 0x18);
    if (row == 0 || !kae_readable((const void *)(row + 0x16), 1)) return 0;
    uint8_t value = *(const volatile uint8_t *)(row + 0x16);
    if (value > 1) return 0;
    return value == 1 ? ZN_CHILD : ZN_ADULT;
}

static bool read_collect_count(uintptr_t manager, uint32_t *out) {
    const volatile uint32_t *count = (const volatile uint32_t *)(manager + COLLECT_COUNT);
    if (!kae_readable((const void *)count, sizeof *count)) {
        return false;
    }
    *out = *count;
    return *out <= MAX_ENTRIES;
}

static bool marker_is_obtained(uintptr_t manager, const volatile ZnCollectFlag *entries,
                               uint32_t count, const ZnMarker *marker) {
    if (marker->source == ZN_SOURCE_COLLECT_SIGN) {
        return zn_collect_sign(entries, count, marker->game_id);
    }
    if (marker->source == ZN_SOURCE_GAME_DATA_BOOL) {
        uintptr_t row = find_row(manager + 0x10, (uint32_t)marker->game_id, 0x18);
        return row != 0 && kae_readable((const void *)(row + 0x16), 1) &&
               *(const volatile uint8_t *)(row + 0x16) == 1;
    }
    return false;
}

static bool read_collected(ZnGameSnapshot *snapshot, uintptr_t manager,
                           const volatile ZnCollectFlag *entries,
                           uint32_t count, bool confirm) {
    uint16_t obtained = 0;
    for (size_t i = 0; i < zn_marker_count; ++i) {
        const ZnMarker *marker = &zn_markers[i];
        if (marker->source == ZN_SOURCE_NONE || !marker_is_obtained(manager, entries, count, marker)) {
            continue;
        }
        if (confirm) {
            if (obtained >= snapshot->obtained_count || snapshot->obtained[obtained] != marker->game_id) return false;
        } else {
            if (obtained < ZN_MAX_COLLECT_SIGNS) {
                snapshot->obtained[obtained] = marker->game_id;
            }
        }
        ++obtained;
    }
    if (confirm) return obtained == snapshot->obtained_count;
    if (obtained > ZN_MAX_COLLECT_SIGNS) obtained = ZN_MAX_COLLECT_SIGNS;
    snapshot->obtained_count = obtained;
    return true;
}

ZnGameSnapshot zn_read_snapshot(void) {
    const ZnGameSnapshot hidden = {.zone = ZN_NO_INDEX};
    uintptr_t base = kae_game_base();
    if (base == 0) {
        return hidden;
    }
    uintptr_t scene_manager = pointer_at(base + SCENE_MANAGER_GLOBAL);
    if (scene_manager == 0) {
        return hidden;
    }
    uintptr_t scene = pointer_at(scene_manager + CURRENT_SCENE);
    uintptr_t manager_slot = (uintptr_t)kae_sym("GameDataMgrPtr");
    uintptr_t manager = pointer_at(manager_slot);
    if (scene == 0 || manager == 0) {
        return hidden;
    }

    uint8_t age = read_age(manager);
    if (age == 0) return hidden;
    uint16_t zone = active_zone(manager);

    uint32_t count;
    uintptr_t table = pointer_at(manager + COLLECT_TABLE);
    const volatile ZnCollectFlag *entries = (const volatile ZnCollectFlag *)table;
    ZnGameSnapshot snapshot = {.ready = true, .age = age, .zone = zone};
    snapshot.collect_sign_known = read_collect_count(manager, &count) && table != 0 &&
        (count == 0 || kae_readable((const void *)table, (size_t)count * sizeof *entries));
    if (snapshot.collect_sign_known) read_collected(&snapshot, manager, entries, count, false);

    if (pointer_at(manager_slot) != manager || pointer_at(base + SCENE_MANAGER_GLOBAL) != scene_manager ||
        pointer_at(scene_manager + CURRENT_SCENE) != scene || read_age(manager) != age || active_zone(manager) != zone) {
        return hidden;
    }
    uint32_t confirmed_count;
    if (snapshot.collect_sign_known &&
        (pointer_at(manager + COLLECT_TABLE) != table || !read_collect_count(manager, &confirmed_count) ||
         confirmed_count != count || (count != 0 && !kae_readable((const void *)table, (size_t)count * sizeof *entries)) ||
         !read_collected(&snapshot, manager, entries, count, true))) {
        return hidden;
    }
    return snapshot;
}
