import argparse
import json
import shutil
import struct
import subprocess
import sys
import tomllib
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory


EXPECTED_BUILD_ID = bytes.fromhex("E0F3CCFAF50065AE4EA01EB5AEB13B1A45DA3348")
MOD_DIR = Path(__file__).resolve().parent
BUILD_DIR = MOD_DIR / "build"
TITLE_ID = "0400486024DEC000"
MOD_VERSION = "0.5.4"
SUPPORTED_LANGS = ("en", "es")
PATCH_NAME = f"{EXPECTED_BUILD_ID.hex().upper()}.ips"
MAP_SOURCE_MAX_SIDE = 1264
MAP_SOURCE_MAX_PIXELS = 1024 * 1024


def release_zip_name(lang: str = "es", *, probe: bool = False) -> str:
    if probe:
        return "zelda-notes-fritchii-probe.zip"
    if lang not in SUPPORTED_LANGS:
        raise ValueError(f"Idioma no soportado: {lang}")
    return f"zelda-notes-v{MOD_VERSION}-fritchii-{lang}.zip"


def read_nso_build_id(main_path: Path) -> bytes:
    with main_path.open("rb") as source:
        header = source.read(0x100)
    if len(header) != 0x100 or header[:4] != b"NSO0":
        raise ValueError(f"{main_path}: se esperaba una cabecera NSO0 completa")
    return header[0x40:0x60].rstrip(b"\0")


def require_supported_main(main_path: Path) -> None:
    found = read_nso_build_id(main_path)
    if found != EXPECTED_BUILD_ID:
        raise ValueError(f"Build ID {found.hex().upper()} incompatible con Zelda Notes")


