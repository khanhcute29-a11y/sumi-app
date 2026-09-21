import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/**
 * Serverless TTS Endpoint: Giọng đọc NAM MINH chuẩn tiếng Việt (vi-VN-NamMinhNeural)
 * Sử dụng công nghệ Microsoft Neural TTS chất lượng cao, tự nhiên như người thật.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const text = req.method === 'GET' ? req.query.text : req.body?.text;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Thiếu nội dung text cần đọc' });
  }

  // Cắt ngắn nếu quá dài để tối ưu độ trễ
  const cleanText = text.slice(0, 1000).trim();

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('vi-VN-NamMinhNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(cleanText);

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
      console.error('[API TTS Stream Error]:', err);
      res.status(500).json({ error: err.message });
    });
  } catch (error) {
    console.error('[API TTS NamMinh Error]:', error);
    res.status(500).json({ error: 'Lỗi phát âm thanh Nam Minh: ' + error.message });
  }
}
