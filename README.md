# Zelda Notes

Interactive map, live save-file tracker, and in-game companion mod for *The Legend of Zelda: Ocarina of Time* (Switch 2 Edition).

> **Nota en español:** Zelda Notes ofrece dos entregas complementarias: una aplicación de escritorio para Windows con overlay transparente (`v0.2.0`) y un mod nativo para el emulador Fritchii (`v0.5.4`, builds en español e inglés, apertura con `L + R3` y diseño "Zero HUD clutter" sin indicadores fijos en pantalla). Podés consultar los enlaces de descarga directa en las secciones siguientes.

---

## Deliverables

Zelda Notes provides two companion experiences tailored for playing the Switch 2 remake:

### 1. Windows Desktop Companion & Transparent Overlay (`v0.2.0`)
- **Interactive Multi-Floor Map:** Complete map of Hyrule Field and all dungeons with dual-age toggle (Child and Adult) and floor-by-floor navigation.
- **Live Save Reader:** Reads progress in real-time across all 6 save slots directly from disk, tracking Gold Skulltulas, Heart Pieces, and dungeon bosses without modifying game files.
- **Process Memory Reader:** High-speed memory synchronization using native Windows APIs to track Link's current location, active scene, and age from running emulator processes.
- **Transparent Borderless Overlay:** Seamless, click-through, auto-syncing letterboxed overlay that aligns perfectly over the game window at any display resolution.
- **Distribution Artifacts:** Distributed as both a standard Windows installer (`zelda-notes-0.2.0-win64-setup.exe`) and a lightweight standalone portable bundle (`zelda-notes-0.2.0-win64-portable.zip`).
- **Release:** [Desktop Companion v0.2.0](https://github.com/Diefrttt/zelda-notes/releases/tag/desktop-v0.2.0)

### 2. Native Fritchii Mod (`v0.5.4`)
- **Zero HUD Clutter:** Designed for maximum immersion. Does not render any persistent or intrusive corner overlays during regular gameplay.
- **On-Demand Panel (`L + R3`):** Press `L + R3` simultaneously on your controller at any point to toggle the full interactive map and objectives drawer in-game.
- **Rich Atlas:** Features 632 markers and 66 pre-rendered map backgrounds with high-resolution typography.
- **Controller Bindings & Navigation:**
  - **`L + R3`:** Open or close the panel.
  - **`L / R`:** Switch between the three panel columns (`Categories`, `Map`, `Objectives`).
  - **`ZL / ZR`:** Switch active zone / map area.
  - **D-Pad:** Menu, category, list, and zoom navigation (left analog stick is intentionally unmapped to prevent accidental input during gameplay).
  - **Right Analog Stick (`R-Stick`):** Pan the map view freely.
  - **`Y`:** Toggle Child / Adult age outdoors, or cycle floors/variants inside multi-floor dungeons.
  - **`X`:** Cycle progress filters (e.g. all, uncollected, Sin datos).
  - **`A`:** Apply Focus filter (when in Categories column) or center the selected objective on the map (when in Map or Objectives column).
  - **`B`:** Clear active Focus filter first; if already cleared, close the panel and restore Link's controls.
- **Dual Language Builds:** Available in dedicated English (`EN`) and Spanish (`ES`) release packages.
- **Release:** [Native Fritchii Mod v0.5.4](https://github.com/Diefrttt/zelda-notes/releases/tag/mod-v0.5.4)

---

## Legal & Ownership

- **Fan Project:** Zelda Notes is an unofficial, non-profit open-source fan project developed strictly for personal tracking, research, and companion use. It is not affiliated with, endorsed by, or sponsored by Nintendo Co., Ltd.
- **Author's Personal Dump:** Development, reverse engineering, and verification were conducted solely using a legally acquired retail physical/digital copy personally dumped by the author (*The Legend of Zelda: Ocarina of Time* Switch 2 Remake `v1.1.1`).
- **No Proprietary Assets:** This repository and its binary releases **DO NOT** contain, host, or distribute Nintendo ROMs, game dumps, cryptographic keys (production or title keys), system firmware, decrypted executables, copyrighted artwork, or proprietary save files.
- **User Requirement:** Every user must own a legally acquired copy of the game and provide their own keys and dumps to build or run the software.
- **Trademarks:** *The Legend of Zelda*, *Ocarina of Time*, and *Nintendo Switch* are trademarks of Nintendo Co., Ltd.

---

## Quick Links to Releases

- **Desktop Companion & Overlay:** [GitHub Release `desktop-v0.2.0`](https://github.com/Diefrttt/zelda-notes/releases/tag/desktop-v0.2.0)
- **Native Fritchii Mod:** [GitHub Release `mod-v0.5.4`](https://github.com/Diefrttt/zelda-notes/releases/tag/mod-v0.5.4)

---

## Building & Development

### Prerequisites
- **Node.js:** v22 or v24
- **Rust & Cargo:** Stable toolchain (for Tauri desktop app and memory reader)
- **Python:** 3.11+ with Pillow (for mod packaging)
- **LLVM:** 15+ (for native mod compilation)

### Getting Started

Clone the repository and install dependencies:
```bash
git clone https://github.com/Diefrttt/zelda-notes.git
cd zelda-notes
npm install
```

### Ingest Map Assets
Map tiles (`data/tiles/`) and upstream CSS stylesheets (`data/icons/site.css`) are omitted from version control. Ingest them locally before running the app:
```bash
npm run ingest
```

### Desktop Companion & Overlay
Run the desktop companion locally in development mode:
```bash
npm run desktop
```
*(Or preview UI in browser with `npm run dev`)*

Build the standalone portable Windows executable (`apps/web/src-tauri/target/release/zelda-notes.exe`):
```bash
npm run build:exe
```

Build the standard Windows NSIS installer (`.exe`):
```bash
npm --workspace=web run tauri build -- --bundles nsis
```

### Native Fritchii Mod
To build the native mod for Fritchii, consult [mods/fritchii/README.md](mods/fritchii/README.md) for toolchain details. Building requires the decompressed `main` NSO executable and the KaeGae/kaepora framework checkout. Compile for your preferred language (`--lang en` or `--lang es` for the v0.5.4 bilingual release builds):

```bash
# English build (v0.5.4)
python mods/fritchii/build.py --main <path/to/main> --kaepora <path/to/kaepora> --lang en

# Spanish build (v0.5.4)
python mods/fritchii/build.py --main <path/to/main> --kaepora <path/to/kaepora> --lang es
```

### Running Tests

Execute the Node.js test suite (21 unit tests covering core map math, coordinate projections, translations, and save parsing):
```bash
npm test
```

Execute the Rust test suite (13 unit tests covering memory reading, window bounds synchronization, and save fixtures):
```bash
cd apps/web/src-tauri
cargo test
```

---

## Credits & Attribution

- **Zelda Maps:** Map marker coordinates, area boundaries, and base guide text derived from [Zelda Maps](https://zeldamaps.com).
- **KaeGae Core / kaepora:** In-game hook and native overlay injection framework created by [KaboWabo / Kabosune](https://github.com/Kabosune/oot-remake-modding).
- **Spleen Font:** Spleen 8x16 bitmap font authored by Frederic Cambus (BSD 2-Clause License).
- **IcoMoon & Vector Badges:** UI icon assets and custom SVG badges rendered into binary icon atlas packages at build time.
- Detailed notices and license texts are documented in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).  
Copyright (c) 2026 Diefrttt.
