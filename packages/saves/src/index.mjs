// Remake (Switch 2) save readers. Format verified against 12 real slots (Eden + Fritchii).
//   progress.sav: header 04 03 02 01; collectible global IDs are u64 LE values aligned to 8 bytes
//   caption.sav : header 04 03 02 01; at 0x2a0 three f32 (position) + NUL-terminated scene name
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const TITLE_ID = '0400486024DEC000';
const MAGIC = Buffer.from([0x04, 0x03, 0x02, 0x01]);
const CAPTION_POS = 0x2a0;
const CAPTION_SUB_SCENE_OFF = 0x2ec;
const CAPTION_AGE_HASH = 0x96e59c05;
const CAPTION_AGE_OFF = 0xa0;
const PROG_SUB_SCENE_OFF = 0x1bcc4;
const PROG_CHILD_FLAG_OFF = 0x11980;
const PROG_CHILD_FLAG_HASH = 0xcea220d3;
const PROG_ADULT_FLAG_OFF = 0x540;
const PROG_ADULT_FLAG_HASH = 0x07ad4938;

function checkMagic(buf, what) {
  if (buf.length < 64 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error(`${what}: bad header or truncated`);
}

function readAsciiString(buf, off, maxLen = 64) {
  if (off >= buf.length) return '';
  const slice = buf.subarray(off, Math.min(buf.length, off + maxLen));
  const nul = slice.indexOf(0);
  return (nul >= 0 ? slice.subarray(0, nul) : slice).toString('latin1');
}

function parseAgeSuffix(s) {
  if (s.endsWith('_Adult')) return 'adult';
  if (s.endsWith('_Child')) return 'child';
  return null;
}

/** Detect Link age ('child' | 'adult' | null) from progress.sav / live RAM buffer. */
export function readProgressAge(buf) {
  if (buf.length < 64 || !buf.subarray(0, 4).equals(MAGIC)) return null;
  const subAge = parseAgeSuffix(readAsciiString(buf, PROG_SUB_SCENE_OFF, 64));
  if (subAge) return subAge;
  if (buf.length >= PROG_CHILD_FLAG_OFF + 8 && buf.readUInt32LE(PROG_CHILD_FLAG_OFF) === PROG_CHILD_FLAG_HASH) {
    return buf.readUInt32LE(PROG_CHILD_FLAG_OFF + 4) === 1 ? 'child' : 'adult';
  }
  if (buf.length >= PROG_ADULT_FLAG_OFF + 8 && buf.readUInt32LE(PROG_ADULT_FLAG_OFF) === PROG_ADULT_FLAG_HASH) {
    return buf.readUInt32LE(PROG_ADULT_FLAG_OFF + 4) === 1 ? 'adult' : 'child';
  }
  return null;
}

/** @param {Buffer} buf @param {Set<string>} knownIds decimal gameIds from markers.json -> returns Set of collected gameIds */
export function readProgress(buf, knownIds) {
  checkMagic(buf, 'progress.sav');
  const collected = new Set();
  for (let o = 0; o + 8 <= buf.length; o += 8) {
    const id = buf.readBigUInt64LE(o).toString();
    if (knownIds.has(id)) collected.add(id);
  }
  return collected;
}

export function readCaption(buf) {
  checkMagic(buf, 'caption.sav');
  if (buf.length < CAPTION_POS + 16) throw new Error('caption.sav: truncated');
  const pos = [0, 4, 8].map((d) => buf.readFloatLE(CAPTION_POS + d));
  const start = CAPTION_POS + 12;
  let end = start;
  while (end < buf.length && end - start < 64 && buf[end] !== 0) end++;
  const scene = buf.subarray(start, end).toString('latin1');
  if (!/^[A-Za-z0-9_]{2,}$/.test(scene) || pos.some((n) => !Number.isFinite(n))) throw new Error('caption.sav: unreadable scene');
  let age = parseAgeSuffix(readAsciiString(buf, CAPTION_SUB_SCENE_OFF, 64));
  if (!age && buf.length >= CAPTION_AGE_OFF + 8 && buf.readUInt32LE(CAPTION_AGE_OFF) === CAPTION_AGE_HASH) {
    age = buf.readUInt32LE(CAPTION_AGE_OFF + 4) === 1 ? 'adult' : 'child';
  }
  return { scene, pos, age };
}

/** Candidate save roots: %APPDATA%\<emu>\nand\user\save\0000000000000000\<uid>\<TITLE_ID> */
export async function findSaveRoots(appData = process.env.APPDATA, emulators = ['eden', 'fritchii']) {
  const roots = [];
  for (const emu of emulators) {
    const base = path.join(appData ?? '', emu, 'nand', 'user', 'save', '0000000000000000');
    let uids = [];
    try { uids = await readdir(base); } catch { continue; }
    for (const uid of uids) {
      const dir = path.join(base, uid, TITLE_ID);
      try { if ((await stat(dir)).isDirectory()) roots.push({ emulator: emu, dir }); } catch { /* none */ }
    }
  }
  return roots;
}

/** Lists slot_XX directories with mtimes. Never throws on a broken slot. */
export async function listSlots(root) {
  const slots = [];
  let names = [];
  try { names = (await readdir(root.dir)).filter((n) => /^slot_\d+$/.test(n)); } catch { return slots; }
  for (const name of names) {
    const dir = path.join(root.dir, name);
    try {
      const s = await stat(path.join(dir, 'progress.sav'));
      slots.push({ emulator: root.emulator, slot: name, dir, mtimeMs: s.mtimeMs });
    } catch { /* slot without progress */ }
  }
  return slots;
}

export async function findLatestSlot(roots) {
  const all = [];
  for (const r of roots) all.push(...(await listSlots(r)));
  return all.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null;
}

/** Reads one slot; a corrupt file yields {ok:false,error} instead of throwing. */
export async function readSlot(slot, knownIds) {
  const out = { ok: true, slot: slot.slot, emulator: slot.emulator, mtimeMs: slot.mtimeMs, collected: new Set(), scene: null, pos: null, age: null, errors: [] };
  let progAge = null;
  try {
    const pbuf = await readFile(path.join(slot.dir, 'progress.sav'));
    out.collected = readProgress(pbuf, knownIds);
    progAge = readProgressAge(pbuf);
  } catch (e) {
    out.ok = false;
    out.errors.push(e.message);
  }
  try {
    const cap = readCaption(await readFile(path.join(slot.dir, 'caption.sav')));
    Object.assign(out, cap);
    if (!out.age) out.age = progAge;
  } catch (e) {
    out.age = progAge;
    out.errors.push(e.message);
  }
  return out;
}

/** Polls progress.sav mtimes (default 1.5 s). Calls onChange(slotInfo) when the newest slot changes. Returns stop(). */
export function watchSaves(roots, onChange, intervalMs = 1500) {
  let last = '';
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const slot = await findLatestSlot(roots);
      const key = slot ? `${slot.dir}@${slot.mtimeMs}` : '';
      if (key !== last) { last = key; await onChange(slot); }
    } finally { busy = false; }
  };
  const t = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(t);
}
