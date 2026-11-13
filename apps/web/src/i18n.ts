export type LangPref = 'auto' | 'en' | 'es';
export type AppLang = 'en' | 'es';

export const LANG_STORAGE_KEY = 'zn.lang';

export const STRINGS = {
  en: {
    appTitle: 'Zelda Notes',
    overlayTitle: 'Zelda Notes — Overlay',
    langAria: 'Language',
    langAuto: 'Auto',
    langEn: 'EN',
    langEs: 'ES',
    searchPlaceholder: 'Search…',
    onlyPending: 'pending only',
    manualAreaTitle: 'Manual area override when no save or live game is active',
    manualAgeTitle: 'Link age filter for categories and overlay (auto from save or manual)',
    ageAutoOption: 'Age: Auto',
    ageChildOption: 'Age: Child',
    ageAdultOption: 'Age: Adult',
    hudWidthLabel: 'Width X',
    hudWidthTitle: 'Default overlay horizontal stretch for new areas (e.g. 1.15 if game stretches minimap)',
    areaAutoSaveOption: 'Area: Auto (save)',
    areaOptionPrefix: 'Area: {area}',
    calibrateBtnTitle: 'Calibrate over minimap (F7)',
    calibrateBtn: '🎯 Calibrate (F7)',
    calibrateDoneBtn: 'Done calibrating (F7)',
    toggleOverlayTitle: 'Show or hide overlay (F8)',
    showOverlayBtn: 'Show overlay (F8)',
    hideOverlayBtn: 'Hide overlay (F8)',
    clickThroughTitle: 'Toggle click-through (F10)',
    clickThroughOn: 'Click-through: ON (F10)',
    clickThroughOff: 'Click-through: OFF (F10)',
    selectMarkerHint: 'Click a marker on the map.',
    footerCredit: 'Map data: Zelda Maps · Art © Nintendo · personal use',
    valueSummary: 'Value items',
    categoryViewAria: 'Category view',
    gridViewTitle: 'Grid view',
    listViewTitle: 'List view',
    focusBtn: 'Focus',
    focusAria: 'Focus {section}',
    autoCollected: '✔ Collected (from save)',
    markCollected: 'Mark collected',
    undoCollected: 'Undo',
    ignoreBtn: 'Ignore',
    unignoreBtn: 'Unignore',
    howToGet: 'How to get it',
    noDescription: 'No description.',
    viewOnZeldaMaps: 'View on Zelda Maps',
    ageChild: 'Child',
    ageAdult: 'Adult',
    ageBoth: 'Child/Adult',
    searchingLive: 'Searching for live game…',
    searchingShort: 'Searching…',
    waitingGame: 'Waiting for game.',
    locManual: 'Manual',
    locLive: 'Live',
    locSave: 'Last save',
    ovNoArea: 'No area',
    ovAgeTitle: 'Detected age (click to cycle Auto / Child / Adult)',
    ovAgeTitleManual: 'Manual age: {age} (click to reset to auto / toggle)',
    ovAgeTitleAuto: 'Game age: {age} (click to override manually)',
    ovAgeTitleNone: 'No age detected (click to pick Child / Adult)',
    ovPendingTitle: 'Pending list (F9)',
    ovHandleCorner: 'Scale corner',
    ovHandleTop: 'Stretch top edge',
    ovHandleBottom: 'Stretch bottom edge',
    ovHandleLeft: 'Stretch width (left edge)',
    ovHandleRight: 'Stretch width (right edge)',
    ovGuideTitle: 'Toggle guide map (50% / 80% / Hidden)',
    ovGuideBtn: '🗺 Guide',
    ovAspectTitle: 'Cycle wheel / +- axis (Proportional · Width · Height)',
    ovAspectProp: '🔒 Prop',
    ovAspectWidth: '↔ Width',
    ovAspectHeight: '↕ Height',
    ovFloorTitle: 'Switch guide dungeon floor',
    ovMoveLeft: 'Move left (←)',
    ovMoveUp: 'Move up (↑)',
    ovMoveDown: 'Move down (↓)',
    ovMoveRight: 'Move right (→)',
    ovZoomOut: 'Zoom out (-)',
    ovZoomIn: 'Zoom in (+)',
    ovCalHint: 'Edges: stretch · Wheel / +-: axis',
    ovBaseTitleDefault: 'Set current horizontal stretch ({stretch}×) as baseline for new areas',
    ovBaseTitleSaved: 'Saved baseline: {saved}× · Click: use {stretch}× as baseline · Shift+click: 1.00×',
    ovBaseInitTitle: 'Set current horizontal stretch as baseline for new areas (Shift+click: 1.00×)',
    ovResetTitle: 'Reset alignment (to current baseline)',
    ovSaveBtn: '✔ Save',
    ovResizeTitle: 'Resize over minimap',
    pendingCount: '{count} pending',
    ovFilterTitle: 'Toggle overlay pins between All and Value items only',
    ovFilterValueOnly: '★ Value only',
    ovFilterAll: '✦ All',
    ovAreaComplete: '✔ Area complete!',
  },
  es: {
    appTitle: 'Zelda Notes',
    overlayTitle: 'Zelda Notes — Overlay',
    langAria: 'Idioma',
    langAuto: 'Auto',
    langEn: 'EN',
    langEs: 'ES',
    searchPlaceholder: 'Buscar…',
    onlyPending: 'solo pendientes',
    manualAreaTitle: 'Zona manual (N0) si no hay lectura del save',
    manualAgeTitle: 'Edad de Link para filtro y overlay (auto desde el save o manual)',
    ageAutoOption: 'Edad: auto',
    ageChildOption: 'Edad: Niño',
    ageAdultOption: 'Edad: Adulto',
    hudWidthLabel: 'Ancho X',
    hudWidthTitle: 'Proporción horizontal base del overlay para zonas nuevas (p. ej. 1.15 si el juego estira el minimapa)',
    areaAutoSaveOption: 'Zona: auto (save)',
    areaOptionPrefix: 'Zona: {area}',
    calibrateBtnTitle: 'Calibrar sobre minimapa (F7)',
    calibrateBtn: '🎯 Calibrar (F7)',
    calibrateDoneBtn: 'Listo calibrar (F7)',
    toggleOverlayTitle: 'Mostrar u ocultar overlay (F8)',
    showOverlayBtn: 'Mostrar overlay (F8)',
    hideOverlayBtn: 'Ocultar overlay (F8)',
    clickThroughTitle: 'Alternar click-through (F10)',
    clickThroughOn: 'Click-through: ON (F10)',
    clickThroughOff: 'Click-through: OFF (F10)',
    selectMarkerHint: 'Haz clic en un marcador.',
    footerCredit: 'Mapa: Zelda Maps · Arte © Nintendo · uso personal',
    valueSummary: 'De valor',
    categoryViewAria: 'Vista de categorías',
    gridViewTitle: 'Vista en grilla',
    listViewTitle: 'Vista en lista',
    focusBtn: 'Focus',
    focusAria: 'Focus {section}',
    autoCollected: '✔ Obtenido (leído del save)',
    markCollected: 'Marcar obtenido',
    undoCollected: 'Deshacer',
    ignoreBtn: 'Ignorar',
    unignoreBtn: 'Quitar ignorado',
    howToGet: 'Cómo conseguirlo',
    noDescription: 'Sin descripción.',
    viewOnZeldaMaps: 'ver en Zelda Maps',
    ageChild: 'Niño',
    ageAdult: 'Adulto',
    ageBoth: 'Niño/Adulto',
    searchingLive: 'Buscando partida en vivo…',
    searchingShort: 'Buscando partida…',
    waitingGame: 'Esperando juego.',
    locManual: 'Manual',
    locLive: 'En vivo',
    locSave: 'Último guardado',
    ovNoArea: 'Sin zona',
    ovAgeTitle: 'Edad detectada (clic para alternar Auto / Niño / Adulto)',
    ovAgeTitleManual: 'Edad manual: {age} (clic para volver a auto / alternar)',
    ovAgeTitleAuto: 'Edad del juego: {age} (clic para cambiar manualmente)',
    ovAgeTitleNone: 'Sin edad detectada (clic para elegir Niño / Adulto)',
    ovPendingTitle: 'Lista de pendientes (F9)',
    ovHandleCorner: 'Escalar esquina',
    ovHandleTop: 'Estirar borde superior',
    ovHandleBottom: 'Estirar borde inferior',
    ovHandleLeft: 'Estirar ancho (borde izquierdo)',
    ovHandleRight: 'Estirar ancho (borde derecho)',
    ovGuideTitle: 'Alternar mapa guía (50% / 80% / Oculto)',
    ovGuideBtn: '🗺 Guía',
    ovAspectTitle: 'Alternar eje de rueda / +− (Proporcional · Ancho · Alto)',
    ovAspectProp: '🔒 Prop',
    ovAspectWidth: '↔ Ancho',
    ovAspectHeight: '↕ Alto',
    ovFloorTitle: 'Cambiar piso de mazmorra del mapa guía',
    ovMoveLeft: 'Mover izquierda (←)',
    ovMoveUp: 'Mover arriba (↑)',
    ovMoveDown: 'Mover abajo (↓)',
    ovMoveRight: 'Mover derecha (→)',
    ovZoomOut: 'Reducir (-)',
    ovZoomIn: 'Aumentar (+)',
    ovCalHint: 'Bordes: estirar · Rueda / +−: eje',
    ovBaseTitleDefault: 'Fijar estiramiento actual ({stretch}×) como base horizontal para nuevas zonas',
    ovBaseTitleSaved: 'Base guardada: {saved}× · Clic: usar {stretch}× como base · Shift+clic: 1.00×',
    ovBaseInitTitle: 'Fijar estiramiento horizontal actual como base para nuevas zonas (Shift+clic: 1.00×)',
    ovResetTitle: 'Reiniciar alineación (a base actual)',
    ovSaveBtn: '✔ Guardar',
    ovResizeTitle: 'Redimensionar sobre minimapa',
    pendingCount: '{count} pendientes',
    ovFilterTitle: 'Alternar pines en overlay entre Todos y Solo de valor',
    ovFilterValueOnly: '★ Solo valor',
    ovFilterAll: '✦ Todos',
    ovAreaComplete: '✔ ¡Zona completa!',
  },
} as const;