def require_pinned_kaepora(checkout: Path) -> None:
    lock = json.loads((MOD_DIR / "kaepora.lock.json").read_text(encoding="utf-8"))
    revision = subprocess.check_output(
        ["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True
    ).strip()
    status = subprocess.check_output(
        ["git", "-C", str(checkout), "status", "--porcelain"], text=True
    ).strip()
    if revision != lock["commit"] or status:
        raise ValueError(f"Kaepora requiere un checkout limpio en {lock['commit']}")


def package_mod(
    module_paths: list[Path],
    license_paths: list[Path],
    output: Path,
    *,
    probe: bool = False,
    manifest: Path | None = None,
    maps_dir: Path | None = None,
    icons_file: Path | None = None,
) -> None:
    if sorted(path.name for path in module_paths) != sorted(("subsdk1", PATCH_NAME)):
        raise ValueError("El paquete requiere exactamente subsdk1 y el parche de la build")
    if manifest is not None:
        if manifest.name != "mod.toml":
            raise ValueError("El manifiesto del paquete debe llamarse mod.toml")
        parsed = tomllib.loads(manifest.read_text(encoding="utf-8"))
        if parsed.get("id") != "zelda-notes.ranch-counter" or parsed.get("game", {}).get("title") != TITLE_ID:
            raise ValueError("El manifiesto debe corresponder al mod y al juego")
    license_names = [path.name for path in license_paths]
    if not license_names or len(set(license_names)) != len(license_names) or not set(license_names) <= {
        "kaegae.txt", "kaegae-font.txt", "NOTICE.txt",
    }:
        raise ValueError("Avisos de licencia inválidos o duplicados")

    maps = []
    if maps_dir is not None:
        artwork = json.loads((maps_dir / "manifest.json").read_text(encoding="utf-8"))
        for floor, metadata in sorted(artwork.items()):
            if not floor.isascii() or not floor.isdecimal():
                raise ValueError(f"ID de plano inválido: {floor}")
            file = maps_dir / f"{floor}.znmap"
            with file.open("rb") as source:
                header = source.read(8)
            if len(header) != 8:
                raise ValueError(f"Plano truncado: {floor}")
            magic, width, height = struct.unpack("<4sHH", header)
            if (magic != b"ZNM1" or not 1 <= width <= MAP_SOURCE_MAX_SIDE or not 1 <= height <= MAP_SOURCE_MAX_SIDE
                    or width * height > MAP_SOURCE_MAX_PIXELS
                    or width != metadata["width"] or height != metadata["height"]
                    or file.stat().st_size != 8 + width * height * 4):
                raise ValueError(f"Fondo inválido para el plano {floor}")
            maps.append(file)

    if icons_file is not None:
        with icons_file.open("rb") as source:
            header = source.read(8)
        if len(header) != 8:
            raise ValueError("Atlas de iconos truncado")
        magic, version, count = struct.unpack("<4sHH", header)
        rec_bytes = (48 * 48 * 2 + 32 * 32 * 2 + 24 * 24 + 18 * 18) * 4
        if magic != b"ZNI1" or version != 1 or not 1 <= count <= 42 or icons_file.stat().st_size != 8 + count * rec_bytes:
            raise ValueError("Atlas de iconos inválido")

    root = f"{TITLE_ID}/Zelda Notes" + (" Probe" if probe else "")
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as tmp:
        staged = Path(tmp) / "package.zip"
        with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in module_paths:
                archive.write(path, f"{root}/exefs/{path.name}")
            if manifest is not None:
                archive.write(manifest, f"{root}/mod.toml")
            for path in license_paths:
                archive.write(path, f"licenses/{path.name}")
            if maps_dir is not None:
                assets = f"{root}/romfs/zelda-notes/maps"
                archive.write(maps_dir / "manifest.json", f"{assets}/manifest.json")
                for path in maps:
                    archive.write(path, f"{assets}/{path.name}")
                archive.writestr("credits/map-art.txt", "Map artwork © Nintendo.\nTiles and coordinates from Zelda Maps (https://zeldamaps.com/).\nPrepared from the local Zelda Notes cache.\n")
            if icons_file is not None:
                archive.write(icons_file, f"{root}/romfs/zelda-notes/icons.znicons")
        staged.replace(output)


def build_mod(
    main_path: Path,
    checkout: Path,
    *,
    probe: bool = False,
    lang: str = "es",
    shared_maps: Path | None = None,
    shared_icons: Path | None = None,
) -> Path:
    if lang not in SUPPORTED_LANGS:
        raise ValueError(f"Idioma no soportado: {lang}")
    require_supported_main(main_path)
    require_pinned_kaepora(checkout)
    BUILD_DIR.mkdir(exist_ok=True)
    with TemporaryDirectory(dir=BUILD_DIR) as tmp:
        flat_main = Path(tmp) / "main.bin"
        staged_zip = Path(tmp) / "upstream.zip"
        mod = Path(tmp) / "mod"
        renderer = Path(tmp) / "kaegae"
        shutil.copytree(checkout, renderer, ignore=shutil.ignore_patterns(".git", "__pycache__", "releases"))
        subprocess.run(["git", "apply", MOD_DIR / "patches/kaegae-map-texture.patch"], cwd=renderer, check=True)
        shutil.copyfile(MOD_DIR / "patches/zn_map_gpu.inc", renderer / "api/core/zn_map_gpu.inc")
        shutil.copytree(MOD_DIR / "src", mod / "src")
        shutil.copyfile(MOD_DIR / "mod.toml", mod / "mod.toml")
        (mod / "zn_mode.h").write_text(f"#define ZN_PROBE {int(probe)}\n", encoding="utf-8")
        (mod / "src/zn_lang.h").write_text(f"#define ZN_LANG_EN {1 if lang == 'en' else 0}\n", encoding="utf-8")
        data = MOD_DIR.parents[1] / "data"
        maps = None if probe else (shared_maps if shared_maps is not None else Path(tmp) / "maps")
        icons = None if probe else (shared_icons if shared_icons is not None else Path(tmp) / "icons.znicons")
        catalog = ["node", MOD_DIR / "scripts/export-catalog.mjs", data, mod / "src/catalog_gen.c", "--lang", lang]
        if maps is not None and shared_maps is None:
            subprocess.run([sys.executable, MOD_DIR / "scripts/compose-map-art.py", data, maps], check=True)
        if maps is not None:
            catalog.append(maps / "manifest.json")
        if icons is not None and shared_icons is None:
            subprocess.run(["node", MOD_DIR / "scripts/export-icons.mjs", data, icons, Path(tmp) / "icons.json"], check=True)
        subprocess.run(catalog, check=True)
        name = "Zelda Notes Probe" if probe else "Zelda Notes"
        subprocess.run(
            [sys.executable, checkout / "tools/flatten_nso.py", main_path, flat_main],
            check=True,
        )
        subprocess.run(
            [sys.executable, "-X", "utf8", renderer / "tools/kaemod.py", mod, "--bundle",
             "--verify-main", flat_main, "--name", name, "--out", staged_zip],
            check=True,
        )
        output = BUILD_DIR / release_zip_name(lang, probe=probe)
        root = f"{TITLE_ID}/{name}"
        with zipfile.ZipFile(staged_zip) as upstream:
            modules = []
            for mod_file in ("subsdk1", PATCH_NAME):
                local = Path(tmp) / mod_file
                local.write_bytes(upstream.read(f"{root}/exefs/{mod_file}"))
                modules.append(local)
            manifest = Path(tmp) / "mod.toml"
            manifest.write_bytes(upstream.read(f"{root}/mod.toml"))

        licenses = []
        for source, target in (("LICENSE", "kaegae.txt"), ("api/core/font/LICENSE", "kaegae-font.txt")):
            local = Path(tmp) / target
            local.write_bytes((checkout / source).read_bytes())
            licenses.append(local)
        notice_path = MOD_DIR / "NOTICE.txt"
        if notice_path.is_file():
            local_notice = Path(tmp) / "NOTICE.txt"
            local_notice.write_bytes(notice_path.read_bytes())
            licenses.append(local_notice)
        package_mod(modules, licenses, output, probe=probe, manifest=manifest, maps_dir=maps, icons_file=icons)
    return output


def build_mods(
    main_path: Path,
    checkout: Path,
    *,
    probe: bool = False,
    langs: tuple[str, ...] | list[str] = SUPPORTED_LANGS,
) -> list[Path]:
    targets = [langs[0] if langs else "en"] if probe else list(langs)
    if probe or len(targets) <= 1:
        return [build_mod(main_path, checkout, probe=probe, lang=target) for target in targets]
    BUILD_DIR.mkdir(exist_ok=True)
    data = MOD_DIR.parents[1] / "data"
    with TemporaryDirectory(dir=BUILD_DIR) as shared_tmp:
        shared_maps = Path(shared_tmp) / "maps"
        shared_icons = Path(shared_tmp) / "icons.znicons"
        subprocess.run([sys.executable, MOD_DIR / "scripts/compose-map-art.py", data, shared_maps], check=True)
        subprocess.run(["node", MOD_DIR / "scripts/export-icons.mjs", data, shared_icons, Path(shared_tmp) / "icons.json"], check=True)
        return [
            build_mod(main_path, checkout, probe=False, lang=target, shared_maps=shared_maps, shared_icons=shared_icons)
            for target in targets
        ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Compila el mod local de Zelda Notes")
    parser.add_argument("--main", type=Path, required=True, help="main NSO descomprimido de la copia local")
    parser.add_argument("--kaepora", type=Path, required=True, help="checkout de Kaepora")
    parser.add_argument("--probe", action="store_true", help="dibuja un contador de diagnóstico")
    parser.add_argument("--lang", choices=("en", "es", "all"), default="all", help="idioma de salida (en, es o all)")
    args = parser.parse_args()
    try:
        langs = SUPPORTED_LANGS if args.lang == "all" else (args.lang,)
        for built in build_mods(args.main.resolve(), args.kaepora.resolve(), probe=args.probe, langs=langs):
            print(built)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
