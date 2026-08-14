import React, { useState } from 'react';
import { Input } from '../components/forms/Input';
import { supabase } from '../lib/supabaseClient';
import { translateAuthError } from '../lib/authErrors';

export default function ResetPasswordScreen({ onDone }) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const accent = 'oklch(66% 0.17 42)';

  const handleSubmit = async () => {
    setError('');
    if (newPw.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự.'); return; }
    if (newPw !== confirmPw) { setError('Mật khẩu nhập lại không khớp.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPw });
    setLoading(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    onDone();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-app)', fontFamily: 'var(--font-body)', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ width: 380, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
          <span style={{ font: '700 30px var(--font-display)', color: '#FFFFFF' }}>S</span>
        </div>
        <div style={{ width: '100%', background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '28px 28px', display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đặt mật khẩu mới</div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Nhập mật khẩu mới cho tài khoản của bạn</div>
          </div>
          {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}
          <Input label="Mật khẩu mới" type="password" placeholder="••••••••" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <Input label="Nhập lại mật khẩu mới" type="password" placeholder="••••••••" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          <button disabled={loading} style={{ width: '100%', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 0', background: accent, color: '#FFFFFF', font: '700 15px var(--font-body)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
            onClick={handleSubmit}>{loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}</button>
        </div>
      </div>
    </div>
  );
}
