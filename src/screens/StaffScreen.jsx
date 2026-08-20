import React, { useEffect, useState } from 'react';
import { Card } from '../components/data/Card';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Select } from '../components/forms/Select';
import { fetchMyProfile, fetchAllProfiles, updateProfileRole, updateProfileExtraRoles, updateProfileStation, updateProfileActive, approveStaff } from '../lib/queries';
import { ROLE_META, ROLE_OPTIONS, ROLE_PERMISSIONS, hasRole, hasAnyRole } from '../lib/roles';

const STATION_OPTIONS = [
  { value: '', label: 'Chưa gán khâu' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'nong', label: 'Bếp Nóng' },
  { value: 'lanh', label: 'Bếp Lạnh' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
];

function PendingStaffRow({ s, onApprove }) {
  const [role, setRole] = useState(s.role);
  const [busy, setBusy] = useState(false);
  const handleApprove = async () => {
    setBusy(true);
    try { await onApprove(s.id, role); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{s.full_name || '(chưa đặt tên)'}</span>
        <Badge tone="warning">Chờ duyệt</Badge>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} style={{ width: 150 }} />
        <Button variant="primary" size="sm" onClick={handleApprove} disabled={busy}>{busy ? 'Đang duyệt...' : 'Duyệt'}</Button>
      </div>
    </div>
  );
}

function StaffRow({ s, isOwner, isMe, canDeactivate, onChangeRole, onChangeExtraRoles, onChangeStation, onDeactivate, expanded, onToggle }) {
  const perm = ROLE_PERMISSIONS.find((p) => p.role === s.role);
  const extraRoles = s.extra_roles || [];
  const [savingExtra, setSavingExtra] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const toggleExtraRole = async (role) => {
    const next = extraRoles.includes(role) ? extraRoles.filter((r) => r !== role) : [...extraRoles, role];
    setSavingExtra(true);
    try { await onChangeExtraRoles(s.id, next); } finally { setSavingExtra(false); }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    try { await onDeactivate(s.id); } finally { setDeactivating(false); setConfirmingDeactivate(false); }
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{s.full_name || '(chưa đặt tên)'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Badge tone={ROLE_META[s.role]?.tone || 'neutral'}>{ROLE_META[s.role]?.label || s.role}</Badge>
          {extraRoles.map((r) => <Badge key={r} tone="neutral">+{ROLE_META[r]?.label || r}</Badge>)}
          <span style={{ color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {s.created_at && (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Tham gia: {new Date(s.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
            </div>
          )}
          {perm && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{perm.desc}</div>}
          {isOwner && !isMe && (
            <React.Fragment>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đổi vai trò:</span>
                <Select value={s.role} onChange={(e) => onChangeRole(s.id, e.target.value)} options={ROLE_OPTIONS} style={{ width: 160 }} />
                <Select
                  value={s.station || ''}
                  onChange={(e) => onChangeStation(s.id, e.target.value || null)}
                  options={STATION_OPTIONS}
                  style={{ width: 150 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Kiêm nhiệm thêm (tuỳ chọn):</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ROLE_OPTIONS.filter((o) => o.value !== s.role).map((o) => {
                    const checked = extraRoles.includes(o.value);
                    return (
                      <label key={o.value} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 'var(--radius-pill)',
                        border: `1px solid ${checked ? 'var(--action-primary)' : 'var(--border-subtle)'}`,
                        background: checked ? 'var(--surface-primary-soft)' : 'transparent',
                        font: 'var(--text-caption)', color: checked ? 'var(--primary-700)' : 'var(--text-secondary)', cursor: savingExtra ? 'default' : 'pointer',
                      }}>
                        <input type="checkbox" checked={checked} disabled={savingExtra} onChange={() => toggleExtraRole(o.value)} style={{ margin: 0 }} />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </React.Fragment>
          )}
          {canDeactivate && !isMe && s.role !== 'owner' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {confirmingDeactivate ? (
                <>
                  <span style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>Khoá tài khoản này? Nhân viên sẽ không đăng nhập được nữa.</span>
                  <Button variant="danger" size="sm" onClick={handleDeactivate} disabled={deactivating}>{deactivating ? 'Đang khoá...' : 'Xác nhận khoá'}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingDeactivate(false)} disabled={deactivating}>Huỷ</Button>
                </>
              ) : (
                <Button variant="danger" size="sm" onClick={() => setConfirmingDeactivate(true)}>Khoá tài khoản (nghỉ việc)</Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeactivatedStaffRow({ s, canDeactivate, onReactivate }) {
  const [busy, setBusy] = useState(false);
  const handleReactivate = async () => {
    setBusy(true);
    try { await onReactivate(s.id); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>{s.full_name || '(chưa đặt tên)'}</span>
        <Badge tone={ROLE_META[s.role]?.tone || 'neutral'}>{ROLE_META[s.role]?.label || s.role}</Badge>
        <Badge tone="danger">Đã khoá</Badge>
      </div>
      {canDeactivate && (
        <Button variant="secondary" size="sm" onClick={handleReactivate} disabled={busy}>{busy ? 'Đang mở...' : 'Mở lại'}</Button>
      )}
    </div>
  );
}

export default function StaffScreen() {
  const [me, setMe] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchMyProfile(), fetchAllProfiles()])
      .then(([myProfile, all]) => { setMe(myProfile); setStaff(all); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Chỉ Chủ sở hữu mới đổi được vai trò người khác ở database (chặn admin tự nâng quyền) —
  // UI phải khớp đúng, nếu không admin bấm Duyệt/Đổi vai trò sẽ bị âm thầm không lưu được gì.
  const isOwner = hasRole(me, 'owner');
  const canDeactivate = hasAnyRole(me, ['owner', 'admin']);
  const pending = staff.filter((s) => s.approved === false);
  const approved = staff.filter((s) => s.approved !== false && s.active !== false);
  const deactivated = staff.filter((s) => s.approved !== false && s.active === false);

  const handleApprove = async (id, role) => {
    await approveStaff(id, role);
    load();
  };

  const handleDeactivate = async (id) => {
    await updateProfileActive(id, false);
    load();
  };

  const handleReactivate = async (id) => {
    await updateProfileActive(id, true);
    load();
  };

  const handleChangeRole = async (id, role) => {
    await updateProfileRole(id, role);
    load();
  };

  const handleChangeExtraRoles = async (id, extraRoles) => {
    await updateProfileExtraRoles(id, extraRoles);
    load();
  };

  const handleChangeStation = async (id, station) => {
    await updateProfileStation(id, station);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Nhân Viên</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Tài khoản chờ duyệt và danh sách nhân viên toàn tiệm</div>
      </div>

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải nhân viên: {error}</div>}

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <React.Fragment>
          {isOwner && pending.length > 0 && (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Tài khoản chờ duyệt ({pending.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {pending.map((s) => <PendingStaffRow key={s.id} s={s} onApprove={handleApprove} />)}
              </div>
            </Card>
          )}

          <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Danh sách nhân viên</div>
            {approved.length === 0 ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có nhân viên nào.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {approved.map((s) => (
                  <StaffRow key={s.id} s={s} isOwner={isOwner} isMe={s.id === me?.id} canDeactivate={canDeactivate}
                    onChangeRole={handleChangeRole} onChangeExtraRoles={handleChangeExtraRoles} onChangeStation={handleChangeStation} onDeactivate={handleDeactivate}
                    expanded={expandedId === s.id} onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)} />
                ))}
              </div>
            )}
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
              Nhân viên mới tự bấm "Đăng ký ngay" ở màn đăng nhập để tạo tài khoản — tài khoản sẽ ở trạng thái "Chờ duyệt" và không xem được dữ liệu cho tới khi chủ sở hữu duyệt và gán quyền ở đây.
            </div>
          </Card>

          {deactivated.length > 0 && (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đã khoá tài khoản ({deactivated.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {deactivated.map((s) => <DeactivatedStaffRow key={s.id} s={s} canDeactivate={canDeactivate} onReactivate={handleReactivate} />)}
              </div>
            </Card>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
