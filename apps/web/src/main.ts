import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {
  computeZoomRange,
  getMapBounds,
  groupCategoriesForMenu,
  isValueMarker,
  resolveMarkerArea,
  resolveProgressArea,
  toggleCategoryFocus,
  toggleSectionFocus,
} from '../../../packages/core/src/index.mjs';
import {
  applyDomTranslations,
  badge,
  broadcastLangPref,
  createTranslator,
  describeLocation,
  emptyProgress,
  initBackend,
  isTauri,
  loadStaticData,
  resolveEffectiveAge,
  setHudStretchX,
  setManualAge,
  setManualArea,
  setMarkerStatus,
  subscribeUpdates,
  toggleOverlayCalibrating,
  toggleOverlayClickThrough,
  toggleOverlayVisible,
  type Category,
  type Marker,
  type OverlayStatus,
  type UserState,
} from './shared';
import {
  getStoredLangPref,
  normalizeLangPref,
  resolveLang,
  setStoredLangPref,
  t,
  type AppLang,
  type LangPref,
} from './i18n';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const VIEW_LS_KEY = 'zelda-notes.categoryView';

const { markers, categories, maps, es } = await loadStaticData();
let langPref: LangPref = getStoredLangPref();
let currentLang: AppLang = resolveLang(langPref);
let tr = createTranslator(es, currentLang);
const catById = new Map<string, Category>(categories.map((c) => [c.id, c]));
const knownIds = markers.map((m) => m.gameId ?? '').filter((g) => /^\d+$/.test(g));

let progress = emptyProgress();
let waitingForProgress = isTauri();
let userState: UserState;
let overlayStatus: OverlayStatus;

({ userState, overlayStatus } = await initBackend(knownIds));

const autoIds = () => new Set(progress.collected);
const manualIds = () => new Set(userState.manualCollected);
const ignoredIds = () => new Set(userState.ignored);
const isAuto = (m: Marker) => !!m.gameId && autoIds().has(m.gameId);
const isIgnored = (m: Marker) => ignoredIds().has(m.id);
const isDone = (m: Marker) => manualIds().has(m.id) || isAuto(m);

// Etiquetas (tipo 3) ocultas por defecto; no cuentan como coleccionables.
const isLabel = (m: Marker) => catById.get(m.cat)?.marker_category_type_id === '3';

let focusedCats: Set<string> | null = null;
let categoryView: 'icons' | 'list' = (() => {
  try {
    return localStorage.getItem(VIEW_LS_KEY) === 'list' ? 'list' : 'icons';
  } catch {
    return 'icons';
  }
})();

const map = L.map('mapview', {
  crs: L.CRS.Simple,
  minZoom: 0,
  maxZoom: 6,
  zoomSnap: 1,
  zoomDelta: 1,
  fadeAnimation: false,
  zoomAnimation: false,
  bounceAtZoomLimits: true,
  maxBoundsViscosity: 0.85,
  attributionControl: false,
});

let backdropLayer: L.TileLayer | null = null;
let tileLayer: L.TileLayer | null = null;
const markerLayer = L.layerGroup().addTo(map);

let currentFitBounds: [[number, number], [number, number]] = [[-256, 0], [0, 256]];
let currentMapMaxZoom = 5;
let fittingView = false;
let userAdjustedView = false;

map.on('zoomstart dragstart', () => {
  if (!fittingView) userAdjustedView = true;
});

function syncMinZoom() {
  const rect = $('mapview').getBoundingClientRect();
  if (!rect.width || !rect.height) return 1;
  const { min, initial } = computeZoomRange({ width: rect.width, height: rect.height }, currentFitBounds, currentMapMaxZoom, 16);
  map.setMinZoom(min);
  return initial;
}

function fitCurrentBounds() {
  fittingView = true;
  try {
    const initial = syncMinZoom();
    const centerLat = (currentFitBounds[0][0] + currentFitBounds[1][0]) / 2;
    const centerLng = (currentFitBounds[0][1] + currentFitBounds[1][1]) / 2;
    map.setView([centerLat, centerLng], initial, { animate: false });
  } finally {
    fittingView = false;
  }
}

function attachResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return;
  const initRect = $('mapview').getBoundingClientRect();
  let lastW = initRect.width;
  let lastH = initRect.height;
  new ResizeObserver(() => {
    const rect = $('mapview').getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (Math.abs(rect.width - lastW) < 1 && Math.abs(rect.height - lastH) < 1) return;
    lastW = rect.width;
    lastH = rect.height;
    map.invalidateSize({ pan: false });
    syncMinZoom();
    if (!userAdjustedView) fitCurrentBounds();
  }).observe($('mapview'));
}

