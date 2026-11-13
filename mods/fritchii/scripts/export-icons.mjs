import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { groupCategoriesForMenu } from '../../../packages/core/src/index.mjs';
import { badge } from '../../../apps/web/src/shared.ts';

const [, , dataDirArg, outBinArg, outMetaArg] = process.argv;
if (!dataDirArg || !outBinArg || !outMetaArg) {
  console.error('Usage: node export-icons.mjs <dataDir> <out.znicons> <out-manifest.json>');
  process.exit(2);
}

const dataDir = path.resolve(dataDirArg);
const outBin = path.resolve(outBinArg);
const outMeta = path.resolve(outMetaArg);
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const webSrcDir = path.join(repoRoot, 'apps/web/src');
const iconsDir = path.join(dataDir, 'icons');

function findBrowser() {
  const candidates = [
    process.env.ZN_BROWSER_BIN,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Headless browser not found (set ZN_BROWSER_BIN to Edge/Chrome executable)');
}

function toDataUri(relPath) {
  const clean = relPath.replace(/^\/icons\//, '').replace(/^[/'"]+|[/'"]+$/g, '').split('?')[0].split('#')[0];
  const full = path.join(iconsDir, clean);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const mime =
    ext === '.svg' ? 'image/svg+xml' :
    ext === '.png' ? 'image/png' :
    ext === '.ttf' ? 'font/ttf' :
    ext === '.woff' ? 'font/woff' : 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function inlineCssUrls(css) {
  return css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, _q, u) => {
    if (u.startsWith('data:')) return m;
    const uri = toDataUri(u.replace(/^\/icons\//, ''));
    return uri ? `url("${uri}")` : m;
  });
}

function renderCategoryBadge(c, size) {
  // General_Map (64025) has no glyph in icomoon.ttf; fallback to BotW_Book (\e921).
  const fixed = c.img === 'General_Map' ? { ...c, img: 'BotW_Book' } : c;
  return badge(fixed, size);
}

const categoriesRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'categories.json'), 'utf8'));
const sections = groupCategoriesForMenu(categoriesRaw);
const grouped = [];
let idx = 0;
for (const sec of sections) {
  for (const c of sec.categories) {
    grouped.push({ id: String(c.id), name: c.name, section: sec.id, index: idx++, category: c });
  }
}

const badgesCss = inlineCssUrls(fs.readFileSync(path.join(webSrcDir, 'badges.css'), 'utf8'));
const iconsCss = inlineCssUrls(fs.readFileSync(path.join(iconsDir, 'icons.css'), 'utf8'));
const sizes = [48, 32, 24, 18];

function makeHtml(bg) {
  const bands = sizes.map((sz) => {
    const cells = [];
    for (let i = 0; i < 48; i++) {
      const g = grouped[i];
      cells.push(`<div class="cell">${g ? renderCategoryBadge(g.category, sz) : ''}</div>`);
    }
    return `<div class="band">${cells.join('')}</div>`;
  }).join('\n');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${iconsCss}
${badgesCss}
html, body { margin: 0; padding: 0; background: ${bg}; overflow: hidden; }
.sheet { width: 1024px; height: 768px; }
.band { display: grid; grid-template-columns: repeat(16, 64px); grid-auto-rows: 64px; height: 192px; }
.cell { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; }
</style>
</head>
<body><div class="sheet">${bands}</div></body>
</html>`;
}

const browser = findBrowser();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zn-export-icons-'));
try {
  const profileDir = path.join(tmpDir, 'edge-profile');
  const htmlB = path.join(tmpDir, 'black.html');
  const htmlW = path.join(tmpDir, 'white.html');
  const pngB = path.join(tmpDir, 'black.png');
  const pngW = path.join(tmpDir, 'white.png');
  fs.writeFileSync(htmlB, makeHtml('#000000'), 'utf8');
  fs.writeFileSync(htmlW, makeHtml('#ffffff'), 'utf8');

  for (const [html, png] of [[htmlB, pngB], [htmlW, pngW]]) {
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${profileDir}`,
      '--window-size=1024,768',
      `--screenshot=${png}`,
      pathToFileURL(html).href,
    ], { stdio: 'pipe' });
  }

  fs.mkdirSync(path.dirname(outBin), { recursive: true });
  fs.mkdirSync(path.dirname(outMeta), { recursive: true });
  execFileSync('python', [
    path.join(import.meta.dirname, 'pack-icons.py'),
    pngB,
    pngW,
    String(grouped.length),
    outBin,
  ], { stdio: 'inherit' });

  const manifest = {
    version: 1,
    sizes: { catLarge: 48, catSmall: 32, pinLarge: 24, pinSmall: 18 },
    categories: grouped.map(({ id, name, section, index }) => ({ id, name, section, index })),
  };
  fs.writeFileSync(outMeta, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
