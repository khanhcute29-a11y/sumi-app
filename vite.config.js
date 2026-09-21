import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  // Nhúng số phiên bản vào bản build để app tự biết mình đang là bản nào,
  // rồi đối chiếu với /version.json trên máy chủ.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
    {
      name: 'api-tts-dev',
      configureServer(server) {
        server.middlewares.use('/api/tts', async (req, res) => {
          try {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const text = parsedUrl.searchParams.get('text');
            if (!text) {
              res.statusCode = 400;
              res.end('Missing text parameter');
              return;
            }
            const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
            const tts = new MsEdgeTTS();
            await tts.setMetadata('vi-VN-NamMinhNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
            const { audioStream } = tts.toStream(text.slice(0, 1000));
            
            const chunks = [];
            audioStream.on('data', chunk => chunks.push(chunk));
            audioStream.on('end', () => {
              const buffer = Buffer.concat(chunks);
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Content-Length', buffer.length);
              res.setHeader('Accept-Ranges', 'bytes');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(buffer);
            });
            audioStream.on('error', err => {
              console.error('[Vite TTS Stream error]:', err);
              res.statusCode = 500;
              res.end(err.message);
            });
          } catch (err) {
            console.error('[Vite TTS Dev Error]:', err);
            res.statusCode = 500;
            res.end(err.message);
          }
        });
      }
    }
  ],
})

