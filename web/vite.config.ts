/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: { config: true },
      manifest: {
        name: 'RigTracker',
        short_name: 'RigTracker',
        description: 'Rigs, gear, events and people for the skydiving club',
        theme_color: '#1d64c2',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        // Cache the app shell only. API responses and uploaded media are never cached,
        // and neither /api nor /uploads is ever answered with index.html.
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same origin in development too: the API (default port 4000) is proxied.
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:4000',
      '/uploads': process.env.API_URL ?? 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    // Full-page tests render the whole app; give them room when the machine is busy.
    testTimeout: 10_000,
  },
});
