import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApiApp, getVixSrcIndexStore, readStreamsStore } from './server/apiApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = createApiApp(express());

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`
const sheetsMap = new Map();
function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
function injectQuery(id) {
  return id;
}
function createHotContext() {
  return {
    accept() {},
    acceptDeps() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {},
  };
}
class ErrorOverlay extends HTMLElement {}
export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
`);
    });

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          const baseName = path.basename(filePath);
          if (
            baseName === 'index.html' ||
            baseName === 'sw.js' ||
            baseName === 'registerSW.js' ||
            baseName === 'manifest.webmanifest' ||
            baseName.startsWith('workbox-')
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MullahMax server running on http://0.0.0.0:${PORT}`);
    setTimeout(() => {
      void readStreamsStore();
      void getVixSrcIndexStore('movie');
      void getVixSrcIndexStore('tv');
    }, 300);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
