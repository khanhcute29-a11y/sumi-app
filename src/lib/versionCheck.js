// Đối chiếu phiên bản app đang chạy với phiên bản trên máy chủ.
//
// Vì sao cần: bản APK cài tay trên máy nhân viên giữ code cũ trong bộ nhớ đệm.
// Khi ta sửa code trên máy chủ, máy họ vẫn chạy bản cũ nên dữ liệu lệch nhau.

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

// So sánh kiểu 1.2.10 > 1.2.9 (so từng số, không so chuỗi — so chuỗi sẽ cho
// kết quả sai vì "10" < "9" khi so từng ký tự).
export function soSanhPhienBan(a, b) {
  const pa = String(a || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/**
 * Trả về { canNangCap, phienBanMoi, duongDanTai, ghiChu, batBuoc } hoặc null.
 * Lỗi mạng thì trả null — KHÔNG bao giờ chặn màn hình chỉ vì không hỏi được
 * máy chủ, nếu không nhân viên mất mạng sẽ không dùng được app.
 */
export async function kiemTraPhienBan() {
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.version) return null;

    const canNangCap = soSanhPhienBan(data.version, APP_VERSION) > 0;
    return {
      canNangCap,
      phienBanHienTai: APP_VERSION,
      phienBanMoi: data.version,
      duongDanTai: data.download_url || '',
      ghiChu: data.notes || '',
      batBuoc: data.force !== false,
    };
  } catch (err) {
    console.warn('[Version] Không hỏi được phiên bản máy chủ:', err?.message || err);
    return null;
  }
}
