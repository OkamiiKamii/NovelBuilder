import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Emits `sw.js`, a service worker that stores the built app on the device so
 * it opens with no network at all. The file list is generated from the build,
 * and a new build gets a new cache, replacing the old one.
 */
function offlineApp(): Plugin {
  return {
    name: 'novel-builder-offline-app',
    apply: 'build',
    // Runs after the files are written, when their hashed names are final.
    writeBundle(output, bundle) {
      const files = ['/', ...Object.keys(bundle).filter((file) => !file.endsWith('.map') && file !== 'index.html').map((file) => `/${file}`)];
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
      writeFileSync(
        join(output.dir ?? 'dist', 'sw.js'),
        `const CACHE = 'novel-builder-${version}';
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('novel-builder-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Every route is the same single page: newest from the network, stored copy when offline.
    event.respondWith(fetch(request).catch(() => caches.match('/', { cacheName: CACHE, ignoreVary: true })));
    return;
  }
  // ignoreVary: these files are identical for every visitor, whatever headers the server varies on.
  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreVary: true }).then((hit) => hit || fetch(request)));
});
`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineApp()],
  build: {
    rollupOptions: {
      // Optional extras of the PDF library (HTML and SVG rendering) that this app never calls.
      external: ['canvg', 'html2canvas', 'dompurify'],
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
