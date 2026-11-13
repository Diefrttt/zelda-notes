#include <kaegae.h>
#include <stdbool.h>
#include <stdatomic.h>

#include "hud.h"
#include "map_texture.h"
#include "zn_lang.h"
#include "zn_mode.h"

#if !ZN_PROBE
static ZnMapPanel panel;
static atomic_bool capture_input;
static atomic_bool map_available;
static atomic_uint queued_actions;
static atomic_uint pan_samples[ZN_MAP_CONTROLLER_COUNT];

static void on_input(KaeInput *seen, const KaeInput *real, void *user) {
    (void)user;
    static ZnMapController states[ZN_MAP_CONTROLLER_COUNT];
    ZnMapController *state = zn_map_controller(states, real->controller, real->style);
    if (state == NULL) return;
    size_t index = (size_t)(state - states);
    if (!real->connected) {
        *state = (ZnMapController){0};
        atomic_store(&pan_samples[index], 0);
        return;
    }
    const uint64_t chord = KAE_L | KAE_R3;
    const uint64_t controls = KAE_A | KAE_B | KAE_X | KAE_Y | KAE_LEFT | KAE_RIGHT |
                              KAE_UP | KAE_DOWN | KAE_L | KAE_R | KAE_R3 | KAE_ZL | KAE_ZR;
    const uint64_t buttons = real->buttons;
    ZnMapInput current = 0;
    if ((buttons & chord) == chord) current |= ZN_MAP_TOGGLE;
    if (buttons & KAE_A) current |= ZN_MAP_ACCEPT;
    if (buttons & KAE_B) current |= ZN_MAP_BACK;
    if (buttons & KAE_X) current |= ZN_MAP_NEXT_PROGRESS;
    if (buttons & KAE_Y) current |= ZN_MAP_NEXT_AGE_FLOOR;
    if (buttons & KAE_LEFT) current |= ZN_MAP_NAV_LEFT;
    if (buttons & KAE_RIGHT) current |= ZN_MAP_NAV_RIGHT;
    if (buttons & KAE_UP) current |= ZN_MAP_NAV_UP;
    if (buttons & KAE_DOWN) current |= ZN_MAP_NAV_DOWN;
    if (buttons & KAE_L) current |= ZN_MAP_PREV_COL;
    if (buttons & KAE_R) current |= ZN_MAP_NEXT_COL;
    if (buttons & KAE_ZL) current |= ZN_MAP_PREV_ZONE;
    if (buttons & KAE_ZR) current |= ZN_MAP_NEXT_ZONE;

    ZnMapInput actions = zn_map_pressed(&state->held, current);
    const bool available = atomic_load(&map_available);
    const bool open = available && atomic_load(&capture_input);
    if (kae_menu_open()) return;
    state->consumed &= buttons;
    if (open) {
        state->consumed |= buttons & controls;
        uint32_t stick = (uint16_t)real->rx | ((uint32_t)(uint16_t)real->ry << 16);
        atomic_store(&pan_samples[index], stick);
        seen->rx = 0;
        seen->ry = 0;
    } else {
        atomic_store(&pan_samples[index], 0);
    }
    if (available && (current & ZN_MAP_TOGGLE)) state->consumed |= chord;
    seen->buttons &= ~state->consumed;
    if (!available) return;
    if (!open) actions &= ZN_MAP_TOGGLE;
    if (actions != 0) atomic_fetch_or(&queued_actions, actions);
}

/* Reads the map picture on the game's thread so the present callback never touches RomFS. */
static void on_frame(void *user) {
    (void)user;
    zn_map_texture_tick();
}

static bool supported_game(void) {
    static const char expected[] = "E0F3CCFAF50065AE4EA01EB5AEB13B1A45DA3348";
    const char *build = kae_game_build();
    for (size_t i = 0; i < sizeof expected; ++i) {
        if (build[i] != expected[i]) {
            return false;
        }
    }
    return true;
}
#endif

#if ZN_PROBE
static void draw_counter(const KaeFrame *frame, const char *text) {
    int scale = frame->height >= 1080 ? 2 : 1;
    int margin = frame->height / 40;
    int y = frame->height - margin - kae_text_height(scale, text);
    if (y < 0 || frame->width < margin + kae_text_width(scale, text) + scale) {
        return;
    }
    kae_draw_text(margin + scale, y + scale, scale, 0x181818, text);
    kae_draw_text(margin, y, scale, 0xFFFFFF, text);
}
#endif

static void zn_draw_frame(const KaeFrame *frame, void *user) {
    (void)user;
#if ZN_PROBE
    static bool logged;
    if (!logged) {
        logged = true;
        KAE_LOG("HUD draw: %d x %d", frame->width, frame->height);
    }
    draw_counter(frame, "0/3");
#else
    ZnGameSnapshot snapshot = zn_read_snapshot();
    const bool available = zn_map_can_draw(frame->width, frame->height);
    atomic_store(&map_available, available);
    ZnMapInput actions = atomic_exchange(&queued_actions, 0);
    if (available) zn_map_update(&panel, actions, &snapshot);
    else panel.open = false;
    atomic_store(&capture_input, panel.open);
    if (kae_menu_open()) return;
    if (panel.open) {
        if (panel.floor < zn_floor_count) {
            int dx = 0, dy = 0;
            for (size_t i = 0; i < ZN_MAP_CONTROLLER_COUNT; ++i) {
                uint32_t sample = atomic_load(&pan_samples[i]);
                int x = (int16_t)(sample & UINT16_MAX);
                int y = (int16_t)(sample >> 16);
                if (x < -6500 || x > 6500 || y < -6500 || y > 6500) { dx = x; dy = y; break; }
            }
            zn_map_move(&panel.view, &zn_artwork[panel.floor], actions, dx, dy);
        }
        zn_map_draw(frame, &panel, &snapshot);
        return;
    }
    /* In-game HUD overlay disabled per user request: full info is inside the L+R3 panel */
#endif
}

static int start(void) {
#if !ZN_PROBE
    if (!supported_game()) {
        return KAE_ERR_UNAVAILABLE;
    }
    int input_status = kae_on_input(on_input, 0, 0);
#if ZN_LANG_EN
    if (input_status != KAE_OK) KAE_LOG("Map input unavailable: %d", input_status);
#else
    if (input_status != KAE_OK) KAE_LOG("Entrada del mapa no disponible: %d", input_status);
#endif
    int frame_status = kae_on_frame(on_frame, 0, 0);
#if ZN_LANG_EN
    if (frame_status != KAE_OK) KAE_LOG("Async floor loader unavailable: %d", frame_status);
#else
    if (frame_status != KAE_OK) KAE_LOG("Carga de planos fuera del dibujo no disponible: %d", frame_status);
#endif
#endif
#if ZN_LANG_EN
    KAE_LOG("Zelda Notes %s, game %s", ZN_PROBE ? "HUD probe" : "map & progress tracker", kae_game_version());
#else
    KAE_LOG("Zelda Notes %s, game %s", ZN_PROBE ? "HUD probe" : "mapa y progreso", kae_game_version());
#endif
    return kae_on_draw(zn_draw_frame, 0, 0);
}

KAE_MOD("zelda-notes.ranch-counter", "0.5.4", start, 0);
