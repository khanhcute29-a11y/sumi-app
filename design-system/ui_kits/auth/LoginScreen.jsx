const { Button, Input } = window.SumiBakeryDesignSystem_ade08e;

function LoginScreen() {
  const [mode, setMode] = React.useState('login');
  const [phone, setPhone] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [regName, setRegName] = React.useState('');
  const [regPhone, setRegPhone] = React.useState('');
  const [regPw, setRegPw] = React.useState('');
  const accent = 'oklch(66% 0.17 42)';
  const accentHover = 'oklch(60% 0.18 40)';
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
          {mode === 'login' ? (
            <React.Fragment>
              <div>
                <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đăng nhập</div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Nhập thông tin để tiếp tục</div>
              </div>
              <Input label="Số điện thoại hoặc Gmail" placeholder="09xx xxx xxx hoặc ten@gmail.com" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Mật khẩu" type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ font: 'var(--text-caption)', color: accent, cursor: 'pointer' }}>Quên mật khẩu?</span>
              </div>
              <button style={{ width: '100%', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 0', background: accent, color: '#FFFFFF', font: '700 15px var(--font-body)', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHover} onMouseLeave={(e) => e.currentTarget.style.background = accent}>Đăng nhập</button>
              <div style={{ textAlign: 'center', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                Chưa có tài khoản? <span style={{ color: accent, fontWeight: 700, cursor: 'pointer' }} onClick={() => setMode('register')}>Đăng ký ngay</span>
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
              <button style={{ width: '100%', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px 0', background: accent, color: '#FFFFFF', font: '700 15px var(--font-body)', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHover} onMouseLeave={(e) => e.currentTarget.style.background = accent}>Đăng ký</button>
              <div style={{ textAlign: 'center', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                Đã có tài khoản? <span style={{ color: accent, fontWeight: 700, cursor: 'pointer' }} onClick={() => setMode('login')}>Đăng nhập</span>
              </div>
            </React.Fragment>
          )}
        </div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>© Sumi Bakery — Ops System</div>
      </div>
    </div>
  );
}
Object.assign(window, { LoginScreen });
