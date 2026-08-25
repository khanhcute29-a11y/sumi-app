import React, { useEffect, useState } from 'react';
import { kiemTraPhienBan } from '../lib/versionCheck';

// Hộp thoại khoá màn hình khi máy chủ đã có phiên bản mới hơn.
// Kiểm tra lúc mở app và mỗi khi nhân viên quay lại app.
export default function UpdateRequiredModal() {
  const [tt, setTt] = useState(null);

  useEffect(() => {
    let huy = false;
    const kiem = async () => {
      const kq = await kiemTraPhienBan();
      if (!huy && kq?.canNangCap) setTt(kq);
    };
    kiem();
    const khiQuayLai = () => { if (document.visibilityState === 'visible') kiem(); };
    document.addEventListener('visibilitychange', khiQuayLai);
    return () => { huy = true; document.removeEventListener('visibilitychange', khiQuayLai); };
  }, []);

  if (!tt) return null;

  const taiVe = () => {
    if (tt.duongDanTai) window.location.href = tt.duongDanTai;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(44, 29, 17, .72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420, padding: 24, borderRadius: 18,
          background: 'var(--surface-card)', textAlign: 'center',
          boxShadow: '0 16px 48px rgba(140, 90, 60, .4)',
        }}
      >
        <div style={{ fontSize: 46, lineHeight: 1, marginBottom: 10 }}>🎉</div>

        <h2 style={{ margin: '0 0 8px', fontSize: 20, color: 'var(--text-primary)' }}>
          Hệ thống đã có phiên bản nâng cấp mới!
        </h2>

        <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: 15 }}>
          Vui lòng bấm vào nút dưới đây để cập nhật ngay.
        </p>

        <p style={{ margin: '0 0 6px', color: 'var(--text-muted)', fontSize: 13 }}>
          Bản đang dùng <b>{tt.phienBanHienTai}</b> → bản mới <b style={{ color: 'var(--action-primary)' }}>{tt.phienBanMoi}</b>
        </p>

        {tt.ghiChu && (
          <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>
            {tt.ghiChu}
          </p>
        )}

        <button
          type="button"
          onClick={taiVe}
          disabled={!tt.duongDanTai}
          style={{
            width: '100%', minHeight: 52, marginTop: 8, border: 0, borderRadius: 14,
            background: 'var(--action-primary)', color: 'var(--text-on-primary)',
            fontSize: 17, fontWeight: 900,
            cursor: tt.duongDanTai ? 'pointer' : 'not-allowed',
            opacity: tt.duongDanTai ? 1 : 0.6,
            boxShadow: '0 4px 0 #a84b2e',
          }}
        >
          ⬇️ Cập nhật ngay
        </button>

        <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
          Sau khi tải xong, mở tệp và cài đè lên bản cũ. Không cần gỡ bản cũ.
        </p>

        {/* Lối thoát khi bản mới chưa sẵn sàng để tải — tránh khoá chết app,
            nhân viên vẫn phải bán hàng được. */}
        {!tt.batBuoc && (
          <button
            type="button"
            onClick={() => setTt(null)}
            style={{
              width: '100%', minHeight: 44, marginTop: 10, border: 0, borderRadius: 12,
              background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Để sau
          </button>
        )}
      </div>
    </div>
  );
}
