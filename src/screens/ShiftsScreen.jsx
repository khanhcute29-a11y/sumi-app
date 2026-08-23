import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { Tabs } from '../components/navigation/Tabs';
import { PhotoField } from '../components/PhotoField';
import { CameraPhotoField } from '../components/CameraPhotoField';
import {
  fetchShiftConfigs, addShiftConfig, updateShiftConfig, deleteShiftConfig,
  fetchShiftLogs, fetchShiftLogsRange, addShiftCheckin, addShiftCheckout, addLeaveRequest,
  createApprovalRequest,
} from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { enqueue } from '../lib/offlineQueue';
import { localDateStr } from '../lib/date';
import { IconClipboard, IconCheck, IconClock, IconQuestion } from '../components/icons/FrogIcons';
import { WeeklyScheduleSection } from '../components/WeeklyScheduleSection';

const LATE_THRESHOLD_MIN = 15;
const BRANCHES = ['Vĩnh Phú 42', 'Quốc lộ 13'];
const SHIFT_PERIODS = [{key:'sáng',label:'☀️ Ca Sáng'},{key:'chiều',label:'🌤️ Ca Chiều'},{key:'tối',label:'🌙 Ca Tối'}];

function shiftOptionLabel(s) {
  return `${s.label}${s.branch ? ` — ${s.branch}` : ''} (${s.start_time.slice(0, 5)})`;
}

function minutesLate(expectedStart, workDate) {
  const [h, m] = expectedStart.split(':').map(Number);
  const expected = new Date(`${workDate}T00:00:00`);
  expected.setHours(h, m, 0, 0);
  const now = new Date();
  return Math.round((now - expected) / 60000);
}
function workDateForShift(shift){const today=localDateStr();if(!shift?.end_time||shift.end_time>shift.start_time)return today;const now=new Date();const [h,m]=shift.end_time.split(':').map(Number);if(now.getHours()*60+now.getMinutes()>=h*60+m)return today;const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-1);return localDateStr(d)}

