import argparse
import json
import math
import re
import struct
from pathlib import Path
from typing import NamedTuple

from PIL import Image


TILE_SIDE = 256
WORLD_MAP_SIDE = 1264
BACKGROUND = (32, 40, 49, 255)
DEFAULT_BOUNDS = (0, -256, 256, 0)
Bounds = tuple[float, float, float, float]


class Artwork(NamedTuple):
    width: int
    height: int
    bounds: Bounds
    rgba: bytes


def compose_floor(tile_dir: Path, bounds: Bounds, max_side: int = 1024, *, oversample: bool = False) -> Artwork:
    west, south, east, north = bounds
    span = max(east - west, north - south)
    if not (east > west and north > south and all(map(math.isfinite, bounds)) and 1 <= max_side <= WORLD_MAP_SIDE):
        raise ValueError(f"Límites de mapa inválidos: {bounds}")
    zooms = sorted({int(match[1]) for file in tile_dir.iterdir()
                    if (match := re.fullmatch(r"([0-9])_\d+_\d+\.webp", file.name))})
    if not zooms:
        raise ValueError(f"Plano sin mosaicos: {tile_dir}")
    source_side = max_side * 2 if oversample else max_side
    zoom = next((z for z in zooms if span * (1 << z) >= source_side), zooms[-1])
    scale = 1 << zoom
    left, top = math.floor(west * scale), math.floor(-north * scale)
    right, bottom = math.ceil(east * scale), math.ceil(-south * scale)
    composed = Image.new("RGBA", (right - left, bottom - top), BACKGROUND)
    for ty in range(top // TILE_SIDE, (bottom - 1) // TILE_SIDE + 1):
        for tx in range(left // TILE_SIDE, (right - 1) // TILE_SIDE + 1):
            path = tile_dir / f"{zoom}_{tx}_{ty}.webp"
            if not path.is_file():
                continue
            with Image.open(path) as tile:
                if tile.size != (TILE_SIDE, TILE_SIDE):
                    raise ValueError(f"Mosaico de tamaño inesperado: {path}")
                composed.alpha_composite(tile.convert("RGBA"), (tx * TILE_SIDE - left, ty * TILE_SIDE - top))
    composed.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return Artwork(*composed.size, (left / scale, -bottom / scale, right / scale, -top / scale), composed.tobytes())


def encode_artwork(art: Artwork) -> bytes:
    return struct.pack("<4sHH", b"ZNM1", art.width, art.height) + art.rgba


def compose_catalog(data: Path, output: Path) -> None:
    maps = json.loads((data / "maps.json").read_text(encoding="utf-8"))
    output.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for map_data in maps:
        for floor in map_data["subMap"]:
            floor_id = floor["id"]
            if not floor_id.isascii() or not floor_id.isdecimal() or floor_id in manifest:
                raise ValueError(f"ID de plano inválido o repetido: {floor_id}")
            bounds = DEFAULT_BOUNDS
            if floor.get("bounds"):
                (south, west), (north, east) = floor["bounds"]
                bounds = (west, south, east, north)
            is_world = map_data["id"] == "65000"
            max_side = WORLD_MAP_SIDE if is_world else 1024
            art = compose_floor(data / "tiles" / floor["tileURL"], bounds, max_side, oversample=is_world)
            (output / f"{floor_id}.znmap").write_bytes(encode_artwork(art))
            manifest[floor_id] = {"width": art.width, "height": art.height, "bounds": art.bounds}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"{len(manifest)} planos preparados")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compone fondos a partir de los mosaicos locales")
    parser.add_argument("data", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    compose_catalog(args.data, args.output)
