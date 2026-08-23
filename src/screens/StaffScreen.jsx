import React, { useEffect, useState } from 'react';
import { Card } from '../components/data/Card';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Select } from '../components/forms/Select';
import { fetchMyProfile, fetchAllProfiles, updateProfileRole, updateProfileExtraRoles, updateProfileStation, updateStaffPermissions, updateProfileActive, approveStaff } from '../lib/queries';
import { ROLE_META, ROLE_OPTIONS, ROLE_PERMISSIONS, hasRole, hasAnyRole, resolveRoleAndStation, getRoleMeta, getUiRole } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';

const STATION_OPTIONS = [
  { value: '', label: 'Chưa gán khâu' },
  { value: 'Bếp Lạnh', label: '🎂 Bếp Lạnh (Bánh kem & bánh lạnh)' },
  { value: 'Bếp Nóng', label: '🍞 Bếp Nóng (Bánh mặn/ngọt, BTT)' },
  { value: 'Xưởng 41', label: '🧁 Xưởng 41 (Macaron)' },
  { value: 'Xưởng 42', label: '🏫 Xưởng 42 (Trường học & Teabreak)' },
  { value: 'Vận Tải', label: '🛵 Đội Vận Tải' },
  { value: 'Bán Hàng', label: '🏬 Bán Hàng & Thu Ngân' },
  { value: 'Kho', label: '📦 Kho Nguyên Liệu' },
];

function PendingStaffRow({ s, onApprove }) {
  const [role, setRole] = useState(getUiRole(s.role, s.station));
  const [busy, setBusy] = useState(false);
  const handleApprove = async () => {
    setBusy(true);
    try {
      const { mappedRole, mappedStation } = resolveRoleAndStation(role, s.station);
      await onApprove(s.id, mappedRole);
      if (mappedStation) await updateProfileStation(s.id, mappedStation);
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{s.full_name || '(chưa đặt tên)'}</span>
        <Badge tone="warning">Chờ duyệt</Badge>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} style={{ width: 180 }} />
        <Button variant="primary" size="sm" onClick={handleApprove} disabled={busy}>{busy ? 'Đang duyệt...' : 'Duyệt'}</Button>
      </div>
    </div>
  );
}

