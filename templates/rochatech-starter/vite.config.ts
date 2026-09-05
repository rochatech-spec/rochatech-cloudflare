import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'RochaTech App', short_name: 'RochaTech', display: 'standalone',
        start_url: '/', scope: '/', theme_color: '#0f172a', background_color: '#f8fafc'
      },
      workbox: { navigateFallback: '/index.html', cleanupOutdatedCaches: true }
    })
  ]
});
