import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  sanitizeHtml,
  normalizeMarker,
  countByArea,
  isValueMarker,
  sceneToArea,
  computeAreaBounds,
  projectMarker,
  getPoiStyle,
  groupCategoriesForMenu,
  toggleCategoryFocus,
  toggleSectionFocus,
  getMapBounds,
  computeFitZoom,
  computeZoomRange,
  resolveMarkerAge,
  resolveMarkerArea,
  resolveProgressArea,
  filterMarkersByAge,
  getAreaOverlayBounds,
  computeDefaultZoneTransform,
  resolveZoneTransformKey,
  scaleZoneTransform,
  resizeZoneTransformEdge,
  computeTransformStretchX,
  getAreaOverlayTiles,
} from '../src/index.mjs';

test('sanitizeHtml strips scripts/handlers, keeps safe tags', () => {
  const out = sanitizeHtml('<p onclick="x()">Hi <b>there</b><script>alert(1)</script><img src="a.png" onerror="y()"></p>');
  assert.equal(out, '<p>Hi <b>there</b><img src="a.png"></p>');
});

test('normalizeMarker extracts gameData', () => {
  const m = normalizeMarker({
    id: '1', name: 'X', markerCategoryId: '2', mapId: '3', submapId: '4', x: '1.5', y: '-2',
    tabText: '<p>t</p>',
    gameData: JSON.stringify({ areaName: 'Market', gameId: '99', gameRecord: 'Object.Obj_Heart_Container' }),
  });
  assert.equal(m.area, 'Market');
  assert.equal(m.gameId, '99');
  assert.equal(m.x, 1.5);
});

test('countByArea counts collected by gameId', () => {
  const markers = [
    { id: '1', area: 'A', gameId: 'g1', cat: '64001' },
    { id: '2', area: 'A', gameId: 'g2', cat: '64001' },
    { id: '3', area: 'B', gameId: null, cat: '64001' },
  ];
  const r = countByArea(markers, new Set(['g1']));
  assert.deepEqual(r.A, { done: 1, total: 2 });
  assert.deepEqual(r.B, { done: 0, total: 1 });
});

test('sceneToArea resolves known scenes and returns null for unknown', () => {
  assert.equal(sceneToArea('Market'), 'Market');
  assert.equal(sceneToArea('TimeTemple'), 'Market');
  assert.equal(sceneToArea('HyruleField'), 'Hyrule Field');
  assert.equal(sceneToArea('KakarikoVillage'), 'Kakariko Village');
  assert.equal(sceneToArea('UnknownSceneXYZ'), null);
});

