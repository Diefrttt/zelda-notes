import struct
import sys
from pathlib import Path
from PIL import Image


def extract_cell_rgba(pb, pw, cell_x, cell_y, cell_w=64, cell_h=64):
    sprite = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
    ps = sprite.load()
    for py in range(cell_h):
        sy = cell_y + py
        for px in range(cell_w):
            sx = cell_x + px
            rb, gb, bb = pb[sx, sy]
            rw, gw, bw = pw[sx, sy]
            diff = max(rw - rb, gw - gb, bw - bb)
            a = max(0, min(255, 255 - diff))
            if a == 0:
                ps[px, py] = (0, 0, 0, 0)
            else:
                r = max(0, min(255, int(rb * 255 / a)))
                g = max(0, min(255, int(gb * 255 / a)))
                b = max(0, min(255, int(bb * 255 / a)))
                ps[px, py] = (r, g, b, a)
    return sprite


def normalize_sprite(sprite: Image.Image, target_sz: int) -> Image.Image:
    bbox = sprite.getbbox()
    if not bbox:
        return Image.new("RGBA", (target_sz, target_sz), (0, 0, 0, 0))
    cropped = sprite.crop(bbox)
    cw, ch = cropped.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - cw) // 2, (side - ch) // 2), cropped)
    if side != target_sz:
        square = square.resize((target_sz, target_sz), Image.Resampling.LANCZOS)
    return square


def dim_sprite(sprite: Image.Image, scale: float = 0.42) -> Image.Image:
    r, g, b, a = sprite.split()
    a = a.point(lambda p: int(p * scale))
    return Image.merge("RGBA", (r, g, b, a))


def main():
    if len(sys.argv) != 5:
        raise SystemExit("Usage: pack-icons.py <black.png> <white.png> <count> <out.znicons>")
    black = Image.open(sys.argv[1]).convert("RGB")
    white = Image.open(sys.argv[2]).convert("RGB")
    count = int(sys.argv[3])
    out_path = Path(sys.argv[4])

    pb = black.load()
    pw = white.load()

    out = bytearray(struct.pack("<4sHH", b"ZNI1", 1, count))
    band_sizes = [48, 32, 24, 18]
    for i in range(count):
        col = i % 16
        row = i // 16
        extracted = {}
        for b_idx, sz in enumerate(band_sizes):
            cx = col * 64
            cy = (b_idx * 3 + row) * 64
            extracted[sz] = normalize_sprite(extract_cell_rgba(pb, pw, cx, cy), sz)

        out.extend(extracted[48].tobytes())
        out.extend(dim_sprite(extracted[48]).tobytes())
        out.extend(extracted[32].tobytes())
        out.extend(dim_sprite(extracted[32]).tobytes())
        out.extend(extracted[24].tobytes())
        out.extend(extracted[18].tobytes())

    out_path.write_bytes(bytes(out))


if __name__ == "__main__":
    main()