const mapSel = $<HTMLSelectElement>('map');
const subSel = $<HTMLSelectElement>('submap');
const areaSel = $<HTMLSelectElement>('manual-area');
const ageSel = $<HTMLSelectElement>('manual-age');
const stretchInput = $<HTMLInputElement>('hud-stretch');
const langSel = $<HTMLSelectElement>('lang');
let userPinnedHyruleEra = false;

const allAreas = [...new Set(markers.map((m) => resolveMarkerArea(m)).filter((a): a is string => !!a))].sort();

function populateMaps(preserveValue = false) {
  const prev = preserveValue ? mapSel.value : '';
  mapSel.length = 0;
  for (const m of maps) mapSel.add(new Option(tr.map(m.name), m.id));
  if (preserveValue && prev && maps.some((m) => m.id === prev)) {
    mapSel.value = prev;
  }
}

function populateAreas() {
  areaSel.length = 0;
  areaSel.add(new Option(t(currentLang, 'areaAutoSaveOption'), ''));
  for (const a of allAreas) {
    areaSel.add(new Option(t(currentLang, 'areaOptionPrefix', { area: tr.area(a) }), a));
  }
  areaSel.value = userState.manualArea ?? '';
}

function fillSubs(preserveValue = false) {
  const gm = maps.find((m) => m.id === mapSel.value)!;
  const prev = preserveValue ? subSel.value : '';
  subSel.length = 0;
  for (const s of gm.subMap) subSel.add(new Option(tr.submap(s.name), s.id));
  if (preserveValue && prev && gm.subMap.some((s) => s.id === prev)) {
    subSel.value = prev;
  } else {
    subSel.value = (gm.subMap.find((s) => s.isDefault === '1') ?? gm.subMap[0]).id;
  }
}

populateMaps(false);
populateAreas();
ageSel.value = userState.manualAge ?? '';
stretchInput.value = (userState.hudStretchX ?? 1).toFixed(2);
langSel.value = langPref;

function syncHyruleAgeSubmap(reloadTiles = true) {
  if (mapSel.value !== '65000' || userPinnedHyruleEra) return;
  const { age } = resolveEffectiveAge(progress, userState);
  if (!age) return;
  const targetSub = age === 'adult' ? '650001' : '650000';
  if (subSel.value !== targetSub) {
    subSel.value = targetSub;
    if (reloadTiles) loadTiles(false);
  }
}

function loadTiles(resetView = false) {
  const gm = maps.find((m) => m.id === mapSel.value)!;
  const sub = gm.subMap.find((s) => s.id === subSel.value)!;
  const maxNativeZoom = Number(gm.maxZoom);
  const mapMaxZoom = maxNativeZoom + 1;
  const backdropZoom = Math.min(2, maxNativeZoom);
  const mapMarkers = markers.filter((m) => m.map === gm.id);
  const { fit, max } = getMapBounds(sub, mapMarkers);

  currentFitBounds = fit;
  currentMapMaxZoom = mapMaxZoom;

  const tileOpts = {
    tileSize: 256,
    noWrap: true,
    minZoom: 0,
    maxZoom: mapMaxZoom + 1,
    bounds: [[-256, 0], [0, 256]] as L.LatLngBoundsExpression,
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  };

  map.setMaxZoom(mapMaxZoom);
  map.setMaxBounds(max);
  syncMinZoom();

  if (resetView) {
    userAdjustedView = false;
    fitCurrentBounds();
  } else if (map.getZoom() > mapMaxZoom) {
    fittingView = true;
    try {
      map.setZoom(mapMaxZoom, { animate: false });
    } finally {
      fittingView = false;
    }
  }

  backdropLayer?.remove();
  tileLayer?.remove();

  if (!map.getPane('tileBackdropPane')) {
    map.createPane('tileBackdropPane').style.zIndex = '150';
  }

  backdropLayer = L.tileLayer(`/tiles/${sub.tileURL}{z}_{x}_{y}.webp`, {
    ...tileOpts,
    pane: 'tileBackdropPane',
    minNativeZoom: backdropZoom,
    maxNativeZoom: backdropZoom,
    zIndex: 1,
    keepBuffer: 64,
    updateWhenIdle: false,
    updateWhenZooming: false,
  }).addTo(map);

  tileLayer = L.tileLayer(`/tiles/${sub.tileURL}{z}_{x}_{y}.webp`, {
    ...tileOpts,
    maxNativeZoom,
    zIndex: 2,
    keepBuffer: 6,
    updateWhenIdle: false,
    updateWhenZooming: true,
  }).addTo(map);
}

