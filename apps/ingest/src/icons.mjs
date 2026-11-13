// Builds data/icons/icons.css from the zeldamaps stylesheet: only `.icon-*` glyph rules + icomoon @font-face.
// Assets (fonts/*, oot/*.svg, HeartPiece.svg ...) are mirrored under data/icons by hand/ingest (personal use).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data/icons');
const css = (await readFile(path.join(dir, 'site.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');

// Split top-level rules (depth 0), tracking nested braces.
const rules = [];
let depth = 0, start = 0;
for (let i = 0; i < css.length; i++) {
  if (css[i] === '{') depth++;
  else if (css[i] === '}' && --depth === 0) { rules.push(css.slice(start, i + 1).trim()); start = i + 1; }
}

const simple = /^\.icon-[\w-]+(::?before)?$/;
const out = [];
for (const r of rules) {
  if (r.startsWith('@font-face') && r.includes("'icomoon'")) { out.push(r); continue; }
  if (r.startsWith('@')) continue;
  const sel = r.slice(0, r.indexOf('{')).split(',').map((s) => s.trim());
  if (/^\[class[\^*]=["' ]*icon-/.test(sel[0]) && sel.every((s) => /^\[class/.test(s) || simple.test(s))) { out.push(r); continue; }
  const keep = sel.filter((s) => simple.test(s));
  if (keep.length) out.push(`${keep.join(',')}${r.slice(r.indexOf('{'))}`);
}

const fixed = out.join('\n')
  .replace(/url\((['"]?)fonts\//g, 'url($1/icons/fonts/')
  .replace(/url\((['"]?)images\/icons\//g, 'url($1/icons/')
  // site uses `.icon-General_Map` for the UI map button (red 60px box); drop it, it is not a marker glyph
  .replace(/\.icon-General_Map[^{]*\{[^}]*\}\n?/g, '');
await writeFile(path.join(dir, 'icons.css'), fixed);
console.log(`${out.length} rules -> icons.css (${fixed.length} bytes)`);

