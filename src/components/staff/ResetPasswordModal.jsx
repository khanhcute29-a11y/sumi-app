import React, { useState } from 'react';
import { resetStaffPassword } from '../../lib/queries';

// "Cấp lại mật khẩu nhanh" — Quản lý/Giám đốc/Bếp trưởng bấm khi nhân sự
// quên mật khẩu, KHÔNG qua email (nhân sự lớn tuổi, không rành công nghệ).
// Quyền thật do Edge Function admin-reset-password + RPC la_quan_ly_cua_ho_so
// kiểm tra ở server — modal này chỉ là giao diện, không tự quyết định ai
// được phép.

function randomPin6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const wrap = { position: 'fixed', inset: 0, background: 'rgba(44,29,17,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 3000 };
const card = { width: '100%', maxWidth: 380, background: '#FDFBF7', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 50px -12px rgba(44,29,17,0.4)' };
const label = { font: 'var(--text-caption, 12px)', fontWeight: 700, color: '#8C5A3C', display: 'block', marginBottom: 5 };
const inputStyle = { width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid #EADCC9', padding: '0 12px', fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff', color: '#2C1D11' };
const tabBtn = (active) => ({ flex: 1, minHeight: 44, borderRadius: 10, border: active ? '2px solid #D96B43' : '1px solid #EADCC9', background: active ? '#FCEEE6' : '#fff', color: active ? '#D96B43' : '#8C5A3C', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' });

export default function ResetPasswordModal({ staffId, staffName, onClose }) {
  const [mode, setMode] = useState('manual'); // 'manual' | 'pin'
  const [manualPassword, setManualPassword] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneWith, setDoneWith] = useState(''); // mật khẩu vừa cấp thành công, hiện để đọc cho NV

  const activePassword = mode === 'manual' ? manualPassword.trim() : pin;

  const handleGeneratePin = () => {
    setPin(randomPin6());
    setError('');
  };

  const handleConfirm = async () => {
    setError('');
    if (activePassword.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự/số.');
      return;
    }
    setBusy(true);
    try {
      await resetStaffPassword({ staffId, newPassword: activePassword });
      setDoneWith(activePassword);
    } catch (e) {
      setError(e.message || 'Không cấp lại được mật khẩu.');
    } finally {
      setBusy(false);
    }
  };

  if (doneWith) {
    return (
      <div style={wrap} onClick={onClose}>
        <div style={card} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#2C1D11' }}>✅ Đã cấp lại mật khẩu</div>
          <div style={{ font: 'var(--text-body-sm, 13px)', color: '#8C5A3C' }}>
            Đọc mật khẩu này cho <strong>{staffName}</strong> — họ cần đăng nhập lại (phiên cũ đã bị đăng xuất):
          </div>
          <div style={{ textAlign: 'center', padding: '14px 0', background: '#F7EFE2', borderRadius: 12, letterSpacing: 3, fontSize: 28, fontWeight: 900, color: '#D96B43', fontFamily: 'monospace' }}>
            {doneWith}
          </div>
          <button
            onClick={onClose}
            style={{ minHeight: 46, borderRadius: 10, border: 'none', background: '#D96B43', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}
          >
            Xong
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#2C1D11' }}>🔑 Cấp lại mật khẩu</div>
          <div style={{ font: 'var(--text-caption, 12px)', color: '#8C5A3C', marginTop: 2 }}>Cho {staffName}</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={tabBtn(mode === 'manual')} onClick={() => { setMode('manual'); setError(''); }}>Tự nhập</button>
          <button type="button" style={tabBtn(mode === 'pin')} onClick={() => { setMode('pin'); setError(''); }}>Mã PIN 6 số</button>
        </div>

        {mode === 'manual' ? (
          <div>
            <label style={label}>Mật khẩu mới (dễ nhớ, vd: sumi1234)</label>
            <input
              style={inputStyle}
              value={manualPassword}
              onChange={(e) => setManualPassword(e.target.value)}
              placeholder="sumi1234"
            />
          </div>
        ) : (
          <div>
            <label style={label}>Mã PIN 6 số</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', letterSpacing: 4, fontWeight: 800, fontSize: 20, fontFamily: 'monospace', color: pin ? '#D96B43' : '#8C5A3C' }}>
                {pin || '——————'}
              </div>
              <button
                type="button"
                onClick={handleGeneratePin}
                style={{ minWidth: 100, borderRadius: 10, border: 'none', background: '#F7EFE2', color: '#8C5A3C', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                🎲 Tạo mã
              </button>
            </div>
          </div>
        )}

        {error && <div style={{ font: 'var(--text-body-sm, 13px)', color: '#E53935' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ flex: 1, minHeight: 46, borderRadius: 10, border: '1px solid #EADCC9', background: '#fff', color: '#8C5A3C', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || activePassword.length < 6}
            style={{ flex: 1, minHeight: 46, borderRadius: 10, border: 'none', background: busy ? '#e8b39d' : '#D96B43', color: '#fff', fontWeight: 800, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}
          >
            {busy ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}