let selectedMarker: Marker | null = null;

function currentCatState() {
  const here = markers.filter((m) => m.map === mapSel.value && !isLabel(m));
  const presentIds = new Set(here.map((m) => m.cat));
  const sections = groupCategoriesForMenu(categories, presentIds);
  const allIds = sections.flatMap((s) => s.categories.map((c) => c.id));
  const visible = focusedCats
    ? new Set(allIds.filter((id) => focusedCats!.has(id)))
    : new Set(allIds);
  if (visible.size === 0 && allIds.length > 0) {
    focusedCats = null;
    for (const id of allIds) visible.add(id);
  }
  return { here, sections, allIds, visible };
}

function render() {
  const { visible } = currentCatState();
  markerLayer.clearLayers();
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const onlyPending = $<HTMLInputElement>('pending').checked;
  for (const m of markers) {
    if (m.map !== mapSel.value || m.submap !== subSel.value || isLabel(m) || !visible.has(m.cat)) continue;
    const done = isDone(m);
    const ign = isIgnored(m);
    if (onlyPending && (done || ign)) continue;
    const label = tr.name(m.name);
    const labelEs = es.names[m.name] ?? '';
    if (q && !label.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q) && !labelEs.toLowerCase().includes(q)) continue;
    const cls = done ? 'pin done' : ign ? 'pin ignored' : 'pin';
    L.marker([m.y, m.x], {
      icon: L.divIcon({ className: cls, html: badge(catById.get(m.cat), 24), iconSize: [24, 24] }),
    })
      .on('click', () => showCard(m))
      .bindTooltip(label)
      .addTo(markerLayer);
  }
  renderCats();
  if (selectedMarker) showCard(selectedMarker);
}

function applyVisible(next: Set<string>, allIds: string[]) {
  const allOn = allIds.every((id) => next.has(id));
  focusedCats = allOn ? null : next;
  render();
}

const LIST_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
  '<rect x="1.5" y="2.5" width="13" height="2" rx="1"/>' +
  '<rect x="1.5" y="7" width="13" height="2" rx="1"/>' +
  '<rect x="1.5" y="11.5" width="13" height="2" rx="1"/></svg>';

