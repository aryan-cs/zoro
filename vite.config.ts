import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
// Which build is running (shown in debug readouts): when it was built, in UTC.
const BUILD = `${new Date().toISOString().slice(5, 16).replace('T', ' ')}Z`;

// Served from https://aryan-cs.github.io/zoro/
export default defineConfig({
  base: '/zoro/',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Zoro',
        short_name: 'Zoro',
        description: 'Training, food, and sleep tracker',
        start_url: '/zoro/',
        scope: '/zoro/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,wasm}'], // webp: the exercise photos, so they show offline
        navigateFallback: '/zoro/index.html',
        // Let the sleep shortcut file download instead of opening the app.
        navigateFallbackDenylist: [/\.shortcut$/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
