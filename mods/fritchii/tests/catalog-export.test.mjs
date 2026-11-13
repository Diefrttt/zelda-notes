import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { selectCatalog, writeCatalog } from '../scripts/export-catalog.mjs';
import { groupCategoriesForMenu } from '../../../packages/core/src/index.mjs';

const [markers, maps, categories, translations] = await Promise.all(
  ['markers', 'maps', 'categories', 'es'].map(async name =>
    JSON.parse(await readFile(new URL(`../../../data/${name}.json`, import.meta.url), 'utf8'))),
);

test('exports the current catalog with Spanish labels and both ages', () => {
  const catalog = selectCatalog(markers, maps, categories, translations);
  assert.equal(catalog.markers.length, 632);
  assert.ok(catalog.zones.some(zone => zone.name === 'Rancho Lon Lon'));
  assert.ok(catalog.markers.some(marker => marker.age === 2 && marker.source === 1));
  assert.ok(catalog.markers.every(marker => marker.zone >= 0 && marker.floor >= 0));
});

test('numbers alternate layouts of the same dungeon floor', () => {
  const { floors } = selectCatalog(markers, maps, categories, translations);
  assert.equal(floors.find(floor => floor.id === '640080').name, '1F (1/2)');
  assert.equal(floors.find(floor => floor.id === '640081').name, '1F (2/2)');
  assert.equal(floors.find(floor => floor.id === '640055').name, '1F');
});

test('keeps uint64 IDs exact and excludes ambiguous progress', () => {
  const source = markers.find(marker => marker.id === '64200015');
  const catalog = selectCatalog(markers, maps, categories, translations);
  assert.equal(catalog.markers.find(marker => marker.id === source.id).gameId, 15889002414176907668n);
  const duplicate = selectCatalog([...markers, { ...source, id: 'test' }], maps, categories, translations);
  assert.equal(duplicate.markers.find(marker => marker.id === source.id).source, 0);
});

test('does not treat event strings as IDs', () => {
  const catalog = selectCatalog(markers, maps, categories, translations);
  assert.equal(catalog.markers.find(marker => marker.id === '64703013').gameId, 0n);
});

test('assigns icon families by ID even when categories are reordered', () => {
  const reversed = [...categories, { id: 'unknown', name: 'Other' }].reverse();
  const { categories: labels } = selectCatalog(markers, maps, reversed, translations);
  const icons = new Map(labels.map(({ id, icon }) => [id, icon]));
  for (const [id, icon] of Object.entries({
    '64001': 'SKULLTULA', '64002': 'HEART', '64020': 'CHEST', '64027': 'KEY', unknown: 'GENERIC',
  })) assert.equal(icons.get(id), icon);
  assert.equal(icons.size, 44);
  assert.ok(labels.every(({ icon }) => /^(GENERIC|SKULLTULA|HEART|CHEST|KEY|RUPEE|BOTTLE|OCARINA|SWORD|SHIELD|FAIRY|DOOR|PERSON)$/.test(icon)));
});

test('orders native categories and marker navigation like the desktop menu', () => {
  const catalog = selectCatalog(markers, maps, [...categories].reverse(), translations);
  const desktop = groupCategoriesForMenu(categories).flatMap(group => group.categories.map(cat => ({
    id: cat.id, section: translations.categories[group.title],
  })));
  assert.deepEqual(catalog.categories.slice(0, desktop.length).map(({ id, section }) => ({ id, section })), desktop);
  assert.ok(catalog.markers.every((m, i, list) => i === 0 || m.category >= list[i-1].category));
  assert.equal(catalog.categories.find(c => c.id === '64027').name, 'Llaves pequeñas');
  assert.equal(catalog.categories.find(c => c.id === '64001').section, 'Coleccionables');
});

test('exports C desktop sections, ZNI1 icon indices, and global category totals', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'zn-cat-'));
  const outC = path.join(tmp, 'catalog_gen.c');
  try {
    await writeCatalog(
      path.resolve(import.meta.dirname, '../../../data'),
      outC,
    );
    const c = await readFile(outC, 'utf8');
    assert.match(c, /const ZnSection zn_sections\[\] = \{/);
    assert.match(c, /\{ "travel_points", "Puntos de viaje", 0, 3 \}/);
    assert.match(c, /\{ "collectibles", "Coleccionables", 3, 8 \}/);
    assert.match(c, /const uint16_t zn_section_count = 6;/);
    assert.match(c, /const ZnCategoryMeta zn_category_meta\[\] = \{/);
    assert.match(c, /\{ 64001u, 1, 5, 100 \}/);
    assert.match(c, /\{ 64025u, 5, 30, \d+ \}/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('supports English mode cleanly without Spanish overrides or >2-byte UTF-8 glyphs', async () => {
  const enCatalog = selectCatalog(markers, maps, categories, translations, 'en');
  assert.equal(enCatalog.categories.find(c => c.id === '64027').name, 'Small Keys');
  assert.equal(enCatalog.categories.find(c => c.id === '64001').section, 'Collectibles');
  assert.ok(enCatalog.zones.some(zone => zone.name === 'Lon Lon Ranch'));

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'zn-cat-i18n-'));
  const outEn = path.join(tmp, 'catalog_en.c');
  const outEs = path.join(tmp, 'catalog_es.c');
  try {
    await writeCatalog(path.resolve(import.meta.dirname, '../../../data'), outEn, undefined, 'en');
    await writeCatalog(path.resolve(import.meta.dirname, '../../../data'), outEs, undefined, 'es');
    const [cEn, cEs] = await Promise.all([readFile(outEn, 'utf8'), readFile(outEs, 'utf8')]);
    assert.match(cEn, /\{ "travel_points", "Travel Points", 0, 3 \}/);
    assert.match(cEn, /\{ "collectibles", "Collectibles", 3, 8 \}/);
    assert.doesNotMatch(cEn, /"Otros"|"Puntos de viaje"|"Coleccionables"/);
    for (const [label, src] of [['en', cEn], ['es', cEs]]) {
      for (const ch of src) {
        const cp = ch.codePointAt(0);
        assert.ok(cp <= 0x7ff, `found >2-byte UTF-8 U+${cp.toString(16)} (${ch}) in ${label} catalog`);
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
