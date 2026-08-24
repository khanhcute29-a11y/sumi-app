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

const BRANCHES = ['Vĩnh Phú 42', 'Quốc lộ 13'];
const SHIFT_PRESETS = [
  '🎂 Bếp Bánh Lạnh',
  '🍞 Bếp Bánh Nóng',
  '🧁 Xưởng Macaron (X41)',
  '🏫 Xưởng 42 (Trường học)',
];
const SHIFT_PRESETS_EXTENDED = [
  '☕ Teabreak',
  '🏬 Bán Hàng',
  '🛵 Giao Hàng',
  '⚡ Ca Tăng Ca',
  '☀️ Ca Sáng',
  '🌤️ Ca Chiều',
  '🌙 Ca Tối'
];

function calculateNetWorkHours(inTimeStr, outTimeStr) {
  if (!inTimeStr || !outTimeStr) return null;
  const inDate = new Date(inTimeStr);
  const outDate = new Date(outTimeStr);
  const grossHours = (outDate - inDate) / (1000 * 60 * 60);
  if (grossHours <= 0) return 0;

  const lunchStart = new Date(inDate);
  lunchStart.setHours(11, 30, 0, 0);
  const lunchEnd = new Date(inDate);
  lunchEnd.setHours(12, 30, 0, 0);

  const overlapStart = Math.max(inDate.getTime(), lunchStart.getTime());
  const overlapEnd = Math.min(outDate.getTime(), lunchEnd.getTime());
  const lunchDeduction = overlapEnd > overlapStart ? (overlapEnd - overlapStart) / (1000 * 60 * 60) : 0;

  const netHours = Math.max(0, grossHours - lunchDeduction);
  return {
    grossHours: Math.round(grossHours * 10) / 10,
    lunchDeduction: Math.round(lunchDeduction * 10) / 10,
    netHours: Math.round(netHours * 10) / 10
  };
}

