import React, { useEffect, useState } from 'react';
import { getPushSubscriptionStatus, enablePush, disablePush, isIosSafariNotInstalled } from '../lib/push';

// Hiện rõ tình trạng nhận thông báo đẩy + nút bật thủ công.
//
// Vì sao cần: việc đăng ký chạy ngầm và khi thất bại thì chỉ ghi vào console —
// trên điện thoại không ai xem được console, nên máy không nhận thông báo mà
// không ai biết lý do. Bảng này nói thẳng đang vướng gì và phải làm gì.

const MO_TA = {
  subscribed: {
    icon: '🔔',
    tieu_de: 'Đang nhận thông báo',
    chi_tiet: 'Máy này sẽ rung và báo cả khi tắt màn hình.',
    tone: 'var(--status-success)',
  },
  unsubscribed: {
    icon: '🔕',
    tieu_de: 'Chưa nhận thông báo',
    chi_tiet: 'Bấm nút bên dưới để bật. Máy sẽ hỏi xin phép một lần.',
    tone: 'var(--status-warning)',
  },
  denied: {
    icon: '⛔',
    tieu_de: 'Đã bị chặn trong cài đặt máy',
    chi_tiet:
      'Trước đây máy này đã bấm "Chặn". Vào Cài đặt trình duyệt → Thông báo → tìm sumibakery.shop → đổi thành "Cho phép", rồi tải lại trang.',
    tone: 'var(--status-danger)',
  },
  ios_add_to_home: {
    icon: '📱',
    tieu_de: 'iPhone cần thêm app vào Màn hình chính',
    chi_tiet:
      'Safari trên iPhone chỉ gửi được thông báo khi app đã được thêm vào Màn hình chính. Bấm nút Chia sẻ ở Safari → "Thêm vào MH chính", rồi mở app từ biểu tượng đó.',
    tone: 'var(--status-info)',
  },
  unsupported: {
    icon: '🚫',
    tieu_de: 'Máy hoặc trình duyệt này không hỗ trợ',
    chi_tiet: 'Thử dùng Chrome trên Android, hoặc Safari trên iPhone (đã thêm vào Màn hình chính).',
    tone: 'var(--text-muted)',
  },
};

export default function PushStatusPanel({ staffId }) {
  const [tt, setTt] = useState('dang_kiem_tra');
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState('');

  const kiemTra = async () => {
    try {
      setTt(await getPushSubscriptionStatus());
    } catch (e) {
      setTt('unsupported');
      setLoi(e?.message || String(e));
    }
  };

  useEffect(() => { kiemTra(); }, []);

  const bat = async () => {
    setBusy(true);
    setLoi('');
    try {
      await enablePush(staffId);
      await kiemTra();
    } catch (e) {
      setLoi(e?.message || String(e));
      await kiemTra();
    } finally {
      setBusy(false);
    }
  };

  const tat = async () => {
    setBusy(true);
    setLoi('');
    try {
      await disablePush();
      await kiemTra();
    } catch (e) {
      setLoi(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (tt === 'dang_kiem_tra') {
    return <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang kiểm tra...</div>;
  }

  const m = MO_TA[tt] || MO_TA.unsupported;
  const coTheBat = tt === 'unsubscribed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1.2 }}>{m.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--text-label)', color: m.tone, fontWeight: 800 }}>{m.tieu_de}</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>
            {m.chi_tiet}
          </div>
        </div>
      </div>

      {loi && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>
          Chi tiết lỗi: {loi}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {coTheBat && (
          <button
            type="button"
            onClick={bat}
            disabled={busy}
            style={{
              minHeight: 44, padding: '0 18px', border: 0, borderRadius: 12,
              background: 'var(--action-primary)', color: 'var(--text-on-primary)',
              fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Đang bật...' : '🔔 Bật thông báo cho máy này'}
          </button>
        )}

        {tt === 'subscribed' && (
          <button
            type="button"
            onClick={tat}
            disabled={busy}
            style={{
              minHeight: 44, padding: '0 16px', border: '1px solid var(--border-default)',
              borderRadius: 12, background: 'var(--surface-card)', color: 'var(--text-secondary)',
              fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            }}
          >
            Tắt trên máy này
          </button>
        )}

        <button
          type="button"
          onClick={kiemTra}
          disabled={busy}
          style={{
            minHeight: 44, padding: '0 16px', border: '1px solid var(--border-default)',
            borderRadius: 12, background: 'var(--surface-card)', color: 'var(--text-secondary)',
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          Kiểm tra lại
        </button>
      </div>

      {isIosSafariNotInstalled() && tt !== 'ios_add_to_home' && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
          Đang mở bằng Safari trên iPhone — nên thêm app vào Màn hình chính để nhận thông báo ổn định.
        </div>
      )}
    </div>
  );
}
