import { defineConfig, type Plugin } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// @ts-expect-error plain ESM package without types
import { findSaveRoots, findLatestSlot, readSlot } from '../../packages/saves/src/index.mjs';

// Local-only bridge: allows using the browser dev view without Tauri.
function saveBridge(): Plugin {
  let knownIds: Set<string> | null = null;
  const load = async () =>
    (knownIds ??= new Set(
      (JSON.parse(await readFile(new URL('../../data/markers.json', import.meta.url), 'utf8')) as { gameId: string | null }[])
        .map((m) => m.gameId ?? '')
        .filter((g) => /^\d+$/.test(g)),
    ));
  return {
    name: 'zelda-notes-save-bridge',
    configureServer(server) {
      server.middlewares.use('/api/progress', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        try {
          const slot = await findLatestSlot(await findSaveRoots());
          if (!slot) {
            res.end(JSON.stringify({ found: false }));
            return;
          }
          const r = await readSlot(slot, await load());
          res.end(
            JSON.stringify({
              found: true,
              ok: r.ok,
              emulator: r.emulator,
              slot: r.slot,
              mtimeMs: r.mtimeMs,
              collected: [...r.collected],
              scene: r.scene,
              sceneSource: r.scene ? 'save' : 'none',
              pos: r.pos,
              age: r.age,
              errors: r.errors,
            }),
          );
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ found: false, error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig({
  publicDir: '../../data',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        overlay: resolve(import.meta.dirname, 'overlay.html'),
      },
    },
  },
  plugins: [saveBridge()],
});
