import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readProgress, readProgressAge, readCaption, readSlot } from '../src/index.mjs';
import { countByArea } from '../../core/src/index.mjs';

const markers = JSON.parse(readFileSync(new URL('../../../data/markers.json', import.meta.url), 'utf8'));
const knownIds = new Set(markers.filter((m) => /^\d+$/.test(m.gameId ?? '')).map((m) => m.gameId));
const fx = (slot, f) => new URL(`./fixtures/slot_0${slot}/${f}`, import.meta.url);
const SCENES = ['Market', 'TimeTemple', 'TimeTemple', 'TimeTemple', 'HyruleField', 'Market'];
const AGES = ['adult', 'child', 'child', 'adult', 'adult', 'adult'];

test('all 6 slots: 14 collected (11 skulltulas + 3 boss hearts)', () => {
  for (let i = 0; i < 6; i++) {
    const got = readProgress(readFileSync(fx(i, 'progress.sav')), knownIds);
    assert.equal(got.size, 14, `slot ${i}`);
    const recs = markers.filter((m) => got.has(m.gameId)).map((m) => m.gameRecord);
    assert.equal(recs.filter((r) => r === 'MapParam.CollectSign').length, 11);
    assert.equal(recs.filter((r) => r === 'Object.Obj_Heart_Container').length, 3);
  }
});

test('caption: scene and age per slot', () => {
  SCENES.forEach((scene, i) => {
    const cap = readCaption(readFileSync(fx(i, 'caption.sav')));
    assert.equal(cap.scene, scene);
    assert.equal(cap.age, AGES[i], `caption age slot ${i}`);
  });
});

test('progress and readSlot detect Child vs Adult age accurately', async () => {
  for (let i = 0; i < 6; i++) {
    assert.equal(readProgressAge(readFileSync(fx(i, 'progress.sav'))), AGES[i], `progress age slot ${i}`);
    const slotRes = await readSlot({ slot: `slot_0${i}`, emulator: 'eden', dir: fileURLToPath(new URL(`./fixtures/slot_0${i}/`, import.meta.url)), mtimeMs: 0 }, knownIds);
    assert.equal(slotRes.age, AGES[i], `slot ${i}`);
  }
});

test("Dodongo's Cavern counts 4/14 (value categories default)", () => {
  const got = readProgress(readFileSync(fx(0, 'progress.sav')), knownIds);
  const counted = countByArea(markers, got);
  assert.deepEqual(counted["Dodongo's Cavern"], { done: 4, total: 14 });
  assert.deepEqual(counted['Kakariko Village'], { done: 2, total: 24 });
});

test('corrupt/truncated slot does not throw', async () => {
  assert.throws(() => readProgress(Buffer.alloc(10), knownIds));
  const bad = Buffer.from(readFileSync(fx(0, 'progress.sav')));
  bad[0] = 0;
  assert.throws(() => readProgress(bad, knownIds), /bad header/);
  const r = await readSlot({ slot: 'x', emulator: 'e', dir: new URL('./nonexistent/', import.meta.url).pathname, mtimeMs: 0 }, knownIds);
  assert.equal(r.ok, false);
});

test('fixtures contain zero embedded JPEGs and captions are small deterministic buffers', () => {
  const jpegSoi = Buffer.from([0xff, 0xd8, 0xff]);
  for (let i = 0; i < 6; i++) {
    for (const file of ['progress.sav', 'caption.sav']) {
      const buf = readFileSync(fx(i, file));
      assert.equal(
        buf.includes(jpegSoi),
        false,
        `fixture slot_0${i}/${file} must not contain JPEG SOI sequence (FF D8 FF)`
      );
      if (file === 'caption.sav') {
        assert.ok(
          buf.length <= 2048,
          `fixture slot_0${i}/caption.sav length (${buf.length}) must be <= 2048 bytes`
        );
      }
    }
  }
});

