import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ritmo-logo.webp', 'pwa-192.png', 'pwa-512.png', 'push-sw.js'],
      manifest: {
        id: '/',
        name: 'Ritmo • Gestão Financeira',
        short_name: 'Ritmo',
        description: 'Gestão financeira pessoal com sincronização segura.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: '#F3F6FA',
        theme_color: '#F3F6FA',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Nova transação', short_name: 'Transação', url: '/?action=new-transaction', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Metas', short_name: 'Metas', url: '/?page=goals', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,webp,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/(transactions|debts|goals|events|profile)(?:\/|$)/,
            method: 'POST',
            handler: 'NetworkOnly',
            options: { backgroundSync: { name: 'ritmo-data-post-queue', options: { maxRetentionTime: 24 * 60 } } }
          },
          {
            urlPattern: /\/api\/(transactions|debts|goals|events|profile)(?:\/|$)/,
            method: 'PATCH',
            handler: 'NetworkOnly',
            options: { backgroundSync: { name: 'ritmo-data-patch-queue', options: { maxRetentionTime: 24 * 60 } } }
          },
          {
            urlPattern: /\/api\/(transactions|debts|goals|events|profile)(?:\/|$)/,
            method: 'PUT',
            handler: 'NetworkOnly',
            options: { backgroundSync: { name: 'ritmo-data-put-queue', options: { maxRetentionTime: 24 * 60 } } }
          },
          {
            urlPattern: /\/api\/(transactions|debts|goals|events|profile)(?:\/|$)/,
            method: 'DELETE',
            handler: 'NetworkOnly',
            options: { backgroundSync: { name: 'ritmo-data-delete-queue', options: { maxRetentionTime: 24 * 60 } } }
          }
        ]
      }
    })
  ],
  build: { target: 'es2022', sourcemap: false, cssCodeSplit: true },
  server: { port: 5173 }
});
