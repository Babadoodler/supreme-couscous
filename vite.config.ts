import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Self-hosted tesseract.js engine + language data served under /ocr/ —
// no CDN at all, so screenshot OCR works offline and the image (and
// nothing else) never leaves the device (DESIGN.md §7.9). Engine files come
// from node_modules; the language data is vendored (vendor/ocr).
const OCR_ASSETS: Record<string, { source: () => Buffer; type: string }> = {
  'ocr/worker.min.js': {
    source: () => readFileSync(require.resolve('tesseract.js/dist/worker.min.js')),
    type: 'text/javascript'
  },
  'ocr/tesseract-core-simd-lstm.js': {
    source: () => readFileSync(require.resolve('tesseract.js-core/tesseract-core-simd-lstm.js')),
    type: 'text/javascript'
  },
  'ocr/tesseract-core-simd-lstm.wasm': {
    source: () => readFileSync(require.resolve('tesseract.js-core/tesseract-core-simd-lstm.wasm')),
    type: 'application/wasm'
  },
  'ocr/lang/eng.traineddata.gz': {
    source: () => readFileSync(new URL('./vendor/ocr/eng.traineddata.gz', import.meta.url)),
    type: 'application/gzip'
  }
};

function ocrAssets(): Plugin {
  return {
    name: 'waypoint-ocr-assets',
    apply: 'build',
    buildStart() {
      for (const [fileName, asset] of Object.entries(OCR_ASSETS)) {
        this.emitFile({ type: 'asset', fileName, source: asset.source() });
      }
    }
  };
}

function ocrAssetsDev(): Plugin {
  return {
    name: 'waypoint-ocr-assets-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url ?? '').replace(/^\//, '').split('?')[0]!;
        const asset = OCR_ASSETS[key];
        if (!asset) return next();
        res.setHeader('Content-Type', asset.type);
        res.end(asset.source());
      });
    }
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    ocrAssets(),
    ocrAssetsDev(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'WayPoint — GPX Route Builder',
        short_name: 'WayPoint',
        description: 'Create, edit and export simple GPX routes on your phone.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        file_handlers: [
          {
            action: '/',
            accept: { 'application/gpx+xml': ['.gpx'] }
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // OCR engine is big and optional — runtime-cached, never precached.
        globIgnores: ['**/ocr/**'],
        runtimeCaching: [
          {
            // Map tiles & styles: stale-while-revalidate with an LRU cap (DESIGN.md §8)
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, purgeOnQuotaError: true }
            }
          },
          {
            // Overview/share-card raster tiles (OSM)
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'osm-raster-tiles',
              expiration: { maxEntries: 500, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Self-hosted OCR engine + language data: cached on first use,
            // then screenshot import works fully offline.
            urlPattern: /\/ocr\//,
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-engine', expiration: { maxEntries: 8 } }
          }
          // Geocoding is deliberately network-only (DESIGN.md §8): no cache entry.
        ]
      }
    })
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