function CheckinModal({ shiftConfigs, staffName, staffId, onClose, onDone }) {
  const [shiftId, setShiftId] = useState(shiftConfigs[0]?.id || '');
  const [step, setStep] = useState('pick');
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = shiftConfigs.find((s) => s.id === shiftId);

  const submit = async ({ lateMinutes, needReason }) => {
    setSaving(true);
    setError('');
    const payload = {
      staffId, staffName, workDate: localDateStr(), shiftLabel: selected.label, branch: selected.branch || null,
      expectedStart: selected.start_time, lateMinutes: Math.max(0, lateMinutes), wageEarned: selected.wage_per_shift || 0,
      reason: needReason ? reason : null, photoUrl: needReason ? (photoUrl || null) : null,
    };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await addShiftCheckin(payload);
      setSaving(false);
      onDone();
    } catch (err) {
      if (err.message === 'offline' || err instanceof TypeError) {
        enqueue('addShiftCheckin', payload);
        setSaving(false);
        onDone();
      } else if (err.code === '23505') {
        setSaving(false);
        setError('Bạn đã bắt đầu ca hôm nay rồi — không thể chấm 2 lần. Nếu bấm nhầm, dùng nút "Bấm nhầm? Yêu cầu chấm lại" bên dưới.');
      } else {
        setSaving(false);
        setError(err.message || 'Không chấm công được, thử lại sau.');
      }
    }
  };

  const handleContinue = () => {
    if (!selected) { setError('Chọn ca làm việc.'); return; }
    const late = minutesLate(selected.start_time, localDateStr());
    if (late > LATE_THRESHOLD_MIN) {
      setStep('reason');
    } else {
      submit({ lateMinutes: late, needReason: false });
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        {step === 'pick' ? (
          <React.Fragment>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Bắt đầu ca</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Mỗi ca Sáng, Chiều, Tối có giờ bắt đầu và kết thúc riêng.</div>
            <Select label="Ca làm việc" value={shiftId} onChange={(e) => setShiftId(e.target.value)}
              options={shiftConfigs.map((s) => ({ value: s.id, label: shiftOptionLabel(s) }))} />
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={onClose}>Huỷ</Button>
              <Button variant="primary" size="sm" onClick={handleContinue}>Tiếp tục</Button>
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Bạn đang đi trễ — lý do?</div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
              Trễ {minutesLate(selected.start_time, localDateStr())} phút so với giờ bắt đầu {selected.label} ({selected.start_time.slice(0, 5)}).
            </div>
            <Input label="Lý do đi trễ" placeholder="VD: Kẹt xe, xe hỏng, việc gia đình đột xuất..." value={reason} onChange={(e) => setReason(e.target.value)} />
            <CameraPhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (chụp trực tiếp, có ảnh càng tốt)" prefix="shift" />
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setStep('pick')} disabled={saving}>Quay lại</Button>
              <Button variant="warning" size="sm" disabled={saving || !reason.trim()}
                onClick={() => submit({ lateMinutes: minutesLate(selected.start_time, localDateStr()), needReason: true })}>
                {saving ? 'Đang lưu...' : 'Xác nhận bắt đầu ca'}
              </Button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function CheckoutModal({ shiftConfigs, staffName, staffId, onClose, onDone }) {
  const [shiftId, setShiftId] = useState(shiftConfigs[0]?.id || '');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = shiftConfigs.find((s) => s.id === shiftId);

  const submit = async () => {
    if (!selected) { setError('Chọn ca làm việc.'); return; }
    setSaving(true);
    setError('');
    const payload = { staffId, staffName, workDate: workDateForShift(selected), shiftLabel: selected.label, branch: selected.branch || null, photoUrl: photoUrl || null };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await addShiftCheckout(payload);
      setSaving(false);
      onDone();
    } catch (err) {
      if (err.message === 'offline' || err instanceof TypeError) {
        enqueue('addShiftCheckout', payload);
        setSaving(false);
        onDone();
      } else if (err.code === '23505') {
        setSaving(false);
        setError('Bạn đã kết thúc ca hôm nay rồi — không thể chấm 2 lần. Nếu bấm nhầm, dùng nút "Bấm nhầm? Yêu cầu chấm lại" bên dưới.');
      } else {
        setSaving(false);
        setError(err.message || 'Không chấm công được, thử lại sau.');
      }
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Kết thúc ca</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chọn đúng ca đang làm để kết thúc ca đó.</div>
        <Select label="Ca làm việc" value={shiftId} onChange={(e) => setShiftId(e.target.value)}
          options={shiftConfigs.map((s) => ({ value: s.id, label: shiftOptionLabel(s) }))} />
        <CameraPhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (chụp trực tiếp, không bắt buộc)" prefix="shift" />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={saving}>{saving ? 'Đang lưu...' : 'Xác nhận kết thúc ca'}</Button>
        </div>
      </div>
    </div>
  );
}

function RecheckRequestModal({ options, staffId, staffName, staffRole, onClose, onDone }) {
  const [logId, setLogId] = useState(options[0]?.value || '');
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!logId || !reason.trim()) { setError('Chọn mục cần chấm lại và nhập lý do.'); return; }
    setSaving(true);
    setError('');
    try {
      await createApprovalRequest({
        type: 'shift_recheck', shiftLogId: logId, requesterId: staffId, requesterName: staffName, requesterRole: staffRole,
        reason, photoUrl,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Yêu cầu chấm công lại</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Gửi cho sếp duyệt — nếu đồng ý, mục đã chấm sẽ bị mở khoá để bạn chấm lại.</div>
        <Select label="Mục cần chấm lại" value={logId} onChange={(e) => setLogId(e.target.value)} options={options} />
        <Input label="Lý do" placeholder="VD: Bấm nhầm Bắt đầu ca thay vì Kết thúc ca" value={reason} onChange={(e) => setReason(e.target.value)} />
        <CameraPhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (chụp trực tiếp, không bắt buộc)" prefix="shift-recheck" />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi yêu cầu'}</Button>
        </div>
      </div>
    </div>
  );
}

function LeaveModal({ shiftConfigs, staffName, staffId, onClose, onDone }) {
  const [shiftId, setShiftId] = useState(shiftConfigs[0]?.id || '');
  const now = new Date();
  const initialFrom = `${localDateStr(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const initialTo = `${localDateStr(oneHourLater)}T${String(oneHourLater.getHours()).padStart(2, '0')}:${String(oneHourLater.getMinutes()).padStart(2, '0')}`;
  const [reason, setReason] = useState('');
  const [leaveFrom, setLeaveFrom] = useState(initialFrom);
  const [leaveTo, setLeaveTo] = useState(initialTo);
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = shiftConfigs.find((s) => s.id === shiftId);

  const submit = async () => {
    if (!reason.trim()) { setError('Nhập lý do xin nghỉ.'); return; }
    if (!leaveFrom || !leaveTo) { setError('Chọn đầy đủ ngày giờ bắt đầu và kết thúc nghỉ.'); return; }
    if (new Date(leaveTo) < new Date(leaveFrom)) { setError('Thời gian kết thúc phải sau thời gian bắt đầu.'); return; }
    setSaving(true);
    setError('');
    const payload = { staffId, staffName, workDate: leaveFrom.slice(0, 10), shiftLabel: selected?.label || '', branch: selected?.branch || null, reason, photoUrl: photoUrl || null, leaveFromAt: new Date(leaveFrom).toISOString(), leaveToAt: new Date(leaveTo).toISOString() };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await addLeaveRequest(payload);
    } catch (err) {
      enqueue('addLeaveRequest', payload);
    } finally {
      setSaving(false);
      onDone();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Xin nghỉ đột xuất</div>
        <Select label="Ca làm việc" value={shiftId} onChange={(e) => setShiftId(e.target.value)}
          options={shiftConfigs.map((s) => ({ value: s.id, label: shiftOptionLabel(s) }))} />
        <Input label="Nghỉ từ ngày, giờ" type="datetime-local" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
        <Input label="Đến ngày, giờ" type="datetime-local" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
        <Input label="Lý do xin nghỉ" placeholder="VD: Ốm đột xuất, việc gia đình gấp..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (có ảnh càng tốt, không bắt buộc)" prefix="shift" />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="danger" size="sm" onClick={submit} disabled={saving}>{saving ? 'Đang lưu...' : 'Gửi xin nghỉ'}</Button>
        </div>
      </div>
    </div>
  );
}

function ShiftConfigRow({ config, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [endTime, setEndTime] = useState(config.end_time ? config.end_time.slice(0, 5) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateShiftConfig(config.id, { endTime: endTime || null });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        {config.label}{config.branch ? ` — ${config.branch}` : ''} — {config.start_time.slice(0, 5)}
        {config.end_time ? `–${config.end_time.slice(0, 5)}` : ' (chưa có giờ kết thúc)'}
        {config.wage_per_shift ? ` — ${Number(config.wage_per_shift).toLocaleString('vi-VN')}đ/ca` : ''}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <Input label="Giờ kết thúc" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: 110 }} />
          <Button variant="secondary" size="sm" onClick={save} disabled={saving}>Lưu</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>Huỷ</Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Sửa giờ kết thúc</Button>
      )}
    </div>
  );
}

function ShiftConfigManager({ shiftConfigs, onChanged }) {
  const [label, setLabel] = useState('');
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('');
  const [wagePerShift, setWagePerShift] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await addShiftConfig({ label, branch, startTime, endTime, wagePerShift: Number(wagePerShift) || 0 });
      setLabel(''); setEndTime(''); setWagePerShift('');
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await deleteShiftConfig(id);
    onChanged();
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Quản lý ca làm việc (Chủ sở hữu)</div>
      {shiftConfigs.map((s) => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <ShiftConfigRow config={s} onSaved={onChanged} />
            <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>✕</Button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input label="Tên ca" placeholder="VD: Ca tối" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '2 1 140px' }} />
        <Select label="Chi nhánh" value={branch} onChange={(e) => setBranch(e.target.value)}
          options={BRANCHES.map((b) => ({ value: b, label: b }))} style={{ flex: '2 1 160px' }} />
        <Input label="Giờ bắt đầu" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: '1 1 100px' }} />
        <Input label="Giờ kết thúc" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ flex: '1 1 100px' }} />
        <Input label="Lương/ca" type="number" placeholder="VD: 200000" value={wagePerShift} onChange={(e) => setWagePerShift(e.target.value)} style={{ flex: '1 1 120px' }} />
        <Button variant="secondary" size="sm" onClick={add} disabled={saving}>+ Thêm ca</Button>
      </div>
    </div>
  );
}

function PayrollSection({ refreshKey }) {
  const [from, setFrom] = useState(localDateStr());
  const [to, setTo] = useState(localDateStr());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetchShiftLogsRange(from, to).then(setLogs).finally(() => setLoading(false));
  };

  useEffect(load, [from, to, refreshKey]);

  const byStaff = new Map();
  logs.filter((l) => l.type === 'checkin').forEach((l) => {
    const key = l.staff_name || 'Nhân viên';
    const cur = byStaff.get(key) || { shifts: 0, wage: 0 };
    cur.shifts += 1;
    cur.wage += Number(l.wage_earned) || 0;
    byStaff.set(key, cur);
  });
  const rows = [...byStaff.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.wage - a.wage);
  const totalWage = rows.reduce((s, r) => s + r.wage, 0);

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Bảng lương (Chủ sở hữu)</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Input label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ flex: '1 1 150px' }} />
        <Input label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: '1 1 150px' }} />
      </div>
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tính...</div>
      ) : rows.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có ca chấm công trong khoảng ngày này.</div>
      ) : (
        <React.Fragment>
          {rows.map((r) => (
            <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              <span>{r.name} — {r.shifts} ca</span><b style={{ color: 'var(--text-primary)' }}>{r.wage.toLocaleString('vi-VN')}đ</b>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-label)', color: 'var(--text-primary)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
            <span>Tổng lương</span><b>{totalWage.toLocaleString('vi-VN')}đ</b>
          </div>
        </React.Fragment>
      )}
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tính theo số ca đã chấm công × lương/ca thiết lập lúc chấm công (không tính giờ vào/ra thực tế).</div>
    </div>
  );
}

function LogRow({ log }) {
  const isLeave = log.type === 'leave_request';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{log.staff_name || 'Nhân viên'}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{log.shift_label || '—'}{log.branch ? ` — ${log.branch}` : ''}</div>
        </div>
        {isLeave ? (
          <Badge tone="danger">Xin nghỉ</Badge>
        ) : log.type === 'checkout' ? (
          <Badge tone="success">Kết thúc ca</Badge>
        ) : log.late_minutes > 0 ? (
          <Badge tone="warning">Trễ {log.late_minutes} phút</Badge>
        ) : (
          <Badge tone="success">Đúng giờ</Badge>
        )}
      </div>
      {log.checkin_time && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{log.type === 'checkout' ? 'Kết thúc ca lúc' : 'Bắt đầu ca lúc'}: {new Date(log.checkin_time).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
      )}
      {isLeave && log.leave_from_at && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Nghỉ từ: {new Date(log.leave_from_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}{log.leave_to_at ? ` → ${new Date(log.leave_to_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}</div>}
      {log.reason && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={14} /> {log.reason}</div>}
      {log.photo_url && (
        <a href={log.photo_url} target="_blank" rel="noreferrer">
          <img src={log.photo_url} alt="Minh chứng" style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
        </a>
      )}
    </div>
  );
}

export default function ShiftsScreen() {
  const { profile } = useAuth();
  const isOwner = hasAnyRole(profile, ['owner', 'admin']);
  const [date, setDate] = useState(localDateStr());
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCheckin, setShowCheckin] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showRecheck, setShowRecheck] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [payrollRefreshKey, setPayrollRefreshKey] = useState(0);
  const [myTodayLogs, setMyTodayLogs] = useState([]);
  const [viewMode, setViewMode] = useState('checkin');
  const [preferredShift, setPreferredShift] = useState('');

  const loadConfigs = () => { fetchShiftConfigs().then(setShiftConfigs).catch(() => {}); };
  const loadLogs = () => {
    setLoading(true);
    fetchShiftLogs({ date })
      .then((data) => { setLogs(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };
  const loadMyToday = () => {
    const today=localDateStr();const prev=new Date(`${today}T12:00:00`);prev.setDate(prev.getDate()-1);
    fetchShiftLogsRange(localDateStr(prev),today)
      .then((data) => setMyTodayLogs(data.filter((l) => l.staff_id === profile?.id && (l.work_date===today||(l.type==='checkin'&&l.shift_label?.toLowerCase().includes('tối')&&!data.some(x=>x.staff_id===l.staff_id&&x.work_date===l.work_date&&x.shift_label===l.shift_label&&x.type==='checkout'))))))
      .catch(() => {});
  };

  useEffect(loadConfigs, []);
  useEffect(loadLogs, [date]);
  useEffect(loadMyToday, [profile?.id]);
  useEffect(() => {
    const open = (event) => {
      if (event.detail?.action === 'checkin') setShowCheckin(true);
      if (event.detail?.action === 'checkout') setShowCheckout(true);
    };
    window.addEventListener('sumi-open-shift-action', open);
    return () => window.removeEventListener('sumi-open-shift-action', open);
  }, []);

  const refreshAfterAction = () => { loadLogs(); loadMyToday(); setPayrollRefreshKey((k) => k + 1); window.dispatchEvent(new Event('sumi-shift-changed')); };

  const availableCheckinConfigs = shiftConfigs.filter(s=>!myTodayLogs.some(l=>l.type==='checkin'&&l.shift_label===s.label));
  const availableCheckoutConfigs = shiftConfigs.filter(s=>myTodayLogs.some(l=>l.type==='checkin'&&l.shift_label===s.label)&&!myTodayLogs.some(l=>l.type==='checkout'&&l.shift_label===s.label));
  const recheckOptions = myTodayLogs.filter((l) => l.type === 'checkin' || l.type === 'checkout').map((l) => ({
    value: l.id, label: l.type === 'checkin' ? `Bắt đầu ca — đã chấm lúc ${new Date(l.checkin_time).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : `Kết thúc ca — đã chấm lúc ${new Date(l.checkin_time).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
  }));
  const byBranch = (l) => branchFilter === 'all' || l.branch === branchFilter;
  const checkins = logs.filter((l) => l.type === 'checkin' && byBranch(l));
  const checkouts = logs.filter((l) => l.type === 'checkout' && byBranch(l));
  const leaves = logs.filter((l) => l.type === 'leave_request' && byBranch(l));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Ca Làm Việc</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chấm công, báo trễ giờ và xin nghỉ đột xuất — lưu offline khi mất mạng, tự đồng bộ khi có lại</div>
      </div>

      <Tabs tabs={[{ key: 'checkin', label: 'Chấm công' }, { key: 'schedule', label: 'Lịch tuần' }]} active={viewMode} onChange={setViewMode} />

      {viewMode === 'checkin' && (
      <>
      <div className="sumi-shift-period-grid">{SHIFT_PERIODS.map(period=>{const config=shiftConfigs.find(s=>s.label.toLowerCase().includes(period.key));const started=config&&myTodayLogs.some(l=>l.type==='checkin'&&l.shift_label===config.label);const ended=config&&myTodayLogs.some(l=>l.type==='checkout'&&l.shift_label===config.label);return <button key={period.key} disabled={!config||ended} onClick={()=>{setPreferredShift(config?.label||'');started?setShowCheckout(true):setShowCheckin(true)}}><strong>{period.label}</strong><span>{!config?'Chưa thiết lập':ended?'Đã kết thúc':started?'Đang trong ca':'Chưa bắt đầu'}</span><small>{config?`${config.start_time.slice(0,5)} → ${config.end_time?.slice(0,5)||'--:--'}`:'Quản lý thêm giờ ca'}</small></button>})}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Input label="Xem ngày" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
        <Button variant="primary" onClick={() => {setPreferredShift('');setShowCheckin(true)}} disabled={availableCheckinConfigs.length === 0}>
          {availableCheckinConfigs.length===0 ? <><IconCheck size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />Đã bắt đầu đủ ca</> : <><IconClock size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />Bắt đầu ca</>}
        </Button>
        <Button variant="secondary" onClick={() => {setPreferredShift('');setShowCheckout(true)}} disabled={availableCheckoutConfigs.length === 0}>
          <><IconClock size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />{availableCheckoutConfigs.length?'Kết thúc ca':'Chưa có ca cần kết thúc'}</>
        </Button>
        <Button variant="warning" onClick={() => setShowLeave(true)} disabled={shiftConfigs.length === 0} icon={<IconQuestion size={16} />}>Xin nghỉ đột xuất</Button>
        {recheckOptions.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowRecheck(true)}>Bấm nhầm? Yêu cầu chấm lại</Button>
        )}
      </div>

      <Tabs tabs={[{ key: 'all', label: 'Tất cả chi nhánh' }, ...BRANCHES.map((b) => ({ key: b, label: b }))]} active={branchFilter} onChange={setBranchFilter} />

      {shiftConfigs.length === 0 && !isOwner && (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có ca làm việc nào được thiết lập — liên hệ Chủ sở hữu.</div>
      )}

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải dữ liệu: {error}</div>}

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Bắt đầu ca ({checkins.length})</div>
            {checkins.length === 0 ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có ai chấm công ngày này.</div>
            ) : checkins.map((l) => <LogRow key={l.id} log={l} />)}
          </div>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Kết thúc ca ({checkouts.length})</div>
            {checkouts.length === 0 ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có ai kết thúc ca ngày này.</div>
            ) : checkouts.map((l) => <LogRow key={l.id} log={l} />)}
          </div>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Xin nghỉ đột xuất ({leaves.length})</div>
            {leaves.length === 0 ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có ai xin nghỉ ngày này.</div>
            ) : leaves.map((l) => <LogRow key={l.id} log={l} />)}
          </div>
        </div>
      )}

      {isOwner && <ShiftConfigManager shiftConfigs={shiftConfigs} onChanged={loadConfigs} />}
      {isOwner && <PayrollSection refreshKey={payrollRefreshKey} />}
      </>
      )}
      {viewMode === 'schedule' && <WeeklyScheduleSection profile={profile} />}

      {showCheckin && (
        <CheckinModal shiftConfigs={preferredShift?availableCheckinConfigs.filter(s=>s.label===preferredShift):availableCheckinConfigs} staffId={profile?.id} staffName={profile?.full_name}
          onClose={() => setShowCheckin(false)} onDone={() => { setShowCheckin(false); refreshAfterAction(); }} />
      )}
      {showCheckout && (
        <CheckoutModal shiftConfigs={preferredShift?availableCheckoutConfigs.filter(s=>s.label===preferredShift):availableCheckoutConfigs} staffId={profile?.id} staffName={profile?.full_name}
          onClose={() => setShowCheckout(false)} onDone={() => { setShowCheckout(false); refreshAfterAction(); }} />
      )}
      {showRecheck && (
        <RecheckRequestModal options={recheckOptions} staffId={profile?.id} staffName={profile?.full_name} staffRole={profile?.role}
          onClose={() => setShowRecheck(false)} onDone={() => { setShowRecheck(false); refreshAfterAction(); }} />
      )}
      {showLeave && (
        <LeaveModal shiftConfigs={shiftConfigs} staffId={profile?.id} staffName={profile?.full_name}
          onClose={() => setShowLeave(false)} onDone={() => { setShowLeave(false); refreshAfterAction(); }} />
      )}
    </div>
  );
}