export type I18nKey = keyof typeof STRINGS.en;

export function normalizeLangPref(pref: string | null | undefined): LangPref {
  const clean = typeof pref === 'string' ? pref.trim().toLowerCase() : '';
  if (clean === 'en' || clean === 'es' || clean === 'auto') return clean;
  return 'auto';
}

export function resolveLang(
  pref: LangPref | string | null | undefined,
  navigatorLanguages?: readonly string[],
): AppLang {
  const normalized = normalizeLangPref(pref);
  if (normalized === 'en' || normalized === 'es') return normalized;
  const langs =
    navigatorLanguages ??
    (typeof globalThis.navigator !== 'undefined'
      ? globalThis.navigator.languages?.length
        ? globalThis.navigator.languages
        : globalThis.navigator.language
          ? [globalThis.navigator.language]
          : []
      : []);
  const first = langs.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
  if (first && first.trim().toLowerCase().startsWith('es')) return 'es';
  return 'en';
}

export function getStoredLangPref(): LangPref {
  try {
    if (typeof globalThis.localStorage === 'undefined') return 'auto';
    return normalizeLangPref(globalThis.localStorage.getItem(LANG_STORAGE_KEY));
  } catch {
    return 'auto';
  }
}

export function setStoredLangPref(pref: LangPref): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(LANG_STORAGE_KEY, normalizeLangPref(pref));
  } catch {
    /* ignore */
  }
}

export function t(lang: AppLang, key: I18nKey, vars?: Record<string, string | number>): string {
  let msg: string = STRINGS[lang][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}
