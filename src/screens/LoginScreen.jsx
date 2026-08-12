import React, { useState } from 'react';
import { Input } from '../components/forms/Input';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { translateAuthError } from '../lib/authErrors';

function toAuthField(identifier) {
  const trimmed = identifier.trim();
  return trimmed.includes('@') ? { email: trimmed } : { phone: trimmed };
}

export default function LoginScreen() {
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPw, setRegPw] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const accent = 'oklch(66% 0.17 42)';
  const accentHover = 'oklch(60% 0.18 40)';

  const handleLogin = async () => {
    setError('');
    if (!phone || !pw) { setError('Nhập đầy đủ thông tin đăng nhập.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ ...toAuthField(phone), password: pw });
    setLoading(false);
    if (err) setError(translateAuthError(err.message));
  };

  const handleRegister = async () => {
    setError('');
    if (!regName || !regPhone || !regPw) { setError('Nhập đầy đủ thông tin đăng ký.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      ...toAuthField(regPhone),
      password: regPw,
      options: { data: { full_name: regName } },
    });
    setLoading(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setNotice('Đăng ký thành công! Kiểm tra email để xác nhận rồi đăng nhập (hoặc đăng nhập ngay nếu đã tắt xác nhận email).');
    setMode('login');
  };

  const handleForgotPassword = async () => {
    setError('');
    const trimmed = forgotEmail.trim();
    if (!trimmed) { setError('Nhập email đã đăng ký.'); return; }
    if (!trimmed.includes('@')) { setError('Đặt lại mật khẩu qua số điện thoại chưa hỗ trợ — dùng Gmail/email đã đăng ký, hoặc nhờ chủ shop đổi giúp trong Thiết lập.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: window.location.origin });
    setLoading(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setNotice('Đã gửi email đặt lại mật khẩu — kiểm tra hộp thư (kể cả mục spam) và bấm vào link trong email.');
    setMode('login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-app)', fontFamily: 'var(--font-body)' }}>
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
          <span style={{ font: '700 30px var(--font-display)', color: '#FFFFFF' }}>S</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Sumi Bakery</div>
          <div style={{ font: '700 11px var(--font-body)', letterSpacing: '.08em', color: accent }}>ERP &amp; POS SYSTEM</div>
        </div>

        <div style={{ width: '100%', background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '28px 28px', display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }}>
          {!isSupabaseConfigured && (
            <div style={{ font: 'var(--text-caption)', color: 'var(--status-warning)', background: 'var(--status-warning-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
              Chưa cấu hình Supabase — điền VITE_SUPABASE_URL/ANON_KEY vào file .env rồi khởi động lại `npm run dev`.
            </div>
          )}
          {notice && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-success)', background: 'var(--status-success-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{notice}</div>}
          {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}
          {mode === 'login' ? (
            <React.Fragment>
              <div>
                <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đăng nhập</div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Nhập thông tin để tiếp tục</div>
              </div>
              <Input label="Số điện thoại hoặc Gmail" placeholder="09xx xxx xxx hoặc ten@gmail.com" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Mật khẩu" type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ font: 'var(--text-caption)', color: accent, cursor: 'pointer' }} onClick={() => { setError(''); setForgotEmail(phone.includes('@') ? phone : ''); setMode('forgot'); }}>Quên mật khẩu?</span>
              </div>
              <button disabled={loading} style={{ width: '100%', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 0', background: accent, color: '#FFFFFF', font: '700 15px var(--font-body)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
                onClick={handleLogin}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHover} onMouseLeave={(e) => e.currentTarget.style.background = accent}>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
              <div style={{ textAlign: 'center', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                Chưa có tài khoản? <span style={{ color: accent, fontWeight: 700, cursor: 'pointer' }} onClick={() => { setError(''); setMode('register'); }}>Đăng ký ngay</span>
              </div>
            </React.Fragment>
          ) : mode === 'forgot' ? (
            <React.Fragment>
              <div>
                <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Quên mật khẩu</div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Nhập Gmail/email đã đăng ký, hệ thống sẽ gửi link đặt lại mật khẩu.</div>
              </div>
              <Input label="Email" placeholder="ten@gmail.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              <button disabled={loading} style={{ width: '100%', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 0', background: accent, color: '#FFFFFF', font: '700 15px var(--font-body)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
                onClick={handleForgotPassword}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHover} onMouseLeave={(e) => e.currentTarget.style.background = accent}>{loading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}</button>
              <div style={{ textAlign: 'center', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                <span style={{ color: accent, fontWeight: 700, cursor: 'pointer' }} onClick={() => { setError(''); setMode('login'); }}>← Quay lại đăng nhập</span>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div>
                <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đăng ký tài khoản</div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Tạo tài khoản mới để đăng nhập</div>
              </div>
              <Input label="Họ và tên" placeholder="Nguyễn Văn A" value={regName} onChange={(e) => setRegName(e.target.value)} />
              <Input label="Số điện thoại hoặc Gmail" placeholder="09xx xxx xxx hoặc ten@gmail.com" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} />
              <Input label="Mật khẩu" type="password" placeholder="••••••••" value={regPw} onChange={(e) => setRegPw(e.target.value)} />
              <button disabled={loading} style={{ width: '100%', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 0', background: accent, color: '#FFFFFF', font: '700 15px var(--font-body)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
                onClick={handleRegister}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHover} onMouseLeave={(e) => e.currentTarget.style.background = accent}>{loading ? 'Đang đăng ký...' : 'Đăng ký'}</button>
              <div style={{ textAlign: 'center', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                Đã có tài khoản? <span style={{ color: accent, fontWeight: 700, cursor: 'pointer' }} onClick={() => { setError(''); setMode('login'); }}>Đăng nhập</span>
              </div>
            </React.Fragment>
          )}
        </div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>© Sumi Bakery — Ops System</div>
      </div>
    </div>
  );
}
