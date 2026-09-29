import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The app decides when to reload (see features/pwa/pwa-prompts.tsx): a new
      // version never replaces the page under a form the user is filling in.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Startup ERP',
        short_name: 'ERP',
        description: 'ERP interno de la startup: proyectos, tareas, reuniones y documentos.',
        lang: 'es',
        categories: ['business', 'productivity'],
        theme_color: '#0a0a0a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Mi cronograma', url: '/schedule' },
          { name: 'Notificaciones', url: '/notifications' },
        ],
      },
      workbox: {
        // Only the built app shell is precached. There is deliberately no runtime
        // caching: API answers (auth, documents, everything) are per-user and
        // must always hit the network (docs/UI-UX.md "PWA y conectividad").
        runtimeCaching: [],
        // The SPA fallback must never answer an API path.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
