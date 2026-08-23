import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Sumi Bakery — ERP & POS',
        short_name: 'Sumi Bakery',
        description: 'Sumi Bakery — Enterprise Operations & Management',
        theme_color: '#C88A4B',
        background_color: '#FAF6F0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: {
        // App shell (HTML/JS/CSS) luôn cache để mở được khi mất mạng.
        // API Supabase KHÔNG cache ở đây — dữ liệu ghi khi offline được xử lý riêng qua hàng đợi (offlineQueue.js).
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // Ảnh hướng dẫn tải theo nhu cầu để không làm lần cập nhật app quá nặng.
        globIgnores: ['visual-guides/**'],
      },
    }),
  ],
})
