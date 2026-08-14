import React, { useEffect, useState } from 'react';
import { Card } from '../components/data/Card';
import { Switch } from '../components/forms/Switch';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { Tabs } from '../components/navigation/Tabs';
import { Button } from '../components/forms/Button';
import { Badge } from '../components/feedback/Badge';
import { supabase } from '../lib/supabaseClient';
import { fetchMyProfile, updateMyProfile, fetchShopSettings, updateShopSettings, fetchAuditLog, backupAllData, fetchIncidentReports, resolveIncidentReport } from '../lib/queries';
import { translateAuthError } from '../lib/authErrors';
import { getCurrentPosition } from '../lib/geo';
import { IconMapPin, IconSettings, IconBell, IconDownload, IconWarning, IconCheck } from '../components/icons/FrogIcons';
import { isPushSupported, getPushSubscriptionStatus, enablePush, disablePush } from '../lib/push';
import { localDateStr } from '../lib/date';
import { ROLE_META, ROLE_OPTIONS, ROLE_PERMISSIONS } from '../lib/roles';
import { getUiScale, setUiScale } from '../lib/uiScale';

function Section({ title, children }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{title}</div>
      {children}
    </Card>
  );
}

function ChangePasswordForm({ onDone }) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (newPw.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự.'); return; }
    if (newPw !== confirmPw) { setError('Mật khẩu nhập lại không khớp.'); return; }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setSuccess(true);
    setTimeout(onDone, 1200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {success ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-success)' }}>Đổi mật khẩu thành công!</div>
      ) : (
        <React.Fragment>
          <Input label="Mật khẩu mới" type="password" placeholder="••••••••" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <Input label="Nhập lại mật khẩu mới" type="password" placeholder="••••••••" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onDone} disabled={saving}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu mật khẩu mới'}</Button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function ShopLocationSection() {
  const [settings, setSettings] = useState(null);
  const [gasPrice, setGasPrice] = useState('');
  const [avgSpeed, setAvgSpeed] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = () => {
    fetchShopSettings().then((data) => {
      setSettings(data);
      setGasPrice(String(data?.gas_price_per_km ?? 5000));
      setAvgSpeed(String(data?.avg_speed_kmh ?? 25));
    }).catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const handleLocate = async () => {
    setLocating(true);
    setError('');
    const pos = await getCurrentPosition();
    setLocating(false);
    if (!pos) { setError('Không lấy được vị trí — kiểm tra đã cho phép truy cập vị trí (GPS) chưa.'); return; }
    setSettings((s) => ({ ...s, shop_lat: pos.lat, shop_lng: pos.lng }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateShopSettings({
        shop_lat: settings?.shop_lat ?? null, shop_lng: settings?.shop_lng ?? null,
        gas_price_per_km: Number(gasPrice) || 0, avg_speed_kmh: Number(avgSpeed) || 25,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <React.Fragment>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Vị trí tiệm: {settings?.shop_lat != null ? `${Number(settings.shop_lat).toFixed(5)}, ${Number(settings.shop_lng).toFixed(5)}` : 'Chưa thiết lập'}
      </div>
      <Button variant="secondary" size="sm" onClick={handleLocate} disabled={locating} style={{ alignSelf: 'flex-start' }}>
        {locating ? 'Đang lấy vị trí...' : <><IconMapPin size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Lấy vị trí hiện tại làm vị trí tiệm</>}
      </Button>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input label="Giá xăng ước tính (đồng/km)" type="number" value={gasPrice} onChange={(e) => setGasPrice(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <Input label="Tốc độ trung bình (km/h)" type="number" value={avgSpeed} onChange={(e) => setAvgSpeed(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {saved && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-success)' }}>Đã lưu!</div>}
      <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</Button>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
        Dùng để tính khoảng cách, thời gian đi/về và tiền xăng ước tính khi Vận Chuyển giao đơn xong — đứng tại tiệm rồi bấm "Lấy vị trí hiện tại" là chuẩn nhất.
      </div>
    </React.Fragment>
  );
}

const AUDIT_TABLE_LABELS = {
  orders: 'Đơn hàng', products: 'Sản phẩm', customers: 'Khách hàng', profiles: 'Nhân viên',
  cashbook_entries: 'Sổ quỹ', cash_reconciliations: 'Chốt ca',
};
const AUDIT_ACTION_LABELS = { INSERT: 'Thêm', UPDATE: 'Sửa', DELETE: 'Xoá' };
const AUDIT_ACTION_TONE = { INSERT: 'success', UPDATE: 'warning', DELETE: 'danger' };
const AUDIT_SKIP_FIELDS = new Set(['created_at', 'updated_at']);

function diffFields(oldData, newData) {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changes = [];
  keys.forEach((k) => {
    if (AUDIT_SKIP_FIELDS.has(k)) return;
    const a = oldData[k], b = newData[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: k, from: a, to: b });
  });
  return changes;
}

function AuditLogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const changes = log.action === 'UPDATE' ? diffFields(log.old_data, log.new_data) : [];
  const roleMeta = ROLE_META[log.actor_role];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone={AUDIT_ACTION_TONE[log.action] || 'neutral'}>{AUDIT_ACTION_LABELS[log.action] || log.action}</Badge>
          <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>{AUDIT_TABLE_LABELS[log.table_name] || log.table_name}</span>
          <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
            bởi {log.actor_name || 'Không rõ'}{roleMeta ? ` (${roleMeta.label})` : ''}
          </span>
        </div>
        <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
          {new Date(log.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
        </span>
      </div>
      {changes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 }}>
          {changes.map((c) => (
            <div key={c.field} style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
              <b>{c.field}</b>: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}
            </div>
          ))}
        </div>
      )}
      {log.action !== 'UPDATE' && (log.old_data || log.new_data) && (
        <button onClick={() => setExpanded(!expanded)} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', cursor: 'pointer', font: 'var(--text-caption)', color: 'var(--action-primary)', padding: 0 }}>
          {expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
        </button>
      )}
      {expanded && (
        <pre style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: 8, overflowX: 'auto', margin: 0 }}>
          {JSON.stringify(log.new_data || log.old_data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function sevenDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return localDateStr(d);
}

function AuditLogSection() {
  const [from, setFrom] = useState(sevenDaysAgoStr());
  const [to, setTo] = useState(localDateStr());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchAuditLog({ limit: 300, from, to })
      .then((data) => { setLogs(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [from, to]);

  return (
    <React.Fragment>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
        Ai sửa/xoá/thêm gì trên đơn hàng, sản phẩm, khách hàng, nhân viên, sổ quỹ — để tra soát khi có chênh lệch.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Input label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ flex: '1 1 150px' }} />
        <Input label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: '1 1 150px' }} />
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải nhật ký: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : logs.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có hoạt động nào trong khoảng ngày này.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 400, overflowY: 'auto' }}>
          {logs.map((log) => <AuditLogRow key={log.id} log={log} />)}
        </div>
      )}
    </React.Fragment>
  );
}

const INCIDENT_CATEGORY_LABELS = { log: 'Vận chuyển', kit: 'Bếp', inv: 'Kho' };

function IncidentRow({ report, onResolved }) {
  const [busy, setBusy] = useState(false);
  const handleResolve = async () => {
    setBusy(true);
    try { await resolveIncidentReport(report.id); onResolved(); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone="danger">{INCIDENT_CATEGORY_LABELS[report.category] || report.category}</Badge>
          <b style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{report.code}</b>
          <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{report.label}</span>
        </div>
        <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{new Date(report.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
      </div>
      {report.order_code && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đơn: {report.order_code}</div>}
      {report.note && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{report.note}</div>}
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Người báo: {report.reporter_name || 'Không rõ'} {report.reporter_role ? `· ${report.reporter_role}` : ''}</div>
      <div>
        {report.status === 'resolved' ? (
          <Badge tone="success" icon={<IconCheck size={13} />}>Đã xử lý{report.resolved_at ? ` lúc ${new Date(report.resolved_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}</Badge>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleResolve} disabled={busy}>{busy ? 'Đang lưu...' : 'Đánh dấu đã xử lý'}</Button>
        )}
      </div>
    </div>
  );
}

function IncidentsSection() {
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchIncidentReports({ status: status === 'all' ? undefined : status, limit: 200 })
      .then((data) => { setReports(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  return (
    <React.Fragment>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
        Toàn bộ sự cố nhân viên báo qua nút "Báo sự cố" — nhấn "Đánh dấu đã xử lý" khi giải quyết xong.
      </div>
      <Tabs tabs={[{ key: 'open', label: 'Đang mở' }, { key: 'resolved', label: 'Đã xử lý' }, { key: 'all', label: 'Tất cả' }]} active={status} onChange={setStatus} />
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải sự cố: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : reports.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có sự cố nào.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 500, overflowY: 'auto' }}>
          {reports.map((r) => <IncidentRow key={r.id} report={r} onResolved={load} />)}
        </div>
      )}
    </React.Fragment>
  );
}

const ADMIN_TABS = [
  { key: 'location', label: 'Vị trí & chi phí giao hàng' },
  { key: 'incidents', label: 'Báo cáo sự cố' },
  { key: 'audit', label: 'Nhật ký hoạt động' },
  { key: 'backup', label: 'Sao lưu dữ liệu' },
];

function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastBackup, setLastBackup] = useState('');

  const handleBackup = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await backupAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sumi-sao-luu-${localDateStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackup(new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        Xuất toàn bộ đơn hàng, khách hàng, sản phẩm, kho, sự cố và danh sách nhân viên ra 1 file JSON để lưu trữ ngoài (phòng khi cần tra soát hoặc sự cố hệ thống).
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {lastBackup && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Lần sao lưu gần nhất: {lastBackup}</div>}
      <Button variant="primary" size="sm" onClick={handleBackup} disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Đang xuất dữ liệu...' : <><IconDownload size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Tải file sao lưu</>}
      </Button>
    </div>
  );
}

function AdminSection() {
  const [tab, setTab] = useState('location');
  return (
    <Section title="Quản trị (Chủ sở hữu)">
      <Tabs tabs={ADMIN_TABS} active={tab} onChange={setTab} />
      {tab === 'location' && <ShopLocationSection />}
      {tab === 'incidents' && <IncidentsSection />}
      {tab === 'audit' && <AuditLogSection />}
      {tab === 'backup' && <BackupSection />}
    </Section>
  );
}

export default function SettingsScreen({ onSignOut }) {
  const [offlineFirst, setOfflineFirst] = useState(true);
  const [forceCloseShift, setForceCloseShift] = useState(true);
  const [uiScale, setUiScaleState] = useState(getUiScale());

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPwForm, setShowPwForm] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [pushStatus, setPushStatus] = useState('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');

  useEffect(() => { getPushSubscriptionStatus().then(setPushStatus).catch(() => {}); }, []);

  const handleTogglePush = async (checked) => {
    setPushBusy(true);
    setPushError('');
    try {
      if (checked) {
        await enablePush(me?.id);
        setPushStatus('subscribed');
      } else {
        await disablePush();
        setPushStatus('unsubscribed');
      }
    } catch (err) {
      setPushError(err.message);
    } finally {
      setPushBusy(false);
    }
  };

  const load = () => {
    setLoading(true);
    fetchMyProfile()
      .then((myProfile) => { setMe(myProfile); setNameDraft(myProfile.full_name || ''); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const isOwner = me?.role === 'owner' || me?.role === 'admin';

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await updateMyProfile({ full_name: nameDraft });
      load();
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Thiết lập</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Tài khoản, vận hành và phân quyền nhân viên</div>
      </div>

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải tài khoản: {error}</div>}

      <Section title="Tài khoản của bạn">
        {loading ? (
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
        ) : (
          <React.Fragment>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đăng nhập bằng:</span>
              <span style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{me?.email || me?.phone || '—'}</span>
              {me?.role && <Badge tone={ROLE_META[me.role]?.tone || 'neutral'}>{ROLE_META[me.role]?.label || me.role}</Badge>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Input label="Họ và tên" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={handleSaveName} disabled={savingName}>{savingName ? 'Đang lưu...' : 'Lưu tên'}</Button>
            </div>
            {showPwForm ? (
              <ChangePasswordForm onDone={() => setShowPwForm(false)} />
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => setShowPwForm(true)}>Đổi mật khẩu</Button>
                <Button variant="ghost" size="sm" onClick={onSignOut}>Đăng xuất</Button>
              </div>
            )}
          </React.Fragment>
        )}
      </Section>

      <Section title="Quyền của vai trò">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ROLE_PERMISSIONS.map((r) => (
            <div key={r.role} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Badge tone={ROLE_META[r.role]?.tone || 'neutral'} style={{ flexShrink: 0 }}>{ROLE_META[r.role]?.label || r.role}</Badge>
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tùy chọn">
        <Select label={<><IconSettings size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Cỡ giao diện</>} value={uiScale} onChange={(e) => { setUiScale(e.target.value); setUiScaleState(e.target.value); }}
          options={[{ value: 'small', label: 'Nhỏ' }, { value: 'normal', label: 'Vừa (mặc định)' }, { value: 'large', label: 'Lớn' }]} />
        <Switch label="Bật Offline-First (lưu đơn khi mất mạng)" checked={offlineFirst} onChange={setOfflineFirst} />
        <Switch label="Bắt buộc chốt ca cuối ngày (Z-Report)" checked={forceCloseShift} onChange={setForceCloseShift} />
        <Switch label={<><IconBell size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Nhận thông báo đẩy trên thiết bị này (đơn mới, giao hàng xong)</>}
          checked={pushStatus === 'subscribed'} onChange={handleTogglePush}
          disabled={pushBusy || pushStatus === 'unsupported'} />
        {pushStatus === 'unsupported' && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Trình duyệt này không hỗ trợ thông báo đẩy.</div>}
        {pushStatus === 'denied' && <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>Bạn đã chặn thông báo cho trang này — vào cài đặt trình duyệt để bật lại.</div>}
        {pushError && <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{pushError}</div>}
      </Section>

      {isOwner && <AdminSection />}
    </div>
  );
}