function renderCats() {
  const { here, sections, allIds, visible } = currentCatState();
  const allOn = allIds.every((id) => visible.has(id));
  const valueHere = here.filter((m) => isValueMarker(m) && !isIgnored(m));
  const valueDone = valueHere.filter(isDone).length;

  const counts = new Map<string, { done: number; total: number }>();
  for (const id of allIds) counts.set(id, { done: 0, total: 0 });
  for (const m of here) {
    if (isIgnored(m)) continue;
    const c = counts.get(m.cat);
    if (!c) continue;
    c.total++;
    if (isDone(m)) c.done++;
  }

  const toolbarHtml = `<div class="cats-toolbar">
    <div class="cats-summary"><span>${t(currentLang, 'valueSummary')}</span><b>${valueDone}/${valueHere.length}</b></div>
    <div class="category-view-toggle" role="group" aria-label="${t(currentLang, 'categoryViewAria')}">
      <button type="button" data-category-view="icons" aria-pressed="${categoryView === 'icons'}" title="${t(currentLang, 'gridViewTitle')}">
        <span class="category-view-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </button>
      <button type="button" data-category-view="list" aria-pressed="${categoryView === 'list'}" title="${t(currentLang, 'listViewTitle')}">
        ${LIST_ICON_SVG}
      </button>
    </div>
  </div>`;

  const bodyHtml =
    categoryView === 'icons'
      ? sections
          .map((sec, idx) => {
            const focused = !allOn && sec.categories.every((c) => visible.has(c.id));
            return `<section class="cat-section">
              <div class="poi-category-heading">
                <h3>${tr.cat(sec.title)}</h3>
                <button type="button" class="poi-category-toggle" data-sec="${idx}" aria-pressed="${focused}">${t(currentLang, 'focusBtn')}</button>
              </div>
              <div class="cat-grid">
                ${sec.categories
                  .map((c) => {
                    const st = counts.get(c.id) ?? { done: 0, total: 0 };
                    const off = visible.has(c.id) ? '' : ' off';
                    return `<button type="button" class="cat-item${off}" data-c="${c.id}">
                      ${badge(c, 42)}
                      <span class="cat-name">${tr.cat(c.name)}</span>
                      <span class="cat-count">${st.done}/${st.total}</span>
                    </button>`;
                  })
                  .join('')}
              </div>
            </section>`;
          })
          .join('')
      : sections
          .map((sec, idx) => {
            const activeCount = allOn ? 0 : sec.categories.filter((c) => visible.has(c.id)).length;
            const checked = activeCount === sec.categories.length && activeCount > 0;
            return `<section class="cat-section">
              <div class="category-list-heading">
                <input type="checkbox" class="category-list-check" data-sec-chk="${idx}" aria-label="${t(currentLang, 'focusAria', { section: tr.cat(sec.title) })}" ${checked ? 'checked' : ''}>
                <h3>${tr.cat(sec.title)}</h3>
              </div>
              ${sec.categories
                .map((c) => {
                  const st = counts.get(c.id) ?? { done: 0, total: 0 };
                  const off = visible.has(c.id) ? '' : ' off';
                  return `<button type="button" class="category-list-row${off}" data-c="${c.id}">
                    ${badge(c, 28)}
                    <span class="category-list-name">${tr.cat(c.name)}</span>
                    <span class="category-list-count">${st.done}/${st.total}</span>
                  </button>`;
                })
                .join('')}
            </section>`;
          })
          .join('');

  const el = $('cats');
  el.innerHTML = `${toolbarHtml}<div class="cats-scroll">${bodyHtml}</div>`;

  el.querySelectorAll<HTMLButtonElement>('[data-category-view]').forEach((btn) => {
    btn.onclick = () => {
      categoryView = btn.dataset.categoryView === 'list' ? 'list' : 'icons';
      try {
        localStorage.setItem(VIEW_LS_KEY, categoryView);
      } catch {
        /* ignore */
      }
      renderCats();
    };
  });

  el.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((btn) => {
    btn.onclick = () => applyVisible(toggleCategoryFocus(visible, allIds, btn.dataset.c!), allIds);
  });

  el.querySelectorAll<HTMLButtonElement>('[data-sec]').forEach((btn) => {
    btn.onclick = () => {
      const sec = sections[Number(btn.dataset.sec)];
      applyVisible(toggleSectionFocus(visible, allIds, sec.categories.map((c) => c.id)), allIds);
    };
  });

  el.querySelectorAll<HTMLInputElement>('[data-sec-chk]').forEach((chk) => {
    const sec = sections[Number(chk.dataset.secChk)];
    const activeCount = allOn ? 0 : sec.categories.filter((c) => visible.has(c.id)).length;
    chk.indeterminate = activeCount > 0 && activeCount < sec.categories.length;
    chk.onchange = () => applyVisible(toggleSectionFocus(visible, allIds, sec.categories.map((c) => c.id)), allIds);
  });
}

function showCard(m: Marker) {
  selectedMarker = m;
  const c = catById.get(m.cat);
  const done = isDone(m);
  const ign = isIgnored(m);
  const actions = isAuto(m)
    ? `<p class="auto">${t(currentLang, 'autoCollected')}</p>`
    : `<div class="card-actions">
        <button id="toggle">${done ? t(currentLang, 'undoCollected') : t(currentLang, 'markCollected')}</button>
        <button id="ignore" class="secondary">${ign ? t(currentLang, 'unignoreBtn') : t(currentLang, 'ignoreBtn')}</button>
       </div>`;
  const effArea = resolveMarkerArea(m);
  $('card').innerHTML = `<h2>${tr.name(m.name)}</h2>
    <div class="meta">${badge(c, 20)} <span>${c ? tr.cat(c.name) : ''}${effArea ? ' · ' + tr.area(effArea) : ''}</span></div>
    <h4>${t(currentLang, 'howToGet')}</h4>
    <div class="how">${tr.text(m.text) || `<em>${t(currentLang, 'noDescription')}</em>`}</div>
    ${actions}
    <div class="card-link"><a href="https://zeldamaps.com/" target="_blank" rel="noopener">${t(currentLang, 'viewOnZeldaMaps')}</a></div>`;

  const toggleBtn = document.getElementById('toggle');
  if (toggleBtn) {
    toggleBtn.onclick = async () => {
      userState = await setMarkerStatus(m.id, done ? 'pending' : 'done');
      render();
    };
  }
  const ig = document.getElementById('ignore');
  if (ig) {
    ig.onclick = async () => {
      userState = await setMarkerStatus(m.id, ign ? 'pending' : 'ignored');
      render();
    };
  }
}

