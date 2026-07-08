import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
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
        runtimeCaching: [
          {
            // Map tiles & styles: stale-while-revalidate with an LRU cap (DESIGN.md §8)
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, purgeOnQuotaError: true }
            }
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
