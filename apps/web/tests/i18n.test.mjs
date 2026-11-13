import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRINGS,
  getStoredLangPref,
  normalizeLangPref,
  resolveLang,
  setStoredLangPref,
  t,
} from '../src/i18n.ts';

test('en and es dictionaries share identical key sets with non-empty strings', () => {
  const enKeys = Object.keys(STRINGS.en).sort();
  const esKeys = Object.keys(STRINGS.es).sort();
  assert.deepEqual(enKeys, esKeys);
  for (const k of enKeys) {
    assert.ok(STRINGS.en[k].trim().length > 0, `empty en key: ${k}`);
    assert.ok(STRINGS.es[k].trim().length > 0, `empty es key: ${k}`);
  }
});

test('resolveLang respects explicit choices and navigator fallback', () => {
  assert.equal(resolveLang('en', ['es-AR']), 'en');
  assert.equal(resolveLang('es', ['en-US']), 'es');
  assert.equal(resolveLang('auto', ['es-AR', 'en']), 'es');
  assert.equal(resolveLang('auto', ['ES-ES']), 'es');
  assert.equal(resolveLang('auto', ['en-US']), 'en');
  assert.equal(resolveLang('auto', ['ja-JP']), 'en');
  assert.equal(resolveLang('auto', []), 'en');
  assert.equal(resolveLang('invalid', ['es-ES']), 'es');
  assert.equal(resolveLang(null, ['es-UY']), 'es');
});

test('normalizeLangPref normalizes valid and invalid values', () => {
  assert.equal(normalizeLangPref('en'), 'en');
  assert.equal(normalizeLangPref('es'), 'es');
  assert.equal(normalizeLangPref('auto'), 'auto');
  assert.equal(normalizeLangPref('fr'), 'auto');
  assert.equal(normalizeLangPref(undefined), 'auto');
});

test('t interpolates placeholders cleanly', () => {
  assert.match(t('en', 'pendingCount', { count: 4 }), /4/);
  assert.match(t('es', 'pendingCount', { count: 4 }), /4/);
  assert.notEqual(t('en', 'onlyPending'), t('es', 'onlyPending'));
});

test('stored lang preference safely handles environments without localStorage', () => {
  assert.equal(getStoredLangPref(), 'auto');
  assert.doesNotThrow(() => setStoredLangPref('en'));
});