function renderStatus() {
  const status = $('savestatus');
  const { age: effAge } = resolveEffectiveAge(progress, userState);
  const ageTag = effAge === 'adult' ? ` · ${t(currentLang, 'ageAdult')}` : effAge === 'child' ? ` · ${t(currentLang, 'ageChild')}` : '';
  const resolved = resolveProgressArea(progress);
  const location = describeLocation(progress, resolved, userState.manualArea, currentLang);
  const area = resolved ?? userState.manualArea;
  const name = area ? tr.area(area) : progress.scene;
  status.textContent = location
    ? [location.detail + ageTag, name].filter(Boolean).join(' · ')
    : waitingForProgress ? t(currentLang, 'searchingLive') : t(currentLang, 'waitingGame');
  status.title = progress.errors.join('\n');
  areaSel.value = userState.manualArea ?? '';
  ageSel.value = userState.manualAge ?? '';
  if (document.activeElement !== stretchInput) {
    stretchInput.value = (userState.hudStretchX ?? 1).toFixed(2);
  }

  const controls = $('overlay-controls');
  if (isTauri()) {
    controls.hidden = false;
    $('btn-overlay-cal').textContent = overlayStatus.calibrating ? t(currentLang, 'calibrateDoneBtn') : t(currentLang, 'calibrateBtn');
    $('btn-overlay-cal').classList.toggle('active', overlayStatus.calibrating);
    $('btn-overlay-toggle').textContent = overlayStatus.visible ? t(currentLang, 'hideOverlayBtn') : t(currentLang, 'showOverlayBtn');
    $('btn-overlay-click').textContent = overlayStatus.clickThrough ? t(currentLang, 'clickThroughOn') : t(currentLang, 'clickThroughOff');
    $('btn-overlay-click').classList.toggle('active', overlayStatus.clickThrough);
  }
}

function applyLanguage(rerender = true) {
  document.documentElement.lang = currentLang;
  document.title = t(currentLang, 'appTitle');
  tr = createTranslator(es, currentLang);
  applyDomTranslations(document, currentLang);
  langSel.value = langPref;
  populateMaps(true);
  fillSubs(true);
  populateAreas();
  if (!selectedMarker) {
    $('card').innerHTML = `<p class="hint" data-i18n="selectMarkerHint">${t(currentLang, 'selectMarkerHint')}</p>`;
  }
  if (rerender) {
    renderStatus();
    render();
  }
}

langSel.onchange = () => {
  langPref = normalizeLangPref(langSel.value);
  setStoredLangPref(langPref);
  currentLang = resolveLang(langPref);
  applyLanguage(true);
  void broadcastLangPref(langPref);
};

mapSel.onchange = () => {
  focusedCats = null;
  userPinnedHyruleEra = false;
  fillSubs();
  syncHyruleAgeSubmap(false);
  loadTiles(true);
  render();
};
subSel.onchange = () => {
  if (mapSel.value === '65000') userPinnedHyruleEra = true;
  loadTiles(false);
  render();
};
$('q').oninput = render;
$('pending').onchange = render;
areaSel.onchange = async () => {
  userState = await setManualArea(areaSel.value || null);
  renderStatus();
};
ageSel.onchange = async () => {
  const val = ageSel.value;
  userPinnedHyruleEra = false;
  userState = await setManualAge(val === 'child' || val === 'adult' ? val : null);
  syncHyruleAgeSubmap(true);
  renderStatus();
  render();
};
stretchInput.onchange = async () => {
  const num = Number(stretchInput.value);
  const next = Number.isFinite(num) && Math.abs(num - 1) > 0.005 ? Math.max(0.5, Math.min(2.0, num)) : null;
  userState = await setHudStretchX(next);
  renderStatus();
};

if (isTauri()) {
  $('btn-overlay-cal').onclick = async () => {
    overlayStatus = await toggleOverlayCalibrating();
    renderStatus();
  };
  $('btn-overlay-toggle').onclick = async () => {
    overlayStatus = await toggleOverlayVisible();
    renderStatus();
  };
  $('btn-overlay-click').onclick = async () => {
    overlayStatus = await toggleOverlayClickThrough();
    renderStatus();
  };
}

applyLanguage(false);
fillSubs();
syncHyruleAgeSubmap(false);
loadTiles(true);
attachResizeObserver();
renderStatus();
render();

await subscribeUpdates({
  onProgress: (p) => { waitingForProgress = false; progress = p; syncHyruleAgeSubmap(true); renderStatus(); render(); },
  onUserState: (u) => { userState = u; syncHyruleAgeSubmap(true); renderStatus(); render(); },
  onOverlayStatus: (o) => { overlayStatus = o; renderStatus(); },
});
