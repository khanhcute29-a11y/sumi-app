import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { Tabs } from '../components/navigation/Tabs';
import { PhotoField } from '../components/PhotoField';
import {
  fetchShiftConfigs, addShiftConfig, deleteShiftConfig,
  fetchShiftLogs, fetchShiftLogsRange, addShiftCheckin, addLeaveRequest,
} from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { enqueue } from '../lib/offlineQueue';
import { localDateStr } from '../lib/date';
import { IconClipboard, IconCheck, IconClock, IconQuestion } from '../components/icons/FrogIcons';

const LATE_THRESHOLD_MIN = 15;
const BRANCHES = ['Vĩnh Phú 42', 'Quốc lộ 13'];

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
    } catch (err) {
      enqueue('addShiftCheckin', payload);
    } finally {
      setSaving(false);
      onDone();
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
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        {step === 'pick' ? (
          <React.Fragment>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Chấm công</div>
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
            <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (có ảnh càng tốt, không bắt buộc)" prefix="shift" />
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setStep('pick')} disabled={saving}>Quay lại</Button>
              <Button variant="warning" size="sm" disabled={saving || !reason.trim()}
                onClick={() => submit({ lateMinutes: minutesLate(selected.start_time, localDateStr()), needReason: true })}>
                {saving ? 'Đang lưu...' : 'Xác nhận chấm công'}
              </Button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function LeaveModal({ shiftConfigs, staffName, staffId, onClose, onDone }) {
  const [shiftId, setShiftId] = useState(shiftConfigs[0]?.id || '');
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = shiftConfigs.find((s) => s.id === shiftId);

  const submit = async () => {
    if (!reason.trim()) { setError('Nhập lý do xin nghỉ.'); return; }
    setSaving(true);
    setError('');
    const payload = { staffId, staffName, workDate: localDateStr(), shiftLabel: selected?.label || '', branch: selected?.branch || null, reason, photoUrl: photoUrl || null };
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
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Xin nghỉ đột xuất</div>
        <Select label="Ca làm việc" value={shiftId} onChange={(e) => setShiftId(e.target.value)}
          options={shiftConfigs.map((s) => ({ value: s.id, label: shiftOptionLabel(s) }))} />
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

function ShiftConfigManager({ shiftConfigs, onChanged }) {
  const [label, setLabel] = useState('');
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [startTime, setStartTime] = useState('07:00');
  const [wagePerShift, setWagePerShift] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await addShiftConfig({ label, branch, startTime, wagePerShift: Number(wagePerShift) || 0 });
      setLabel(''); setWagePerShift('');
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
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            {s.label}{s.branch ? ` — ${s.branch}` : ''} — {s.start_time.slice(0, 5)}{s.wage_per_shift ? ` — ${Number(s.wage_per_shift).toLocaleString('vi-VN')}đ/ca` : ''}
          </div>
          <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>✕</Button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input label="Tên ca" placeholder="VD: Ca tối" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '2 1 140px' }} />
        <Select label="Chi nhánh" value={branch} onChange={(e) => setBranch(e.target.value)}
          options={BRANCHES.map((b) => ({ value: b, label: b }))} style={{ flex: '2 1 160px' }} />
        <Input label="Giờ bắt đầu" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: '1 1 100px' }} />
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
        ) : log.late_minutes > 0 ? (
          <Badge tone="warning">Trễ {log.late_minutes} phút</Badge>
        ) : (
          <Badge tone="success">Đúng giờ</Badge>
        )}
      </div>
      {log.checkin_time && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chấm công lúc: {new Date(log.checkin_time).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
      )}
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
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  const [date, setDate] = useState(localDateStr());
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCheckin, setShowCheckin] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [payrollRefreshKey, setPayrollRefreshKey] = useState(0);

  const loadConfigs = () => { fetchShiftConfigs().then(setShiftConfigs).catch(() => {}); };
  const loadLogs = () => {
    setLoading(true);
    fetchShiftLogs({ date })
      .then((data) => { setLogs(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadConfigs, []);
  useEffect(loadLogs, [date]);

  const myCheckinToday = logs.find((l) => l.type === 'checkin' && l.staff_id === profile?.id);
  const byBranch = (l) => branchFilter === 'all' || l.branch === branchFilter;
  const checkins = logs.filter((l) => l.type === 'checkin' && byBranch(l));
  const leaves = logs.filter((l) => l.type === 'leave_request' && byBranch(l));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Ca Làm Việc</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chấm công, báo trễ giờ và xin nghỉ đột xuất — lưu offline khi mất mạng, tự đồng bộ khi có lại</div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Input label="Xem ngày" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
        <Button variant="primary" onClick={() => setShowCheckin(true)} disabled={shiftConfigs.length === 0}>
          {myCheckinToday ? <><IconCheck size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />Đã chấm công</> : <><IconClock size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />Chấm công</>}
        </Button>
        <Button variant="warning" onClick={() => setShowLeave(true)} disabled={shiftConfigs.length === 0} icon={<IconQuestion size={16} />}>Xin nghỉ đột xuất</Button>
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
            <div style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Chấm công ({checkins.length})</div>
            {checkins.length === 0 ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có ai chấm công ngày này.</div>
            ) : checkins.map((l) => <LogRow key={l.id} log={l} />)}
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

      {showCheckin && (
        <CheckinModal shiftConfigs={shiftConfigs} staffId={profile?.id} staffName={profile?.full_name}
          onClose={() => setShowCheckin(false)} onDone={() => { setShowCheckin(false); loadLogs(); setPayrollRefreshKey((k) => k + 1); }} />
      )}
      {showLeave && (
        <LeaveModal shiftConfigs={shiftConfigs} staffId={profile?.id} staffName={profile?.full_name}
          onClose={() => setShowLeave(false)} onDone={() => { setShowLeave(false); loadLogs(); setPayrollRefreshKey((k) => k + 1); }} />
      )}
    </div>
  );
}
