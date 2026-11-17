// Nén ảnh chụp trên điện thoại trước khi tải lên (yêu cầu Giám đốc 05/10/2026).
//
// Đo thật 20 ảnh "Hoàn thành giao" gần nhất: 1,3–4,3MB/tấm (trung bình ~2,6MB)
// vì ảnh camera được gửi nguyên gốc. Tải lên qua WiFi/4G mất 10–30s mỗi đơn,
// tài xế giao dồn 10 đơn là đơ liên tục. Thu về cạnh dài 1600px, JPEG 80% —
// vẫn đọc rõ chữ trên hộp bánh/giấy tờ, chỉ còn khoảng 200–400KB.
//
// KHÔNG BAO GIỜ chặn người dùng: lỗi gì (định dạng trình duyệt không đọc được,
// máy cũ thiếu canvas...) cũng trả lại ẢNH GỐC để luồng chạy y như trước.

const CANH_DAI_TOI_DA = 1600;
const CHAT_LUONG = 0.8;
const BO_QUA_DUOI_BYTE = 400 * 1024; // ảnh đã nhỏ sẵn thì giữ nguyên

function docAnh(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // <img> tự xoay theo EXIF (image-orientation: from-image mặc định trên
    // Safari/Chrome hiện nay) nên ảnh dọc chụp từ điện thoại không bị nằm ngang.
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
    img.src = url;
  });
}

// Tuỳ chọn (không truyền = y như cũ): { canhDai, chatLuong, boQuaDuoi } — Bán tại quầy dùng
// bản nhỏ hơn cho ảnh hoá đơn vì mỗi ngày cả trăm tấm (xem docAnhBan trong posThat.js).
export async function nenAnh(file, { canhDai = CANH_DAI_TOI_DA, chatLuong = CHAT_LUONG, boQuaDuoi = BO_QUA_DUOI_BYTE } = {}) {
  try {
    if (!file || !String(file.type || '').startsWith('image/')) return file;
    if (file.size <= boQuaDuoi) return file;

    const img = await docAnh(file);
    const rong = img.naturalWidth || img.width;
    const cao = img.naturalHeight || img.height;
    if (!rong || !cao) return file;

    const tiLe = Math.min(1, canhDai / Math.max(rong, cao));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rong * tiLe);
    canvas.height = Math.round(cao * tiLe);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', chatLuong));
    if (!blob || blob.size >= file.size) return file;

    const ten = (file.name || 'anh').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], ten, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('[nenAnh] Không nén được, gửi ảnh gốc:', err);
    return file;
  }
}