function StaffRow({ s, isOwner, isMe, canDeactivate, onSavePermissions, onDeactivate, onManageWork, expanded, onToggle }) {
  const staffMeta = getRoleMeta(s.role, s.station);
  const perm = ROLE_PERMISSIONS.find((p) => p.role === s.role);
  const initialUiRole = getUiRole(s.role, s.station);
  const [role, setRole] = useState(initialUiRole);
  const [station, setStation] = useState(s.station || '');
  const [extraRoles, setExtraRoles] = useState(s.extra_roles || []);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Đồng bộ lại khi prop s thay đổi
  useEffect(() => {
    setRole(getUiRole(s.role, s.station));
    setStation(s.station || '');
    setExtraRoles(s.extra_roles || []);
  }, [s.role, s.station, JSON.stringify(s.extra_roles)]);

  const handleRoleChange = (newRoleKey) => {
    setRole(newRoleKey);
    setSuccessMsg('');
    const { mappedStation } = resolveRoleAndStation(newRoleKey, station);
    if (mappedStation) {
      setStation(mappedStation);
    }
  };

  const toggleExtraRole = (r) => {
    setExtraRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
    setSuccessMsg('');
  };

  const handleClearAllExtra = () => {
    setExtraRoles([]);
    setSuccessMsg('');
  };

  const handleSave = async () => {
    setSaving(true);
    setErrMsg('');
    setSuccessMsg('');
    try {
      // Map an toàn sang DB role và DB station để không vi phạm check constraint
      const { mappedRole, mappedStation } = resolveRoleAndStation(role, station);
      const safeExtraRoles = [...new Set(extraRoles.map(r => resolveRoleAndStation(r, '').mappedRole))].filter(r => r !== mappedRole);

      await onSavePermissions(s.id, {
        role: mappedRole,
        station: mappedStation || null,
        extraRoles: safeExtraRoles
      });
      setSuccessMsg('✅ Đã cập nhật phân quyền thành công!');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (e) {
      setErrMsg(e.message || 'Lỗi khi lưu phân quyền');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      await onDeactivate(s.id);
    } finally {
      setDeactivating(false);
      setConfirmingDeactivate(false);
    }
  };

  const isDirty = role !== initialUiRole || station !== (s.station || '') || JSON.stringify(extraRoles.sort()) !== JSON.stringify((s.extra_roles || []).sort());

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px 0' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        {/* Bấm vào nhân viên để mở ngay mục Quản lý công việc & Giao việc */}
        <button
          onClick={() => onManageWork(s)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200,
            border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', padding: 0
          }}
          title="Bấm để giao việc, theo dõi tiến độ và xem báo cáo"
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-sunken)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
          }}>
            {s.station?.includes('Lạnh') ? '🎂' : s.station?.includes('Nóng') ? '🍞' : s.station?.includes('41') ? '🧁' : s.station?.includes('42') ? '🏫' : s.role === 'kitchen_lead' ? '👨‍🍳' : s.role === 'shipper' ? '🛵' : '👤'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ font: 'var(--text-body)', fontWeight: 700, color: 'var(--text-primary)' }}>
              {s.full_name || '(chưa đặt tên)'}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tone={staffMeta.tone || 'neutral'}>
                {staffMeta.shortLabel ? `[${staffMeta.shortLabel}] ` : ''}{staffMeta.label}
              </Badge>
              {s.station && <Badge tone="neutral">{s.station}</Badge>}
              {(s.extra_roles || []).map((r) => {
                const em = getRoleMeta(r, '');
                return (
                  <Badge key={r} tone="neutral">
                    +{em.shortLabel || em.label || r}
                  </Badge>
                );
              })}
            </div>
          </div>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button variant="primary" size="sm" onClick={() => onManageWork(s)} style={{ fontWeight: 700 }}>
            📋 Xem & Giao việc
          </Button>
          {(isOwner || canDeactivate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              title="Phân quyền và cấu hình tài khoản"
              style={{ color: 'var(--text-secondary)', fontWeight: 600 }}
            >
              ⚙️ {expanded ? 'Đóng' : 'Phân quyền'}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{
          marginTop: 12, padding: '14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
          display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-default)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ font: 'var(--text-label)', fontWeight: 800, color: 'var(--text-primary)' }}>
              ⚙️ Phân quyền cho: {s.full_name}
            </div>
            {s.created_at && (
              <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                Tham gia: {new Date(s.created_at).toLocaleDateString('vi-VN')}
              </span>
            )}
          </div>

          {perm && (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
              {perm.desc}
            </div>
          )}

          {isOwner && !isMe && (
            <React.Fragment>
              {/* Chọn vai trò chính & Khâu làm việc */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                <div>
                  <label style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                    Vai trò chính (Bắt buộc):
                  </label>
                  <Select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    options={ROLE_OPTIONS}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                    Khâu làm việc / Nơi trực thuộc:
                  </label>
                  <Select
                    value={station}
                    onChange={(e) => { setStation(e.target.value); setSuccessMsg(''); }}
                    options={STATION_OPTIONS}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Chọn kiêm nhiệm thêm */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Kiêm nhiệm thêm ({extraRoles.length} vai trò):
                  </span>
                  {extraRoles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllExtra}
                      style={{
                        border: 0, background: 'none', color: 'var(--status-danger)',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0
                      }}
                    >
                      ✖ Bỏ chọn tất cả kiêm nhiệm
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                  {ROLE_OPTIONS.filter((o) => o.value !== role).map((o) => {
                    const checked = extraRoles.includes(o.value);
                    return (
                      <label
                        key={o.value}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                          borderRadius: 'var(--radius-pill)',
                          border: `1px solid ${checked ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                          background: checked ? 'var(--surface-primary-soft)' : 'var(--surface-card)',
                          font: 'var(--text-caption)', fontWeight: checked ? 700 : 500,
                          color: checked ? 'var(--primary-700)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExtraRole(o.value)}
                          style={{ margin: 0 }}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Nút lưu 1 chạm duy nhất */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={saving || !isDirty}
                  onClick={handleSave}
                  style={{
                    minHeight: 44,
                    padding: '0 20px',
                    borderRadius: 12,
                    border: 0,
                    background: isDirty ? 'var(--brand-primary)' : 'var(--border-default)',
                    color: isDirty ? '#fff' : 'var(--text-muted)',
                    fontWeight: 900,
                    fontSize: 15,
                    cursor: isDirty && !saving ? 'pointer' : 'default',
                    boxShadow: isDirty ? '0 3px 0 #b93e13' : 'none'
                  }}
                >
                  {saving ? 'Đang lưu...' : '💾 Lưu & Cập nhật phân quyền'}
                </button>

                {successMsg && (
                  <span style={{ fontSize: 13, color: '#087f5b', fontWeight: 800 }}>
                    {successMsg}
                  </span>
                )}
                {errMsg && (
                  <span style={{ fontSize: 13, color: '#e03131', fontWeight: 800 }}>
                    {errMsg}
                  </span>
                )}
              </div>
            </React.Fragment>
          )}

          {canDeactivate && !isMe && !hasRole(s, 'owner') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
              {confirmingDeactivate ? (
                <>
                  <span style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>Khoá tài khoản này? Nhân viên sẽ không đăng nhập được nữa.</span>
                  <Button variant="danger" size="sm" onClick={handleDeactivate} disabled={deactivating}>{deactivating ? 'Đang khoá...' : 'Xác nhận khoá'}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingDeactivate(false)} disabled={deactivating}>Huỷ</Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDeactivate(true)} style={{ color: 'var(--status-danger)' }}>
                  🚫 Khoá tài khoản (nghỉ việc)
                </Button>
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

  useEffect(() => {
    load();
    const channel = supabase
      .channel('staff-screen-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        Promise.all([fetchMyProfile(), fetchAllProfiles()])
          .then(([myProfile, all]) => { setMe(myProfile); setStaff(all); setError(''); })
          .catch((err) => setError(err.message));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const handleSavePermissions = async (id, { role, station, extraRoles }) => {
    await updateStaffPermissions(id, { role, station, extraRoles });
    load();
  };

  const handleManageWork = (s) => {
    sessionStorage.setItem('sumi_managed_staff_id', s.id);
    window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'tasks' } }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Nhân Viên</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Bấm nhân viên để giao việc, theo dõi tiến độ và báo cáo công việc</div>
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
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Danh sách nhân viên ({approved.length})</div>
            {approved.length === 0 ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có nhân viên nào.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {approved.map((s) => (
                  <StaffRow
                    key={s.id}
                    s={s}
                    isOwner={isOwner}
                    isMe={s.id === me?.id}
                    canDeactivate={canDeactivate}
                    onSavePermissions={handleSavePermissions}
                    onDeactivate={handleDeactivate}
                    onManageWork={handleManageWork}
                    expanded={expandedId === s.id}
                    onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  />
                ))}
              </div>
            )}
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
              Mẹo: Bấm trực tiếp vào nhân viên để xem toàn bộ việc đang làm, giao việc mới hoặc kiểm tra báo cáo của người đó.
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
