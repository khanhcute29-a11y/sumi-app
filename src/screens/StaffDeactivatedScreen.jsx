import React, { useEffect, useState } from 'react';
import { Card } from '../components/data/Card';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { fetchMyProfile, fetchAllProfiles, updateProfileActive } from '../lib/queries';
import { ROLE_META, hasAnyRole } from '../lib/roles';
import { supabase } from '../lib/supabaseClient';

// Nhân sự ĐÃ NGHỈ VIỆC (tài khoản bị khoá) — TÁCH RIÊNG khỏi màn "Nhân Viên"
// chính theo yêu cầu Giám đốc (04/09/2026): trước đây danh sách này hiện
// ngay cuối màn Nhân Viên, gây rối mắt khi tiệm tích luỹ nhiều người đã
// nghỉ theo thời gian. Giờ ẩn hẳn khỏi màn chính, chuyển sang 1 mục riêng
// trên sidebar desktop — không đổi cơ chế Khoá/Mở lại, chỉ đổi CHỖ hiển thị.
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

export default function StaffDeactivatedScreen() {
  const [me, setMe] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [myProfile, all] = await Promise.all([fetchMyProfile(), fetchAllProfiles()]);
      setMe(myProfile);
      setStaff(all);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('staff-deactivated-screen-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const canDeactivate = hasAnyRole(me, ['owner', 'admin']);
  const deactivated = staff.filter((s) => s.approved !== false && s.active === false);

  const handleReactivate = async (id) => {
    await updateProfileActive(id, true);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Nhân Sự Đã Nghỉ Việc</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
          Tài khoản bị khoá — không đăng nhập được nhưng vẫn giữ nguyên toàn bộ lịch sử. Bấm "Mở lại" nếu cần dùng lại.
        </div>
      </div>

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải nhân viên: {error}</div>}

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {deactivated.length === 0 ? (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có ai nghỉ việc.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {deactivated.map((s) => (
                <DeactivatedStaffRow key={s.id} s={s} canDeactivate={canDeactivate} onReactivate={handleReactivate} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
