import runpy
import struct
import tempfile
import unittest
from pathlib import Path

from PIL import Image

art = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/compose-map-art.py'))


class MapArtworkTests(unittest.TestCase):
    def test_tiles_are_north_up_and_transparent_space_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            tile_dir = Path(tmp)
            for x, y, color in ((0, 0, 'red'), (1, 0, 'green'), (0, 1, (0, 0, 0, 0)), (1, 1, 'blue')):
                Image.new('RGBA', (256, 256), color).save(tile_dir / f'1_{x}_{y}.webp', lossless=True)
            image = art['compose_floor'](tile_dir, (0, -256, 256, 0), 32)
            self.assertEqual(image.bounds, (0, -256, 256, 0))
            self.assertEqual(image.rgba[:4], bytes((255, 0, 0, 255)))
            self.assertEqual(image.rgba[-4:], bytes((0, 0, 255, 255)))
            self.assertEqual(image.rgba[31 * 32 * 4:31 * 32 * 4 + 4], bytes((32, 40, 49, 255)))
            encoded = art['encode_artwork'](image)
            self.assertEqual(encoded[:8], struct.pack('<4sHH', b'ZNM1', 32, 32))
            self.assertEqual(len(encoded), 8 + 32 * 32 * 4)
