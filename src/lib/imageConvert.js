const HEIC_TYPES = ['image/heic', 'image/heif'];

function looksLikeHeic(file) {
  if (HEIC_TYPES.includes(file.type)) return true;
  return /\.(heic|heif)$/i.test(file.name || '');
}

// Ảnh HEIC (mặc định của iPhone/Mac) không hiển thị được trên Chrome/hầu hết trình duyệt —
// convert sang JPEG ngay khi chọn ảnh để tránh lưu ảnh "chết" vào đơn hàng.
export async function toWebSafeImage(file) {
  if (!looksLikeHeic(file)) return file;
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], (file.name || 'anh').replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' });
}
