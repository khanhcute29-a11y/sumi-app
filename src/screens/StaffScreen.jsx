import React, { useEffect, useState } from 'react';
import { Card } from '../components/data/Card';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Select } from '../components/forms/Select';
import { fetchMyProfile, fetchAllProfiles, updateProfileRole, updateProfileExtraRoles, updateProfileStation, updateStaffPermissions, updateStaffWorkInfo, updateShiftRule, updateProfileActive, approveStaff, deleteStaffAccount } from '../lib/queries';
import { ROLE_META, ROLE_OPTIONS, ROLE_PERMISSIONS, hasRole, hasAnyRole, resolveRoleAndStation, getRoleMeta, getUiRole, normalizeStationForDb } from '../lib/roles';
import { boPhanCuaHoSo, chuanHoaCa, caCuaBoPhan, TEN_BO_PHAN } from '../lib/chamCong';
import { supabase } from '../lib/supabaseClient';
import ResetPasswordModal from '../components/staff/ResetPasswordModal';
import GioLamRiengPanel from '../components/staff/GioLamRiengPanel';

const STATION_OPTIONS = [
  { value: '', label: 'Chưa gán khâu (Mặc định / Không thuộc bếp)' },
  { value: 'lanh', label: '🎂 Bếp Lạnh (Bánh kem & bánh lạnh)' },
  { value: 'nong', label: '🍞 Bếp Nóng (Bánh mặn/ngọt, BTT)' },
  { value: 'xuong41', label: '🧁 Xưởng 41 (Macaron)' },
  { value: 'xuong42', label: '🏫 Xưởng 42 (Trường học & Teabreak)' },
  { value: 'bakery', label: '🥖 Bakery (Chung)' },
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

// Ca làm việc QUY ĐỊNH của 1 nhân sự — đọc thẳng từ `sumi_quy_dinh_ca` theo
// đúng bộ phận suy ra từ role/station (boPhanCuaHoSo, cùng hàm màn Chấm công
// dùng) — không tự chép số giờ ra đây, sửa quy định ở Chấm công thì chỗ này
// tự cập nhật theo, không lệch nhau.
function CaQuyDinh({ hoSo, danhSachCa }) {
  const bp = boPhanCuaHoSo(hoSo);
  if (!bp) return <span style={{ color: 'var(--text-muted)' }}>Không theo ca cố định</span>;
  const ca = caCuaBoPhan(danhSachCa, bp);
  if (!ca.length) return <span style={{ color: 'var(--text-muted)' }}>Chưa khai báo ca cho {TEN_BO_PHAN[bp] || bp}</span>;
  return (
    <span>
      {ca.map((c) => `${c.icon} ${c.batDau}–${c.ketThuc}`).join(' · ')}
      <small style={{ color: 'var(--text-muted)' }}> (tới sớm {ca[0].phutSom} phút)</small>
    </span>
  );
}

// Sửa giờ QUY ĐỊNH (áp dụng cho CẢ bộ phận, không phải riêng 1 người) — mở từ
// đầu mỗi thẻ phòng ban. Ghi thẳng vào sumi_quy_dinh_ca (RLS chỉ owner/admin,
// migration 202609022200) — Chấm công, làm tròn giờ trễ, Audio Push nhắc trễ
// đều đọc lại bảng này nên sửa xong áp dụng ngay, không cần đụng gì thêm.
function SuaQuyDinhCaPanel({ caRowsBoPhan, onSaved, onClose }) {
  const [dangSuaId, setDangSuaId] = useState(null);
  const [gioBatDau, setGioBatDau] = useState('');
  const [soGioChuan, setSoGioChuan] = useState('');
  const [phutSom, setPhutSom] = useState('');
  const [saving, setSaving] = useState(false);
  const [loi, setLoi] = useState('');

  const batDauSua = (row) => {
    setDangSuaId(row.id);
    setGioBatDau((row.gio_bat_dau || '').slice(0, 5));
    setSoGioChuan(String(row.so_gio_chuan ?? 9));
    setPhutSom(String(row.phut_den_som_toi_thieu ?? 10));
    setLoi('');
  };

  const luu = async () => {
    if (!gioBatDau) { setLoi('Chọn giờ vào ca.'); return; }
    setSaving(true); setLoi('');
    try {
      await updateShiftRule(dangSuaId, {
        gioBatDau, soGioChuan: Number(soGioChuan) || 9, phutDenSomToiThieu: Number(phutSom) || 10,
      });
      setDangSuaId(null);
      await onSaved?.();
    } catch (e) {
      setLoi(e?.message || 'Không lưu được giờ quy định.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 12, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ font: 'var(--text-caption)', fontWeight: 800, color: 'var(--text-primary)' }}>✏️ Sửa giờ quy định (áp dụng cho cả bộ phận)</span>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Đóng</button>
      </div>
      {caRowsBoPhan.map((row) => (
        <div key={row.id} style={{ background: 'var(--surface-card)', borderRadius: 10, padding: 10, marginBottom: 6 }}>
          {dangSuaId === row.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{row.ten_ca}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Giờ vào ca
                  <input type="time" value={gioBatDau} onChange={(e) => setGioBatDau(e.target.value)}
                    style={{ display: 'block', minHeight: 36, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontFamily: 'inherit' }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Số giờ có mặt
                  <input type="number" min={1} max={16} value={soGioChuan} onChange={(e) => setSoGioChuan(e.target.value)}
                    style={{ display: 'block', width: 72, minHeight: 36, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontFamily: 'inherit' }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Tới sớm tối thiểu (phút)
                  <input type="number" min={0} max={60} value={phutSom} onChange={(e) => setPhutSom(e.target.value)}
                    style={{ display: 'block', width: 90, minHeight: 36, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontFamily: 'inherit' }} />
                </label>
              </div>
              {loi && <div style={{ color: 'var(--status-danger)', fontSize: 12 }}>⚠️ {loi}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" disabled={saving} onClick={luu} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--action-primary)', color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                  {saving ? 'Đang lưu…' : 'Lưu'}
                </button>
                <button type="button" disabled={saving} onClick={() => setDangSuaId(null)} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-card)', cursor: 'pointer', fontSize: 12.5 }}>
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5 }}>
                <strong>{row.ten_ca}</strong> — {row.gio_bat_dau?.slice(0, 5)}, {row.so_gio_chuan}h có mặt, tới sớm {row.phut_den_som_toi_thieu} phút
              </span>
              <button type="button" onClick={() => batDauSua(row)} style={{ border: 'none', background: 'none', color: 'var(--action-primary)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Sửa</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StaffRow({ s, isOwner, isMe, canDeactivate, canResetPassword, danhSachCa, onSavePermissions, onDeactivate, onDelete, expanded, onToggle }) {
  const [showResetPassword, setShowResetPassword] = useState(false);
  const staffMeta = getRoleMeta(s.role, s.station);
  const perm = ROLE_PERMISSIONS.find((p) => p.role === s.role);
  const initialUiRole = getUiRole(s.role, s.station);
  const initialStation = normalizeStationForDb(s.station) || '';
  const [role, setRole] = useState(initialUiRole);
  const [station, setStation] = useState(initialStation);
  const [extraRoles, setExtraRoles] = useState(s.extra_roles || []);
  const [responsibilities, setResponsibilities] = useState(s.responsibilities || '');
  const [startDate, setStartDate] = useState(s.start_date || '');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  // Đồng bộ lại khi prop s thay đổi
  useEffect(() => {
    setRole(getUiRole(s.role, s.station));
    setStation(normalizeStationForDb(s.station) || '');
    setExtraRoles(s.extra_roles || []);
    setResponsibilities(s.responsibilities || '');
    setStartDate(s.start_date || '');
  }, [s.role, s.station, JSON.stringify(s.extra_roles), s.responsibilities, s.start_date]);

  const handleRoleChange = (newRoleKey) => {
    setRole(newRoleKey);
    setSuccessMsg('');
    const { mappedStation } = resolveRoleAndStation(newRoleKey, station);
    setStation(mappedStation || '');
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
      // KHÔNG lọc bỏ extra role trùng mappedRole với vai trò chính — nhiều vai
      // trò bếp khác nhau ở UI (vd kitchen_lead_cold, kitchen_lead_hot) cùng
      // map xuống 1 DB role chung (kitchen_lead) chỉ khác station. Trước đây
      // lọc theo mappedRole nên kiêm nhiệm "Bếp Trưởng Bếp Nóng" khi vai trò
      // chính đã là "Bếp Trưởng Bếp Lạnh" bị âm thầm xoá mất (cùng mappedRole
      // 'kitchen_lead' dù khác station) — không cần lọc trùng-với-chính vì
      // danh sách kiêm nhiệm đã tự loại đúng UI role hiện tại rồi (xem
      // `ROLE_OPTIONS.filter((o) => o.value !== role)` bên dưới).
      const safeExtraRoles = [...new Set(extraRoles.map(r => resolveRoleAndStation(r, '').mappedRole))];

      await onSavePermissions(s.id, {
        role: mappedRole,
        station: mappedStation || null,
        extraRoles: safeExtraRoles,
        responsibilities,
        startDate: startDate || null,
      });
      setSuccessMsg('✅ Đã cập nhật thành công!');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (e) {
      setErrMsg(e.message || 'Lỗi khi lưu thông tin');
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

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteErr('');
    try {
      await onDelete(s.id, deleteConfirmText);
    } catch (e) {
      setDeleteErr(e.message || 'Không xoá được tài khoản này.');
      setDeleting(false);
      return;
    }
    setDeleting(false);
    setConfirmingDelete(false);
    setDeleteConfirmText('');
  };

  const isDirty = role !== initialUiRole || station !== (s.station || '')
    || JSON.stringify(extraRoles.sort()) !== JSON.stringify((s.extra_roles || []).sort())
    || responsibilities !== (s.responsibilities || '') || startDate !== (s.start_date || '');

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px 0' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        {/* Bấm vào nhân viên để mở/đóng hồ sơ & phân quyền — Giao việc đã có
            mục riêng ("1. Giao việc" trên Dashboard), không lặp lại ở đây. */}
        <button
          onClick={onToggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200,
            border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', padding: 0
          }}
          title="Bấm để xem/chỉnh hồ sơ & phân quyền"
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
                {staffMeta.label}
              </Badge>
              {s.station && <Badge tone="neutral">{s.station}</Badge>}
              {(s.extra_roles || []).map((r) => {
                const em = getRoleMeta(r, '');
                return (
                  <Badge key={r} tone="neutral">
                    +{em.label || r}
                  </Badge>
                );
              })}
            </div>
          </div>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {canResetPassword && !isMe && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowResetPassword(true)}
              title="Cấp lại mật khẩu cho nhân sự này"
              style={{ color: 'var(--status-warning, #b8692f)', fontWeight: 600 }}
            >
              🔑 Cấp lại MK
            </Button>
          )}
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

      {showResetPassword && (
        <ResetPasswordModal
          staffId={s.id}
          staffName={s.full_name || 'nhân sự này'}
          onClose={() => setShowResetPassword(false)}
        />
      )}

      {/* Tóm tắt hồ sơ — Vị trí / Trách nhiệm / Ngày bắt đầu / Ca quy định.
          Luôn hiện (không cần bấm mở), chỉnh sửa thì bấm "Phân quyền". */}
      <div style={{ marginTop: 8, marginLeft: 50, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div>💼 Vị trí: <strong>{staffMeta.label}</strong>{s.start_date && <> · Từ ngày <strong>{new Date(s.start_date).toLocaleDateString('vi-VN')}</strong></>}</div>
        <div>📝 Trách nhiệm: {s.responsibilities || <span style={{ color: 'var(--text-muted)' }}>Chưa mô tả</span>}</div>
        <div>⏰ Ca quy định: <CaQuyDinh hoSo={s} danhSachCa={danhSachCa} /></div>
      </div>

      {expanded && (
        <div style={{
          marginTop: 12, padding: '14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
          display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-default)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ font: 'var(--text-label)', fontWeight: 800, color: 'var(--text-primary)' }}>
              ⚙️ Hồ sơ & Phân quyền: {s.full_name}
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

          {(isOwner || canDeactivate) && (
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

                <div>
                  <label style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                    Ngày bắt đầu làm việc:
                  </label>
                  <input type="date" value={startDate || ''} onChange={(e) => { setStartDate(e.target.value); setSuccessMsg(''); }}
                    style={{ width: '100%', minHeight: 40, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 10px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Trách nhiệm công việc:
                </label>
                <textarea value={responsibilities} onChange={(e) => { setResponsibilities(e.target.value); setSuccessMsg(''); }}
                  placeholder="VD: Chịu trách nhiệm sản xuất bánh kem, giám sát vệ sinh bếp lạnh…" rows={2}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-default)', padding: 10, fontFamily: 'inherit', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
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
                          border: `1px solid ${checked ? 'var(--action-primary)' : 'var(--border-subtle)'}`,
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
                    background: isDirty ? 'var(--action-primary)' : 'var(--border-default)',
                    color: isDirty ? '#fff' : 'var(--text-muted)',
                    fontWeight: 900,
                    fontSize: 15,
                    cursor: isDirty && !saving ? 'pointer' : 'default',
                    boxShadow: isDirty ? '0 3px 0 #b93e13' : 'none'
                  }}
                >
                  {saving ? 'Đang lưu...' : '💾 Lưu & Cập nhật hồ sơ'}
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

              <GioLamRiengPanel hoSo={s} />
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

          {/* Xoá VĨNH VIỄN — khác hẳn "Khoá tài khoản" ở trên (khoá vẫn giữ
              lịch sử, chỉ chặn đăng nhập). Chỉ Giám đốc/Chủ (canDeactivate)
              mới thấy, không cho xoá chính mình hoặc tài khoản Owner/Admin —
              khớp đúng những gì RPC sumi_xoa_tai_khoan_nhan_su chặn, tránh
              hiện nút bấm vào chắc chắn lỗi. Bắt gõ đúng tên hiển thị để xác
              nhận vì đây là thao tác không thể hoàn tác. */}
          {canDeactivate && !isMe && !hasAnyRole(s, ['owner', 'admin']) && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
              {confirmingDelete ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ font: 'var(--text-caption)', color: 'var(--status-danger)', fontWeight: 800 }}>
                    ⚠️ Xoá VĨNH VIỄN tài khoản này — mất hẳn hồ sơ + đăng nhập, không thể hoàn tác. Gõ đúng tên "{s.full_name}" để xác nhận:
                  </span>
                  <input
                    value={deleteConfirmText}
                    onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteErr(''); }}
                    placeholder={s.full_name}
                    style={{
                      minHeight: 40, padding: '0 10px', borderRadius: 10, width: '100%', maxWidth: 320,
                      border: '1px solid var(--status-danger)', font: 'var(--text-body)', boxSizing: 'border-box',
                    }}
                  />
                  {deleteErr && <span style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{deleteErr}</span>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting || deleteConfirmText.trim() !== (s.full_name || '').trim()}>
                      {deleting ? 'Đang xoá...' : 'Xác nhận xoá vĩnh viễn'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setConfirmingDelete(false); setDeleteConfirmText(''); setDeleteErr(''); }} disabled={deleting}>Huỷ</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)} style={{ color: 'var(--status-danger)' }}>
                  🗑️ Xoá tài khoản (vĩnh viễn)
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Thứ tự phân luồng phòng ban cố định — khớp đúng thứ tự dùng ở Chấm công/Báo
// cáo ngày (Bakery → Xưởng 41 → Xưởng 42 → Vận tải → Khác).
const BO_PHAN_ORDER = ['bep_lanh', 'bep_nong', 'thu_ngan', 'ban_hang', 'xuong41', 'xuong42', 'van_tai', '_khac'];

export default function StaffScreen() {
  const [me, setMe] = useState(null);
  const [staff, setStaff] = useState([]);
  const [danhSachCa, setDanhSachCa] = useState([]); // đã chuẩn hoá (hiển thị)
  const [caRows, setCaRows] = useState([]); // thô — giữ nguyên `id` để sửa
  const [caEditOpenFor, setCaEditOpenFor] = useState(null); // bộ phận đang mở sửa giờ
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  // Phân luồng phòng ban: THU GỌN mặc định (chỉ hiện tên + số người), bấm vào
  // mới xổ ra danh sách — trước đây hiện hết luôn nên cả list dài dằng dặc dù
  // đã nhóm theo bộ phận.
  const [openBoPhan, setOpenBoPhan] = useState(() => new Set());

  const load = () => {
    setLoading(true);
    Promise.all([fetchMyProfile(), fetchAllProfiles()])
      .then(([myProfile, all]) => { setMe(myProfile); setStaff(all); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadCa = () => {
    supabase.from('sumi_quy_dinh_ca').select('*').eq('active', true)
      .then(({ data }) => { setCaRows(data || []); setDanhSachCa(chuanHoaCa(data || [])); })
      .catch(() => { setCaRows([]); setDanhSachCa([]); });
  };

  useEffect(() => {
    load();
    loadCa();
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
  // "Cấp lại mật khẩu" — rộng hơn canDeactivate: cho cả Bếp trưởng/Phó GĐ
  // xưởng, nhưng CHỈ với nhân sự CÙNG station với họ (khớp đúng phạm vi
  // la_quan_ly_cua_ho_so() dùng cho giao việc — không tự chế luật riêng ở
  // đây, chỉ lặp lại cùng điều kiện phía client để ẩn/hiện nút cho gọn; máy
  // chủ vẫn tự kiểm tra lại qua RPC, không tin phía client).
  const canResetPasswordFor = (s) => {
    if (canDeactivate) return true;
    if (!me?.station || !s?.station || me.station !== s.station) return false;
    return ['kitchen_lead', 'deputy_director_x41', 'deputy_director_x42'].includes(me?.role);
  };
  const pending = staff.filter((s) => s.approved === false);
  // Tài khoản đã khoá (nghỉ việc) KHÔNG hiện ở đây nữa — chuyển hẳn sang màn
  // "Nhân sự đã nghỉ việc" riêng (StaffDeactivatedScreen, mục riêng trên
  // sidebar desktop) theo yêu cầu Giám đốc 04/09/2026: màn Nhân Viên chính
  // chỉ hiện người đang làm, đỡ rối mắt khi tiệm có nhiều người đã nghỉ.
  const approved = staff.filter((s) => s.approved !== false && s.active !== false);

  // Phân luồng theo phòng ban — dùng đúng boPhanCuaHoSo() của Chấm công, để
  // luồng ở đây khớp với luồng toàn hệ thống (Báo cáo ngày, Chấm công...).
  const approvedByBoPhan = {};
  approved.forEach((s) => {
    const bp = boPhanCuaHoSo(s) || '_khac';
    (approvedByBoPhan[bp] ||= []).push(s);
  });

  const handleApprove = async (id, role) => {
    await approveStaff(id, role);
    load();
  };

  const handleDeactivate = async (id) => {
    await updateProfileActive(id, false);
    load();
  };

  const handleDeleteAccount = async (id, confirmFullName) => {
    await deleteStaffAccount(id, confirmFullName);
    load();
  };

  const handleSavePermissions = async (id, { role, station, extraRoles, responsibilities, startDate }) => {
    await updateStaffPermissions(id, { role, station, extraRoles });
    await updateStaffWorkInfo(id, { responsibilities, startDate });
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Nhân Viên</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Bấm nhân viên để xem/chỉnh hồ sơ, trách nhiệm và phân quyền</div>
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

          {BO_PHAN_ORDER.filter((bp) => approvedByBoPhan[bp]?.length).map((bp) => {
            const isOpen = openBoPhan.has(bp);
            return (
              <Card key={bp} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpenBoPhan((prev) => {
                    const next = new Set(prev);
                    if (next.has(bp)) next.delete(bp); else next.add(bp);
                    return next;
                  })}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  <span style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>
                    {bp === '_khac' ? 'Khác (không theo ca cố định)' : TEN_BO_PHAN[bp] || bp} ({approvedByBoPhan[bp].length})
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>{isOpen ? '▾ Thu gọn' : '▸ Xem danh sách'}</span>
                </button>

                {canDeactivate && bp !== '_khac' && (
                  <div>
                    {caEditOpenFor !== bp ? (
                      <button type="button" onClick={() => setCaEditOpenFor(bp)}
                        style={{ border: 'none', background: 'none', color: 'var(--action-primary)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
                        ✏️ Sửa giờ quy định
                      </button>
                    ) : (
                      <SuaQuyDinhCaPanel
                        caRowsBoPhan={caRows.filter((r) => r.bo_phan === bp)}
                        onSaved={loadCa}
                        onClose={() => setCaEditOpenFor(null)}
                      />
                    )}
                  </div>
                )}

                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {approvedByBoPhan[bp].map((s) => (
                      <StaffRow
                        key={s.id}
                        s={s}
                        isOwner={isOwner}
                        isMe={s.id === me?.id}
                        canDeactivate={canDeactivate}
                        canResetPassword={canResetPasswordFor(s)}
                        danhSachCa={danhSachCa}
                        onSavePermissions={handleSavePermissions}
                        onDeactivate={handleDeactivate}
                        onDelete={handleDeleteAccount}
                        expanded={expandedId === s.id}
                        onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
          {approved.length === 0 && (
            <Card><div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có nhân viên nào.</div></Card>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