function CheckinModal({ staffName, staffId, defaultBranch, onClose, onDone }) {
  const now = new Date();
  const [workDate, setWorkDate] = useState(localDateStr(now));
  const [checkinTime, setCheckinTime] = useState(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  const [shiftLabel, setShiftLabel] = useState(SHIFT_PRESETS[0]);
  const [branch, setBranch] = useState(defaultBranch || BRANCHES[0]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [useGps, setUseGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Get GPS location
  const captureGps = async () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ GPS');
      return;
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setGpsCoords(`${latitude},${longitude}`);
        },
        (err) => setError(`GPS lỗi: ${err.message}`)
      );
    } catch (e) {
      setError('Không thể lấy GPS');
    }
  };

  const submit = async () => {
    if (!shiftLabel.trim()) { setError('Vui lòng chọn hoặc nhập tên ca làm việc.'); return; }
    if (!photoUrl) { setError('Vui lòng chụp ảnh để xác nhận.'); return; }
    setSaving(true);
    setError('');

    const payload = {
      staffId, staffName, workDate, shiftLabel: shiftLabel.trim(), branch: branch || null,
      expectedStart: `${checkinTime}:00`, lateMinutes: 0, wageEarned: 0,
      reason: null, photoUrl: photoUrl || null,
      gpsCoords: gpsCoords || null,
    };

    try {
      if (!navigator.onLine) throw new Error('offline');
      await addShiftCheckin(payload);
      onDone();
    } catch (err) {
      if (err.message === 'offline' || err instanceof TypeError) {
        enqueue('addShiftCheckin', payload);
        onDone();
      } else {
        setError(err.message || 'Không thể lưu chấm công.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 380, maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: 14 }}>
          <div style={{ font: 'var(--text-display-sm)', color: 'var(--text-primary)', marginBottom: 4 }}>{staffName}</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Bắt đầu ca làm việc</div>
        </div>

        {/* Time & Shift */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ngày</label>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--surface-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Giờ bắt đầu</label>
            <input
              type="time"
              value={checkinTime}
              onChange={(e) => setCheckinTime(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--surface-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Shift Selection - Main Shifts Only */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Chọn ca làm việc</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            {SHIFT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setShiftLabel(p)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border-default)',
                  background: shiftLabel === p ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                  color: shiftLabel === p ? '#fff' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center',
                  minHeight: 36
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Extended Shifts - Optional */}
          {!SHIFT_PRESETS.some(p => p === shiftLabel) && (
            <Select
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              options={[
                { value: '', label: 'Chọn ca khác...' },
                ...SHIFT_PRESETS_EXTENDED.map(s => ({ value: s, label: s }))
              ]}
              style={{ fontSize: 13, marginBottom: 8 }}
            />
          )}

          <Select value={branch} onChange={(e) => setBranch(e.target.value)} options={BRANCHES.map(b => ({ value: b, label: b }))} style={{ fontSize: 13 }} />
        </div>

        {/* Photo Capture - Required */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>📷 Chụp ảnh xác nhận (Camera xoay mặt) *</label>
          <CameraPhotoField url={photoUrl} onChange={setPhotoUrl} label="" prefix="shift" facingMode="user" />
        </div>

        {/* GPS Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, background: 'var(--surface-sunken)', cursor: 'pointer' }} onClick={() => setUseGps(!useGps)}>
          <input type="checkbox" checked={useGps} readOnly style={{ cursor: 'pointer', width: 18, height: 18 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📍 Bật vị trí GPS</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ghi lại tọa độ khi vào ca</div>
          </div>
        </div>

        {useGps && (
          <button
            onClick={captureGps}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border-default)',
              background: gpsCoords ? '#e6f6ed' : 'var(--surface-sunken)',
              color: gpsCoords ? '#09663d' : 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {gpsCoords ? `✓ GPS Đã lấy: ${gpsCoords}` : '▶ Lấy vị trí hiện tại'}
          </button>
        )}

        {/* Error */}
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', padding: 10, borderRadius: 8, background: '#ffebee' }}>{error}</div>}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving} style={{ flex: 1 }}>Huỷ</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={saving || !shiftLabel.trim() || !photoUrl}
            style={{ flex: 1, opacity: !photoUrl || !shiftLabel.trim() ? 0.5 : 1 }}
          >
            {saving ? 'Đang lưu...' : '✓ Bắt đầu ca'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckoutModal({ staffName, staffId, activeCheckins, defaultBranch, onClose, onDone }) {
  const now = new Date();
  const [selectedCheckinId, setSelectedCheckinId] = useState(activeCheckins[0]?.id || '');
  const [workDate, setWorkDate] = useState(localDateStr(now));
  const [checkoutTime, setCheckoutTime] = useState(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  const [photoUrl, setPhotoUrl] = useState('');
  const [useGps, setUseGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedCheckin = activeCheckins.find(c => c.id === selectedCheckinId) || activeCheckins[0];
  const currentShiftLabel = selectedCheckin?.shift_label || 'Ca làm việc';
  const inTimeStr = selectedCheckin?.checkin_time;
  const outTimeStr = `${workDate}T${checkoutTime}:00`;
  const timeCalc = inTimeStr ? calculateNetWorkHours(inTimeStr, outTimeStr) : null;

  // Get GPS location
  const captureGps = async () => {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ GPS');
      return;
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setGpsCoords(`${latitude},${longitude}`);
        },
        (err) => setError(`GPS lỗi: ${err.message}`)
      );
    } catch (e) {
      setError('Không thể lấy GPS');
    }
  };

  const submit = async () => {
    if (!photoUrl) {
      setError('Vui lòng chụp ảnh để xác nhận');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      staffId, staffName, workDate: selectedCheckin?.work_date || workDate,
      shiftLabel: currentShiftLabel,
      branch: selectedCheckin?.branch || defaultBranch || null,
      photoUrl: photoUrl || null,
      gpsCoords: gpsCoords || null
    };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await addShiftCheckout(payload);
      onDone();
    } catch (err) {
      if (err.message === 'offline' || err instanceof TypeError) {
        enqueue('addShiftCheckout', payload);
        onDone();
      } else {
        setError(err.message || 'Không thể lưu kết thúc ca.');
      }
    } finally {
      setSaving(false);
    }
  };

  const inTime = inTimeStr ? new Date(inTimeStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '--:--';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 380, maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={(e) => e.stopPropagation()}>
        {/* Header - Staff Info */}
        <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: 14 }}>
          <div style={{ font: 'var(--text-display-sm)', color: 'var(--text-primary)', marginBottom: 4 }}>{staffName}</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{currentShiftLabel}</div>
        </div>

        {/* Time Card */}
        <div style={{ padding: 16, borderRadius: 14, background: 'var(--surface-sunken)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ textAlign: 'center', paddingRight: 14, borderRight: '1px dashed var(--border-default)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Giờ vào</div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{inTime}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Giờ ra</div>
            <input
              type="time"
              value={checkoutTime}
              onChange={(e) => setCheckoutTime(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 16, fontWeight: 900, textAlign: 'center', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--surface-card)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Net Work Hours */}
        {timeCalc && (
          <div style={{ padding: 12, borderRadius: 12, background: '#e6f6ed', border: '1px solid #138a53', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#09663d', fontWeight: 700 }}>Giờ làm thực tế:</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#138a53' }}>{timeCalc.netHours} giờ</span>
          </div>
        )}

        {/* Photo Capture - Required (Front camera/Selfie) */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>📷 Chụp ảnh xác nhận (Camera xoay mặt) *</label>
          <CameraPhotoField url={photoUrl} onChange={setPhotoUrl} label="" prefix="shift" facingMode="user" />
        </div>

        {/* GPS Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, background: 'var(--surface-sunken)', cursor: 'pointer' }} onClick={() => setUseGps(!useGps)}>
          <input type="checkbox" checked={useGps} readOnly style={{ cursor: 'pointer', width: 18, height: 18 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📍 Bật vị trí GPS</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ghi lại tọa độ khi kết thúc ca</div>
          </div>
        </div>

        {useGps && (
          <button
            onClick={captureGps}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border-default)',
              background: gpsCoords ? '#e6f6ed' : 'var(--surface-sunken)',
              color: gpsCoords ? '#09663d' : 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {gpsCoords ? `✓ GPS Đã lấy: ${gpsCoords}` : '▶ Lấy vị trí hiện tại'}
          </button>
        )}

        {/* Error */}
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', padding: 10, borderRadius: 8, background: '#ffebee' }}>{error}</div>}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving} style={{ flex: 1 }}>Huỷ</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={saving || !photoUrl}
            style={{ flex: 1, opacity: !photoUrl ? 0.5 : 1 }}
          >
            {saving ? 'Đang lưu...' : '✓ Kết thúc ca'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddManualShiftModal({ staffName, staffId, defaultBranch, onClose, onDone }) {
  const now = new Date();
  const [workDate, setWorkDate] = useState(localDateStr(now));
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('16:30');
  const [shiftLabel, setShiftLabel] = useState(SHIFT_PRESETS[0]);
  const [branch, setBranch] = useState(defaultBranch || BRANCHES[0]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inTimeStr = `${workDate}T${startTime}:00`;
  const outTimeStr = `${workDate}T${endTime}:00`;
  const timeCalc = calculateNetWorkHours(inTimeStr, outTimeStr);

  const submit = async () => {
    if (!shiftLabel.trim()) { setError('Vui lòng chọn hoặc nhập tên ca làm việc.'); return; }
    if (startTime >= endTime) { setError('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    setSaving(true);
    setError('');
    try {
      await addShiftCheckin({ staffId, staffName, workDate, shiftLabel: shiftLabel.trim(), branch, expectedStart: `${startTime}:00`, lateMinutes: 0, wageEarned: 0, reason: reason.trim() || 'Bổ sung ca làm' });
      await addShiftCheckout({ staffId, staffName, workDate, shiftLabel: shiftLabel.trim(), branch, photoUrl: null });
      onDone();
    } catch (err) {
      setError(err.message || 'Không thể lưu ca bổ sung.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={(e) => e.stopPropagation()}>
        <div><div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>＋ Thêm ca / Bổ sung giờ làm</div></div>
        <Input label="Ngày làm việc" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input label="Giờ bắt đầu" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: '1 1 120px' }} />
          <Input label="Giờ kết thúc" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ flex: '1 1 120px' }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Chọn ca / Bộ phận</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {SHIFT_PRESETS.map((p) => (<button key={p} type="button" onClick={() => setShiftLabel(p)} style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: shiftLabel === p ? 'var(--brand-primary)' : 'var(--surface-sunken)', color: shiftLabel === p ? '#fff' : 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{p}</button>))}
          </div>
          <Input placeholder="Hoặc tự gõ tên ca..." value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} />
        </div>
        <Select label="Chi nhánh" value={branch} onChange={(e) => setBranch(e.target.value)} options={BRANCHES.map(b => ({ value: b, label: b }))} />
        {timeCalc && (<div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-sunken)', fontSize: 13 }}><span>Thời lượng: <b>{timeCalc.grossHours}h</b></span>{timeCalc.lunchDeduction > 0 && <span style={{ color: '#b93e13' }}> (Đã trừ {timeCalc.lunchDeduction}h ăn trưa 11:30–12:30)</span>}<span style={{ display: 'block', marginTop: 4, fontWeight: 800, color: 'var(--brand-primary)' }}>→ Giờ làm thực tế: {timeCalc.netHours} giờ</span></div>)}
        <Input label="Lý do bổ sung" placeholder="VD: Bổ sung ca làm phụ bánh ngày 23/8..." value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button><Button variant="primary" size="sm" onClick={submit} disabled={saving || !shiftLabel.trim()}>{saving ? 'Đang lưu...' : '✓ Lưu ca làm'}</Button></div>
      </div>
    </div>
  );
}

function LeaveModal({ staffName, staffId, staffRole, defaultBranch, onClose, onDone }) {
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

  const submit = async () => {
    if (!reason.trim()) { setError('Nhập lý do xin nghỉ.'); return; }
    if (!leaveFrom || !leaveTo) { setError('Chọn đầy đủ ngày giờ bắt đầu và kết thúc nghỉ.'); return; }
    if (new Date(leaveTo) < new Date(leaveFrom)) { setError('Thời gian kết thúc phải sau thời gian bắt đầu.'); return; }
    setSaving(true);
    setError('');
    const payload = { staffId, staffName, workDate: leaveFrom.slice(0, 10), shiftLabel: 'Xin nghỉ đột xuất', branch: defaultBranch || null, reason, photoUrl: photoUrl || null, leaveFromAt: new Date(leaveFrom).toISOString(), leaveToAt: new Date(leaveTo).toISOString() };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await addLeaveRequest(payload);
      await createApprovalRequest({
        type: 'leave_request', leaveDate: payload.workDate, reason: `Nghỉ đột xuất: ${reason} (${leaveFrom.replace('T', ' ')} → ${leaveTo.replace('T', ' ')})`,
        photoUrl: photoUrl || null, requesterId: staffId, requesterName: staffName, requesterRole: staffRole,
      }).catch(() => {}); // Không để lỗi ghi yêu cầu duyệt chặn việc đã lưu đơn xin nghỉ
    } catch (err) { enqueue('addLeaveRequest', payload); } finally { setSaving(false); onDone(); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 400, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Xin nghỉ đột xuất</div>
        <Input label="Nghỉ từ ngày, giờ" type="datetime-local" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
        <Input label="Đến ngày, giờ" type="datetime-local" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
        <Input label="Lý do xin nghỉ" placeholder="VD: Ốm đột xuất, việc gia đình gấp..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (có ảnh càng tốt)" prefix="shift" />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button><Button variant="danger" size="sm" onClick={submit} disabled={saving}>{saving ? 'Đang lưu...' : 'Gửi xin nghỉ'}</Button></div>
      </div>
    </div>
  );
}

function ShiftCardRow({ checkin, checkout }) {
  const inTime = checkin?.checkin_time ? new Date(checkin.checkin_time) : null;
  const outTime = checkout?.checkin_time ? new Date(checkout.checkin_time) : null;
  const timeCalc = inTime && outTime ? calculateNetWorkHours(checkin.checkin_time, checkout.checkin_time) : null;
  return (
    <div style={{ padding: 14, borderRadius: 16, background: '#fff', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div><b style={{ fontSize: 16, color: 'var(--text-primary)' }}>{checkin?.staff_name || 'Nhân viên'}</b><div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 700 }}>{checkin?.shift_label || 'Ca làm việc'}{checkin?.branch ? ` · ${checkin.branch}` : ''}</div></div>
        <Badge tone={outTime ? 'success' : inTime ? 'warning' : 'neutral'}>{outTime ? '✓ Đã kết thúc' : inTime ? '● Đang trong ca' : 'Chưa bắt đầu'}</Badge>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--surface-sunken)', borderRadius: 10 }}>
        <div><span>Giờ bắt đầu: </span><b style={{ color: 'var(--brand-primary)', fontSize: 14 }}>{inTime ? inTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '--:--'}</b></div>
        <div><span>Giờ kết thúc: </span><b>{outTime ? outTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : 'Đang làm'}</b></div>
        {timeCalc && (<div><span>Thời gian thực tế: </span><b style={{ color: '#087f5b', fontSize: 14 }}>{timeCalc.netHours} giờ</b>{timeCalc.lunchDeduction > 0 && <small style={{ color: '#b93e13' }}> (Đã trừ {timeCalc.lunchDeduction}h ăn trưa)</small>}</div>)}
      </div>
      {checkin?.reason && (<div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={13} /> {checkin.reason}</div>)}
      {checkout?.photo_url && (<a href={checkout.photo_url} target="_blank" rel="noreferrer" style={{ marginTop: 4 }}><img src={checkout.photo_url} alt="Minh chứng" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} /></a>)}
    </div>
  );
}

export default function ShiftsScreen() {
  const { profile } = useAuth();
  const [date, setDate] = useState(localDateStr());
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCheckin, setShowCheckin] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showAddManual, setShowAddManual] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [viewMode, setViewMode] = useState('checkin');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  const loadLogs = () => { setLoading(true); fetchShiftLogs({ date }).then((data) => { setLogs(data || []); setError(''); }).catch((err) => setError(err.message)).finally(() => setLoading(false)); };
  useEffect(loadLogs, [date]);
  useEffect(() => {
    const handleAction = (e) => {
      if (e.detail?.action === 'checkin') setShowCheckin(true);
      if (e.detail?.action === 'checkout') setShowCheckout(true);
      if (e.detail?.action === 'add') setShowAddManual(true);
    };
    window.addEventListener('sumi-open-shift-action', handleAction);
    return () => window.removeEventListener('sumi-open-shift-action', handleAction);
  }, []);
  const refreshAfterAction = () => { loadLogs(); window.dispatchEvent(new Event('sumi-shift-changed')); };

  const byBranch = (l) => branchFilter === 'all' || l.branch === branchFilter;
  const filteredLogs = logs.filter(byBranch);
  const checkins = filteredLogs.filter(l => l.type === 'checkin');
  const checkouts = filteredLogs.filter(l => l.type === 'checkout');
  const leaves = filteredLogs.filter(l => l.type === 'leave_request');
  const myTodayLogs = logs.filter(l => l.staff_id === profile?.id);
  const myCheckins = myTodayLogs.filter(l => l.type === 'checkin');
  const myCheckouts = myTodayLogs.filter(l => l.type === 'checkout');
  const activeCheckins = myCheckins.slice(myCheckouts.length);
  const shiftPairs = checkins.map((ci, index) => {
    const co = checkouts.find(co => co.staff_id === ci.staff_id && new Date(co.checkin_time) >= new Date(ci.checkin_time));
    return { id: ci.id || index, checkin: ci, checkout: co };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Chấm Công & Ca Làm Việc</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', marginTop: 2 }}>Chấm công linh hoạt theo realtime, tự động theo dõi KPI giờ bắt đầu theo bộ phận</div>
        </div>
        <div style={{ padding: '8px 16px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--border-default)', textAlign: 'right', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums' }}>{currentTime.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderRadius: 14, background: '#fff0d4', border: '1px solid #d7c3aa', display: 'flex', alignItems: 'center', gap: 10, color: '#2d1c10' }}>
        <span style={{ fontSize: 24 }}>🍱</span>
        <div>
          <strong style={{ fontSize: 15, display: 'block', color: '#a94a21' }}>Khung giờ nghỉ trưa cố định: 11:30 – 12:30</strong>
          <span style={{ fontSize: 13, color: '#725f50' }}>Mặc định toàn tiệm để mọi người sắp xếp nghỉ ngơi (Hệ thống tự động trừ 1 giờ vào tổng giờ làm việc thực tế).</span>
        </div>
      </div>
      <Tabs tabs={[{ key: 'checkin', label: 'Chấm công realtime' }, { key: 'schedule', label: 'Lịch tuần' }]} active={viewMode} onChange={setViewMode} />

      {viewMode === 'checkin' && (
        <React.Fragment>
          {/* Bảng Nút Thao Tác Chấm Công */}
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
            padding: 14, borderRadius: 18, background: 'var(--surface-card)', border: '1px solid var(--border-default)'
          }}>
            <Button
              variant="primary"
              onClick={() => setShowCheckin(true)}
              style={{ minHeight: 46, fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ▶ Bắt đầu ca (Chấm vào)
            </Button>

            <Button
              variant="secondary"
              onClick={() => setShowCheckout(true)}
              disabled={activeCheckins.length === 0}
              style={{ minHeight: 46, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ⏹ Kết thúc ca (Chấm ra)
              {activeCheckins.length > 0 && <span style={{ background: 'var(--brand-primary)', color: '#fff', padding: '2px 7px', borderRadius: 999, fontSize: 12 }}>{activeCheckins.length}</span>}
            </Button>

            <Button
              variant="secondary"
              onClick={() => setShowAddManual(true)}
              style={{ minHeight: 46, fontSize: 14, fontWeight: 700 }}
            >
              ＋ Thêm ca / Bổ sung
            </Button>

            <Button
              variant="warning"
              onClick={() => setShowLeave(true)}
              style={{ minHeight: 46, fontSize: 14, fontWeight: 700 }}
            >
              📝 Xin nghỉ đột xuất
            </Button>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Xem ngày:</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />
            </div>
          </div>

          <Tabs tabs={[{ key: 'all', label: 'Tất cả chi nhánh' }, ...BRANCHES.map((b) => ({ key: b, label: b }))]} active={branchFilter} onChange={setBranchFilter} />

          {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải dữ liệu: {error}</div>}

          {/* Danh sách ca làm việc theo ngày */}
          {loading ? (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>Đang tải danh sách chấm công...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* CA LÀM VIỆC CỦA TÔI - PROMINENT */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>👤 CA LÀM VIỆC CỦA TÔI ({myCheckins.length})</span>
                  {activeCheckins.length > 0 && <span style={{ background: '#E53935', color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>ĐANG LÀM</span>}
                </div>
                {myCheckins.length === 0 ? (
                  <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface-sunken)', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Chưa chấm công trong ngày {date}.
                  </div>
                ) : (
                  myCheckins.map((checkin, idx) => {
                    const checkout = myCheckouts.find(co => new Date(co.checkin_time) >= new Date(checkin.checkin_time));
                    const isActive = !checkout;
                    return (
                      <div
                        key={checkin.id}
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          background: isActive ? '#e6f6ed' : 'var(--surface-card)',
                          border: isActive ? '2px solid #138a53' : '1px solid var(--border-default)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          position: 'relative'
                        }}
                      >
                        {isActive && <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 12, fontWeight: 700, color: '#09663d', background: '#fff', padding: '4px 8px', borderRadius: 6 }}>🔴 ĐANG LÀM</div>}
                        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>
                          {checkin.shift_label}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>🕐 Vào: {new Date(checkin.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                          {checkout && <span>Ra: {new Date(checkout.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}</span>}
                        </div>
                        {isActive && (
                          <button onClick={() => setShowCheckout(true)} style={{ padding: '8px 12px', borderRadius: 8, background: '#D96B43', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                            ⏹ KẾT THÚC CA NGAY
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* XIN NGHỈ ĐỘT XUẤT */}
              {leaves.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>
                    📋 Xin nghỉ đột xuất ({leaves.length})
                  </div>
                  {leaves.map((l) => (
                    <div key={l.id} style={{ padding: 14, borderRadius: 14, background: '#fff', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <b style={{ fontSize: 15 }}>{l.staff_name}</b>
                        <Badge tone="danger">Xin nghỉ</Badge>
                      </div>
                      {l.leave_from_at && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          Thời gian: {new Date(l.leave_from_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                          {l.leave_to_at ? ` → ${new Date(l.leave_to_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}
                        </div>
                      )}
                      {l.reason && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lý do: {l.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </React.Fragment>
      )}

      {viewMode === 'schedule' && <WeeklyScheduleSection profile={profile} />}

      {/* Các Modal Thao Tác */}
      {showCheckin && (
        <CheckinModal
          staffId={profile?.id}
          staffName={profile?.full_name}
          defaultBranch={profile?.station}
          onClose={() => setShowCheckin(false)}
          onDone={() => { setShowCheckin(false); refreshAfterAction(); }}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          staffId={profile?.id}
          staffName={profile?.full_name}
          activeCheckins={activeCheckins}
          defaultBranch={profile?.station}
          onClose={() => setShowCheckout(false)}
          onDone={() => { setShowCheckout(false); refreshAfterAction(); }}
        />
      )}

      {showAddManual && (
        <AddManualShiftModal
          staffId={profile?.id}
          staffName={profile?.full_name}
          defaultBranch={profile?.station}
          onClose={() => setShowAddManual(false)}
          onDone={() => { setShowAddManual(false); refreshAfterAction(); }}
        />
      )}

      {showLeave && (
        <LeaveModal
          staffId={profile?.id}
          staffName={profile?.full_name}
          staffRole={profile?.role}
          defaultBranch={profile?.station}
          onClose={() => setShowLeave(false)}
          onDone={() => { setShowLeave(false); refreshAfterAction(); }}
        />
      )}
    </div>
  );
}