test('computeAreaBounds and projectMarker map north-up Leaflet Y to screen top-down', () => {
  const pts = [
    { area: 'Test', x: 10, y: -20 }, // northwest -> top-left
    { area: 'Test', x: 110, y: -120 }, // southeast -> bottom-right
  ];
  const bounds = computeAreaBounds(pts, 'Test');
  assert.deepEqual(bounds, { minX: 10, maxX: 110, minY: -120, maxY: -20 });
  const tl = projectMarker(pts[0], bounds, { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
  const br = projectMarker(pts[1], bounds, { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
  assert.deepEqual(tl, { x: 0, y: 0 });
  assert.deepEqual(br, { x: 1, y: 1 });
});

test('real snapshot has 632 markers and 411 value markers', { skip: !existsSync(new URL('../../../data/markers.json', import.meta.url)) }, () => {
  const ms = JSON.parse(readFileSync(new URL('../../../data/markers.json', import.meta.url), 'utf8'));
  assert.equal(ms.length, 632);
  assert.equal(ms.filter(isValueMarker).length, 411);
});

test('spanish translation dictionary covers all markers, categories and areas', { skip: !existsSync(new URL('../../../data/es.json', import.meta.url)) }, () => {
  const es = JSON.parse(readFileSync(new URL('../../../data/es.json', import.meta.url), 'utf8'));
  const ms = JSON.parse(readFileSync(new URL('../../../data/markers.json', import.meta.url), 'utf8'));
  const cats = JSON.parse(readFileSync(new URL('../../../data/categories.json', import.meta.url), 'utf8'));
  for (const c of cats) assert.ok(es.categories[c.name], `missing cat: ${c.name}`);
  for (const m of ms) {
    assert.ok(es.names[m.name], `missing name: ${m.name}`);
    if (m.area) assert.ok(es.areas[m.area], `missing area: ${m.area}`);
    if (m.text) assert.ok(es.texts[m.text], `missing text: ${m.id}`);
  }
});

test('getPoiStyle maps OoT categories and custom styles', () => {
  assert.equal(getPoiStyle({ id: '64051', container_id: '64' }), 'travel');
  assert.equal(getPoiStyle({ id: '64002', container_id: '64' }), 'heart');
  assert.equal(getPoiStyle({ id: '64001', container_id: '64' }), 'relic');
  assert.equal(getPoiStyle({ id: '64003', container_id: '64' }), 'korok');
  assert.equal(getPoiStyle({ id: '64005', container_id: '64' }), 'silver');
  assert.equal(getPoiStyle({ id: '64006', container_id: '64' }), 'memory');
  assert.equal(getPoiStyle({ id: '64007', container_id: '64' }), 'fairy-thought');
  assert.equal(getPoiStyle({ id: '64008', container_id: '64' }), 'song');
  assert.equal(getPoiStyle({ id: '64031', container_id: '64' }), 'location');
  assert.equal(getPoiStyle({ id: '64042', container_id: '64' }), 'enemy');
  assert.equal(getPoiStyle({ id: '64021', container_id: '64' }), 'treasure');
  assert.equal(getPoiStyle({ id: '64061', container_id: '64' }), 'treasure');
  assert.equal(getPoiStyle({ id: '64067', container_id: '64', custom_style: '1', shape: 'circle' }), 'interest');
});

test('groupCategoriesForMenu orders sections and filters to present categories', () => {
  const cats = [
    { id: '64021', name: 'Other Treasure', marker_category_type_id: '1', menu_section: 'Treasure Chests', menu_order: '35' },
    { id: '64002', name: 'Heart Pieces', marker_category_type_id: '1', menu_section: 'Collectibles', menu_order: '4' },
    { id: '64001', name: 'Gold Skulltulas', marker_category_type_id: '1', menu_section: 'Collectibles', menu_order: '6' },
    { id: '64051', name: 'Dungeon Entrances', marker_category_type_id: '1', menu_section: 'Travel Points', menu_order: '1' },
    { id: '64031', name: 'Shops', marker_category_type_id: '1', menu_section: 'Locations', menu_order: '12' },
    { id: '64011', name: 'Area Labels', marker_category_type_id: '3', menu_section: null, menu_order: null },
  ];
  const present = new Set(['64021', '64001', '64002', '64051', '64011']);
  const sections = groupCategoriesForMenu(cats, present);
  assert.deepEqual(
    sections.map((s) => [s.title, s.categories.map((c) => c.id)]),
    [
      ['Travel Points', ['64051']],
      ['Collectibles', ['64002', '64001']],
      ['Treasure Chests', ['64021']],
    ],
  );
});

test('toggleCategoryFocus and toggleSectionFocus follow Zelda Maps Focus semantics', () => {
  const all = ['a', 'b', 'c', 'd'];
  let vis = new Set(all);

  // Clicking one while all are visible isolates it
  vis = toggleCategoryFocus(vis, all, 'a');
  assert.deepEqual([...vis], ['a']);

  // Clicking another adds it to the focused set
  vis = toggleCategoryFocus(vis, all, 'b');
  assert.deepEqual([...vis].sort(), ['a', 'b']);

  // Removing the last remaining focused category resets all to visible
  vis = toggleCategoryFocus(vis, all, 'a');
  assert.deepEqual([...vis], ['b']);
  vis = toggleCategoryFocus(vis, all, 'b');
  assert.deepEqual([...vis].sort(), all);

  // Section focus isolates the whole section; clicking again restores all
  vis = toggleSectionFocus(vis, all, ['c', 'd']);
  assert.deepEqual([...vis].sort(), ['c', 'd']);
  vis = toggleSectionFocus(vis, all, ['c', 'd']);
  assert.deepEqual([...vis].sort(), all);
});

test('getMapBounds and computeFitZoom center and scale Hyrule and dungeons properly', () => {
  const hyruleBounds = getMapBounds(
    { bounds: [[-195.03125, 24.75], [-60.96875, 231.28125]] },
    [{ x: 100, y: -120 }],
  );
  assert.deepEqual(hyruleBounds.fit, [[-195.03125, 24.75], [-60.96875, 231.28125]]);

  // Dungeon without submap bounds uses tile pyramid for fit and includes outlier markers in maxBounds
  const spiritBounds = getMapBounds({}, [{ x: 124.658, y: 41.035 }]);
  assert.deepEqual(spiritBounds.fit, [[-256, 0], [0, 256]]);
  assert.ok(spiritBounds.max[1][0] >= 41.035);

  // At 620x720 viewport, Hyrule (~206.5 x 134) fits around zoom 1.5-1.6, never <= 1
  const zoomSmall = computeFitZoom({ width: 620, height: 720 }, hyruleBounds.fit, 6, 16);
  assert.ok(zoomSmall > 1.4 && zoomSmall < 1.8, `got ${zoomSmall}`);

  // At 1960x1350 (2560x1440 monitor), Hyrule fits around zoom 3.2
  const zoomLarge = computeFitZoom({ width: 1960, height: 1350 }, hyruleBounds.fit, 6, 16);
  assert.ok(zoomLarge > 3.0 && zoomLarge < 3.4, `got ${zoomLarge}`);

  // Integer zoom range avoids fractional tile scaling bugs while opening centered and readable
  assert.deepEqual(computeZoomRange({ width: 644, height: 735 }, hyruleBounds.fit, 6, 16), { min: 1, initial: 2 });
  assert.deepEqual(computeZoomRange({ width: 1964, height: 1350 }, hyruleBounds.fit, 6, 16), { min: 3, initial: 3 });
});

test('resolveMarkerAge and filterMarkersByAge separate Hyrule Child/Adult and dungeon age tags', () => {
  const hyruleChild = { map: '65000', submap: '650000', text: '<p>Item</p>' };
  const hyruleAdult = { map: '65000', submap: '650001', text: '<p>Item</p>' };
  const dungYoung = { map: '64023', submap: '640055', text: '<p>Text</p><p><em>Young Link</em></p>' };
  const dungAdult = { map: '64023', submap: '640055', text: '<p>Scarecrow</p><p><em>Adult Link</em></p>' };
  const dungAny = { map: '64030', submap: '640094', text: '<p>Collect all five</p>' };

  assert.equal(resolveMarkerAge(hyruleChild), 'child');
  assert.equal(resolveMarkerAge(hyruleAdult), 'adult');
  assert.equal(resolveMarkerAge(dungYoung), 'child');
  assert.equal(resolveMarkerAge(dungAdult), 'adult');
  assert.equal(resolveMarkerAge(dungAny), null);

  const list = [hyruleChild, hyruleAdult, dungYoung, dungAdult, dungAny];
  assert.deepEqual(filterMarkersByAge(list, 'child'), [hyruleChild, dungYoung, dungAny]);
  assert.deepEqual(filterMarkersByAge(list, 'adult'), [hyruleAdult, dungAdult, dungAny]);
  assert.deepEqual(filterMarkersByAge(list, null), list);
});

test('getAreaOverlayBounds, computeDefaultZoneTransform and resolveZoneTransformKey preserve minimap geometry', () => {
  const sampleMaps = [
    {
      id: '65000',
      subMap: [
        {
          id: '650000',
          regions: [
            {
              name: 'Market',
              connectionKey: 'Market',
              polygon: { coordinates: [[[[114.40625, -127.6875], [134.375, -127.6875], [134.375, -111.875], [114.40625, -111.875]]]] },
            },
            {
              name: 'Hyrule Field',
              connectionKey: 'Hyrule Field',
              polygon: { coordinates: [[[[111.53125, -162.40625], [151.53125, -162.40625], [151.53125, -131.5], [111.53125, -131.5]]]] },
            },
          ],
        },
        {
          id: '650001',
          regions: [
            {
              name: 'Market',
              connectionKey: 'Market',
              polygon: { coordinates: [[[[118.15625, -127.71875], [130.625, -127.71875], [130.625, -111.875], [118.15625, -111.875]]]] },
            },
            {
              name: 'Hyrule Field',
              connectionKey: 'Hyrule Field',
              polygon: { coordinates: [[[[111.53125, -162.40625], [151.53125, -162.40625], [151.53125, -131.5], [111.53125, -131.5]]]] },
            },
          ],
        },
      ],
    },
  ];

  const mChild = getAreaOverlayBounds([], sampleMaps, 'Market', 'child');
  const mAdult = getAreaOverlayBounds([], sampleMaps, 'Market', 'adult');
  assert.deepEqual(mChild, { minX: 114.40625, maxX: 134.375, minY: -127.6875, maxY: -111.875 });
  assert.deepEqual(mAdult, { minX: 118.15625, maxX: 130.625, minY: -127.71875, maxY: -111.875 });

  // Market changed dimensions -> separate Child/Adult calibration keys; Hyrule Field unchanged -> shared key
  assert.equal(resolveZoneTransformKey('Market', 'child', sampleMaps), 'Market:child');
  assert.equal(resolveZoneTransformKey('Market', 'adult', sampleMaps), 'Market:adult');
  assert.equal(resolveZoneTransformKey('Hyrule Field', 'child', sampleMaps), 'Hyrule Field');
  assert.equal(resolveZoneTransformKey('Hyrule Field', 'adult', sampleMaps), 'Hyrule Field');
  assert.equal(resolveZoneTransformKey("Dodongo's Cavern", 'child', sampleMaps), "Dodongo's Cavern");

  // Rectangular zone (2:1 wide) in square viewport keeps 2:1 pixel aspect ratio
  const wideTf = computeDefaultZoneTransform({ minX: 0, maxX: 20, minY: -10, maxY: 0 }, { width: 200, height: 200 });
  assert.ok(Math.abs(wideTf.scaleX / wideTf.scaleY - 2) < 1e-6);
  assert.ok(Math.abs(wideTf.offsetX - (1 - wideTf.scaleX) / 2) < 1e-6);
  assert.ok(Math.abs(wideTf.offsetY - (1 - wideTf.scaleY) / 2) < 1e-6);

  // Proportional zoom keeps aspect ratio locked around anchor
  const zoomed = scaleZoneTransform(wideTf, 1.5, 1.2, 0.5, 0.5, true);
  assert.ok(Math.abs(zoomed.scaleX / zoomed.scaleY - 2) < 1e-6);

  // Ghost tile grid covers bounds cleanly
  const tiles = getAreaOverlayTiles(mChild, 4);
  assert.equal(tiles.z, 4);
  assert.equal(tiles.tileSpan, 16);
  assert.ok(tiles.tiles.some((t) => t.tx === 7 && t.ty === 7));
});

test('resizeZoneTransformEdge stretches single borders and computeTransformStretchX extracts reusable base', () => {
  const bounds = { minX: 0, maxX: 20, minY: -10, maxY: 0 };
  const viewport = { width: 200, height: 200 };
  const baseTf = computeDefaultZoneTransform(bounds, viewport, 0.8, 1.25);
  assert.ok(Math.abs(computeTransformStretchX(baseTf, bounds, viewport) - 1.25) < 1e-6);

  // Dragging right edge expands only width with left edge pinned
  const start = { scaleX: 0.6, scaleY: 0.3, offsetX: 0.2, offsetY: 0.3 };
  const widenedR = resizeZoneTransformEdge(start, 'e', 0.15, 0.05, false);
  assert.ok(Math.abs(widenedR.offsetX - 0.2) < 1e-9);
  assert.ok(Math.abs(widenedR.scaleX - 0.75) < 1e-9);
  assert.ok(Math.abs(widenedR.scaleY - 0.3) < 1e-9);

  // Dragging left edge moves offsetX while pinning right edge (0.2 + 0.6 = 0.8)
  const widenedL = resizeZoneTransformEdge(start, 'w', -0.1, 0, false);
  assert.ok(Math.abs(widenedL.offsetX - 0.1) < 1e-9);
  assert.ok(Math.abs(widenedL.offsetX + widenedL.scaleX - 0.8) < 1e-9);

  // Dragging bottom edge modifies only height
  const taller = resizeZoneTransformEdge(start, 's', 0.2, 0.1, false);
  assert.ok(Math.abs(taller.scaleY - 0.4) < 1e-9);
  assert.ok(Math.abs(taller.scaleX - 0.6) < 1e-9);

  // Dragging bottom-right corner with keepAspect=true keeps exact scaleX / scaleY ratio
  const corner = resizeZoneTransformEdge(start, 'se', 0.12, 0.02, true);
  assert.ok(Math.abs(corner.scaleX / corner.scaleY - 2) < 1e-6);
});

test('Lon Lon Ranch resolves sub-scene fallback, internal ranch markers, full bounds, and dual-age items', { skip: !existsSync(new URL('../../../data/markers.json', import.meta.url)) }, () => {
  const ms = JSON.parse(readFileSync(new URL('../../../data/markers.json', import.meta.url), 'utf8'));
  const maps = JSON.parse(readFileSync(new URL('../../../data/maps.json', import.meta.url), 'utf8'));

  assert.equal(resolveProgressArea({ scene: 'LonLonRanch', parentScene: 'HyruleField' }), 'Lon Lon Ranch');
  assert.equal(resolveProgressArea({ scene: 'UnknownHouse', parentScene: 'KakarikoVillage' }), 'Kakariko Village');
  assert.equal(resolveProgressArea({ scene: 'HyruleField', parentScene: null }), 'Hyrule Field');

  const epona = ms.find((m) => m.id === '64703002');
  const talon = ms.find((m) => m.id === '64701005');
  const bigPoeWest = ms.find((m) => m.id === '64300006');
  assert.equal(resolveMarkerArea(epona), 'Lon Lon Ranch');
  assert.equal(resolveMarkerArea(talon), 'Lon Lon Ranch');
  assert.equal(resolveMarkerArea(bigPoeWest), 'Hyrule Field');

  const adultBounds = getAreaOverlayBounds(ms, maps, 'Lon Lon Ranch', 'adult');
  assert.ok(adultBounds && adultBounds.maxX - adultBounds.minX > 9 && adultBounds.maxY - adultBounds.minY > 7);

  const towerHeart = ms.find((m) => m.id === '64100003');
  assert.equal(resolveMarkerAge(towerHeart), null);
});
