import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages などのサブパス配信に対応するため、環境変数でベースパスを切り替え可能にする。
// 例: BASE_PATH=/Sanpo/ npm run build
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service Worker はアプリシェルのキャッシュのみに利用する。
      // データ取得(Overpass / ORS)のオフラインキャッシュは仕様上不要。
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // 地図タイル・API レスポンスはキャッシュしない(常時オンライン前提)。
        navigateFallbackDenylist: [/^\/api/],
      },
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '散歩道決定アプリ Sanpo',
        short_name: 'Sanpo',
        description: '直近の履歴と重複しない、気分に合った散歩ルートを提案するPWA',
        theme_color: '#2f855a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
