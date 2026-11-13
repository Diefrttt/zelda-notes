import sys
import tempfile
import unittest
import zipfile
import json
import struct
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build import (
    MOD_VERSION,
    package_mod,
    read_nso_build_id,
    release_zip_name,
    require_supported_main,
)


BUILD_ID = bytes.fromhex("E0F3CCFAF50065AE4EA01EB5AEB13B1A45DA3348")


class BuildTests(unittest.TestCase):
    def setUp(self):
        folder = self.enterContext(tempfile.TemporaryDirectory())
        self.main = Path(folder) / "main"
        self.header = bytearray(0x100)
        self.header[:4] = b"NSO0"
        self.header[0x40:0x54] = BUILD_ID

    def test_require_supported_main(self):
        self.main.write_bytes(self.header)
        self.assertEqual(read_nso_build_id(self.main), BUILD_ID)
        self.assertIsNone(require_supported_main(self.main))

    def test_reject_wrong_build(self):
        self.header[0x40] ^= 1
        self.main.write_bytes(self.header)
        with self.assertRaisesRegex(ValueError, "Build ID"):
            require_supported_main(self.main)

    def test_reject_invalid_header(self):
        for invalid in (b"BAD!" + self.header[4:], self.header[:-1]):
            with self.subTest(size=len(invalid)):
                self.main.write_bytes(invalid)
                with self.assertRaisesRegex(ValueError, "NSO0"):
                    read_nso_build_id(self.main)

    def test_reject_nonzero_padding(self):
        self.header[0x54] = 1
        self.main.write_bytes(self.header)
        with self.assertRaisesRegex(ValueError, "Build ID"):
            require_supported_main(self.main)

    def package_inputs(self):
        module = self.main.with_name("subsdk1")
        patch = self.main.with_name("E0F3CCFAF50065AE4EA01EB5AEB13B1A45DA3348.ips")
        notice = self.main.with_name("kaegae.txt")
        for file in (module, patch, notice):
            file.write_bytes(file.name.encode())
        return module, patch, notice

    def test_package_uses_exefs_paths(self):
        module, patch, notice = self.package_inputs()
        output = self.main.with_name("zelda-notes.zip")
        package_mod([module, patch], [notice], output)
        prefix = "0400486024DEC000/Zelda Notes/exefs/"
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(set(archive.namelist()), {
                prefix + "subsdk1", prefix + patch.name, "licenses/kaegae.txt",
            })
            self.assertEqual(archive.read(prefix + "subsdk1"), b"subsdk1")

    def test_package_rejects_unexpected_file(self):
        module, patch, notice = self.package_inputs()
        output = self.main.with_name("zelda-notes.zip")
        for unexpected in ("main.nso", "progress.sav", "subsdk1"):
            with self.subTest(unexpected=unexpected):
                with self.assertRaises(ValueError):
                    package_mod([module, patch, self.main.with_name(unexpected)], [notice], output)
                self.assertFalse(output.exists())

    def test_complete_zip_contains_no_game_assets(self):
        module, patch, notice = self.package_inputs()
        output = self.main.with_name("zelda-notes.zip")
        manifest = self.main.with_name("mod.toml")
        manifest.write_text('id = "zelda-notes.ranch-counter"\n[game]\ntitle = "0400486024DEC000"\n')
        package_mod([module, patch], [notice], output, manifest=manifest)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(set(archive.namelist()), {
                f"0400486024DEC000/Zelda Notes/exefs/{module.name}",
                f"0400486024DEC000/Zelda Notes/exefs/{patch.name}",
                "0400486024DEC000/Zelda Notes/mod.toml", "licenses/kaegae.txt",
            })
        for name in ("main", "progress.sav", "map.webp"):
            with self.subTest(name=name):
                path = self.main.with_name(name)
                path.write_bytes(b"fixture")
                with self.assertRaises(ValueError):
                    package_mod([module, patch], [notice], output, manifest=path)

    def test_map_assets_are_declared_and_verified(self):
        module, patch, notice = self.package_inputs()
        output = self.main.with_name("zelda-notes.zip")
        maps = self.main.with_name("maps")
        maps.mkdir()
        (maps / "manifest.json").write_text(json.dumps({"650001": {"width": 1264, "height": 821}}))
        artwork = maps / "650001.znmap"
        artwork.write_bytes(struct.pack("<4sHH", b"ZNM1", 1264, 821) + b"\x01\x02\x03\xff" * (1264 * 821))
        package_mod([module, patch], [notice], output, maps_dir=maps)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(archive.read("0400486024DEC000/Zelda Notes/romfs/zelda-notes/maps/650001.znmap"), artwork.read_bytes())
            self.assertIn("credits/map-art.txt", archive.namelist())
        (maps / "manifest.json").write_text(json.dumps({"650001": {"width": 1264, "height": 832}}))
        artwork.write_bytes(struct.pack("<4sHH", b"ZNM1", 1264, 832) + b"\x01\x02\x03\xff" * (1264 * 832))
        with self.assertRaises(ValueError):
            package_mod([module, patch], [notice], output, maps_dir=maps)
        artwork.write_bytes(b"ZNM1")
        with self.assertRaises(ValueError):
            package_mod([module, patch], [notice], output, maps_dir=maps)

    def test_icons_asset_is_verified_and_packaged(self):
        module, patch, notice = self.package_inputs()
        output = self.main.with_name("zelda-notes.zip")
        icons = self.main.with_name("icons.znicons")
        rec_bytes = (48 * 48 * 2 + 32 * 32 * 2 + 24 * 24 + 18 * 18) * 4
        icons.write_bytes(struct.pack("<4sHH", b"ZNI1", 1, 2) + b"\xab" * (2 * rec_bytes))
        package_mod([module, patch], [notice], output, icons_file=icons)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(
                archive.read("0400486024DEC000/Zelda Notes/romfs/zelda-notes/icons.znicons"),
                icons.read_bytes(),
            )
        icons.write_bytes(b"ZNI1")
        with self.assertRaises(ValueError):
            package_mod([module, patch], [notice], output, icons_file=icons)

    def test_package_accepts_notice_and_legal_statement(self):
        module, patch, notice = self.package_inputs()
        extra_notice = self.main.with_name("NOTICE.txt")
        extra_notice.write_text("Legal own copy notice + MIT + BSD-2-Clause", encoding="utf-8")
        output = self.main.with_name("zelda-notes.zip")
        package_mod([module, patch], [notice, extra_notice], output)
        with zipfile.ZipFile(output) as archive:
            self.assertIn("licenses/NOTICE.txt", archive.namelist())
        repo_notice = Path(__file__).resolve().parents[1] / "NOTICE.txt"
        self.assertTrue(repo_notice.is_file())
        notice_text = repo_notice.read_text(encoding="utf-8").lower()
        self.assertIn("legally owned", notice_text)
        self.assertIn("diefrttt", notice_text)

    def test_release_version_and_zip_naming(self):
        self.assertEqual(MOD_VERSION, "0.5.4")
        self.assertEqual(release_zip_name("en"), "zelda-notes-v0.5.4-fritchii-en.zip")
        self.assertEqual(release_zip_name("es"), "zelda-notes-v0.5.4-fritchii-es.zip")
        self.assertEqual(release_zip_name("en", probe=True), "zelda-notes-fritchii-probe.zip")
