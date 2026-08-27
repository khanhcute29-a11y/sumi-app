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
import { supabase } from '../lib/supabaseClient';
import { chuanHoaCa, gomChamCongNgay, tomTatThang, boPhanCuaHoSo, TEN_BO_PHAN } from '../lib/chamCong';
import ChamCongNhanVien from '../components/shifts/ChamCongNhanVien';
import ChamCongQuanLy from '../components/shifts/ChamCongQuanLy';
import ChamCongV2 from '../components/shifts/v2/ChamCongV2';
import '../styles/cham-cong.css';

// Giao diện Chấm Công V2 (dựng theo mockup time-attendance-v2.html).
// ĐÃ BẬT MẶC ĐỊNH cho mọi người — anh Nghĩa duyệt và chốt bật ngày 27/08/2026.
// Thêm `?ccv2=0` vào địa chỉ để tạm quay lại bản cũ nếu cần xem lại gấp
// (chỉ ảnh hưởng máy đang mở, không tắt cho người khác).
const DUNG_GIAO_DIEN_V2 = (() => {
  try {
    return new URLSearchParams(window.location.search).get('ccv2') !== '0';
  } catch { return true; }
})();

const BRANCHES = ['Vĩnh Phú 42', 'Quốc lộ 13'];
const SHIFT_PRESETS = [
  '🎂 Bếp Bánh Lạnh',
  '🍞 Bếp Bánh Nóng',
  '🧁 Xưởng Macaron (X41)',
  '🏫 Xưởng 42 (Trường học)',
];
// SHIFT_PRESETS_EXTENDED đã bị bỏ cùng lúc với ô "Chọn ca khác..." trong
// CheckinModal (không còn nơi nào dùng) — xoá luôn, không để rác trong file.

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

function CheckinModal({ staffName, staffId, defaultBranch, danhSachCa = [], boPhan = null, onClose, onDone }) {
  const now = new Date();
  const [workDate, setWorkDate] = useState(localDateStr(now));
  const [checkinTime, setCheckinTime] = useState(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  // Tên ca lấy THẲNG từ bộ phận thật của nhân viên (database đã biết), không
  // còn bắt tự chọn tay từ danh sách chung chung nữa — tránh chọn nhầm bộ
  // phận, và đây cũng chỉ là chữ hiển thị (xem ShiftTodayCard.jsx), không ảnh
  // hưởng gì tới cách tính đi muộn — chuyện đó database tự quyết qua trigger.
  const [shiftLabel] = useState(() => TEN_BO_PHAN[boPhan] || 'Ca làm việc');
  const [branch, setBranch] = useState(defaultBranch || BRANCHES[0]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [useGps, setUseGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
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
          const { latitude, longitude, accuracy } = position.coords;
          setGpsCoords(`${latitude},${longitude}`);
          setGpsAccuracy(Number.isFinite(accuracy) ? Math.round(accuracy) : null);
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

    // Giờ chuẩn và số phút muộn KHÔNG do màn hình này quyết nữa — trigger
    // `sumi_tu_tinh_di_muon` dưới database sẽ ghi đè bằng con số đúng theo bộ
    // phận. Gửi lên đây chỉ để hàng đợi offline có đủ trường.
    const payload = {
      staffId, staffName, workDate, shiftLabel: shiftLabel.trim(), branch: branch || null,
      expectedStart: null, lateMinutes: 0, wageEarned: 0,
      reason: null, photoUrl: photoUrl || null,
      gpsCoords: gpsCoords || null,
      gpsAccuracy: gpsAccuracy ?? null,
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
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 380, maxHeight: '90dvh', overflowY: 'auto', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={(e) => e.stopPropagation()}>
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

        {/* Chi nhánh. Trước đây phần này còn có thêm ô "Chọn tên ca / khâu"
            (bắt tự chọn tay từ danh sách chung chung) và một ô xem trước
            "Ca chuẩn của bạn" — cả hai bị bỏ vì THỪA: màn hình Chấm Công đã
            hiện đúng ca thật của nhân viên (đọc từ database) ngay trước khi
            mở popup này rồi, không cần lặp lại. Tự chọn tay còn có rủi ro
            chọn NHẦM bộ phận. Việc tính đi muộn/đúng giờ luôn do database
            quyết qua trigger — không phụ thuộc gì vào ô đã bỏ này. */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>Chi nhánh</label>
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
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('dang_lay'); // dang_lay | ok | loi
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedCheckin = activeCheckins.find(c => c.id === selectedCheckinId) || activeCheckins[0];
  const currentShiftLabel = selectedCheckin?.shift_label || 'Ca làm việc';
  const inTimeStr = selectedCheckin?.checkin_time;
  const outTimeStr = `${workDate}T${checkoutTime}:00`;
  const timeCalc = inTimeStr ? calculateNetWorkHours(inTimeStr, outTimeStr) : null;

  // Bắt buộc định vị khi kết thúc ca — tự lấy ngay lúc mở popup, không cần
  // nhân viên tự bật (trước đây GPS chỉ là tuỳ chọn, dễ bỏ qua).
  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('loi');
      setError('Thiết bị/trình duyệt không hỗ trợ định vị GPS.');
      return;
    }
    setGpsStatus('dang_lay');
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setGpsCoords(`${latitude},${longitude}`);
        setGpsAccuracy(Number.isFinite(accuracy) ? Math.round(accuracy) : null);
        setGpsStatus('ok');
      },
      (err) => {
        setGpsStatus('loi');
        setError(`Không lấy được vị trí GPS: ${err.message}. Bấm "Thử lấy vị trí lại" hoặc kiểm tra quyền định vị của trình duyệt.`);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  useEffect(() => { captureGps(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!photoUrl) {
      setError('Vui lòng chụp ảnh để xác nhận');
      return;
    }
    if (!gpsCoords) {
      setError('Bắt buộc phải có vị trí GPS mới được kết thúc ca. Bấm "Thử lấy vị trí lại".');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      staffId, staffName, workDate: selectedCheckin?.work_date || workDate,
      shiftLabel: currentShiftLabel,
      branch: selectedCheckin?.branch || defaultBranch || null,
      photoUrl: photoUrl || null,
      gpsCoords: gpsCoords || null,
      gpsAccuracy: gpsAccuracy ?? null
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
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 380, maxHeight: '90dvh', overflowY: 'auto', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={(e) => e.stopPropagation()}>
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

        {/* Vị trí GPS — bắt buộc, tự lấy khi mở popup */}
        <div style={{
          padding: 12, borderRadius: 12,
          background: gpsStatus === 'ok' ? '#e6f6ed' : gpsStatus === 'loi' ? '#ffebee' : 'var(--surface-sunken)',
          border: gpsStatus === 'ok' ? '1px solid #138a53' : gpsStatus === 'loi' ? '1px solid #d32f2f' : '1px solid var(--border-default)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>📍 Vị trí GPS (bắt buộc) *</div>
          {gpsStatus === 'dang_lay' && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Đang lấy vị trí...</div>}
          {gpsStatus === 'ok' && (
            <div style={{ fontSize: 12, color: '#09663d', marginTop: 4 }}>
              ✓ Đã lấy: {gpsCoords}{gpsAccuracy ? ` · sai số ${gpsAccuracy}m` : ''}
            </div>
          )}
          {gpsStatus === 'loi' && (
            <button
              onClick={captureGps}
              disabled={saving}
              style={{
                marginTop: 6, width: '100%', padding: '9px 14px', borderRadius: 10,
                border: '1px solid #d32f2f', background: '#fff', color: '#d32f2f',
                fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              🔄 Thử lấy vị trí lại
            </button>
          )}
        </div>

        {/* Error */}
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', padding: 10, borderRadius: 8, background: '#ffebee' }}>{error}</div>}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving} style={{ flex: 1 }}>Huỷ</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={saving || !photoUrl || !gpsCoords}
            style={{ flex: 1, opacity: (!photoUrl || !gpsCoords) ? 0.5 : 1 }}
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
      await addShiftCheckin({ staffId, staffName, workDate, shiftLabel: shiftLabel.trim(), branch, expectedStart: `${startTime}:00`, lateMinutes: 0, wageEarned: 0, reason: '[BỔ SUNG] ' + (reason.trim() || 'Bổ sung ca làm') });
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
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 440, maxWidth: '100%', maxHeight: '90dvh', overflowY: 'auto', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={(e) => e.stopPropagation()}>
        <div><div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>＋ Thêm ca / Bổ sung giờ làm</div></div>
        <Input label="Ngày làm việc" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input label="Giờ bắt đầu" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: '1 1 120px' }} />
          <Input label="Giờ kết thúc" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ flex: '1 1 120px' }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Chọn ca / Bộ phận</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {SHIFT_PRESETS.map((p) => (<button key={p} type="button" onClick={() => setShiftLabel(p)} style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: shiftLabel === p ? 'var(--action-primary)' : 'var(--surface-sunken)', color: shiftLabel === p ? 'var(--text-on-primary)' : 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{p}</button>))}
          </div>
          <Input placeholder="Hoặc tự gõ tên ca..." value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} />
        </div>
        <Select label="Chi nhánh" value={branch} onChange={(e) => setBranch(e.target.value)} options={BRANCHES.map(b => ({ value: b, label: b }))} />
        {timeCalc && (<div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-sunken)', fontSize: 13 }}><span>Thời lượng: <b>{timeCalc.grossHours}h</b></span>{timeCalc.lunchDeduction > 0 && <span style={{ color: '#b93e13' }}> (Đã trừ {timeCalc.lunchDeduction}h ăn trưa 11:30–12:30)</span>}<span style={{ display: 'block', marginTop: 4, fontWeight: 800, color: 'var(--action-primary)' }}>→ Giờ làm thực tế: {timeCalc.netHours} giờ</span></div>)}
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
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 400, maxWidth: '100%', maxHeight: '90dvh', overflowY: 'auto', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
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
  const [viewMode, setViewMode] = useState('checkin');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cauHinhCa, setCauHinhCa] = useState([]);
  const [hoSoList, setHoSoList] = useState([]);
  const [logsThang, setLogsThang] = useState([]);
  const [thangXem, setThangXem] = useState(() => { const d = new Date(); return { nam: d.getFullYear(), thang: d.getMonth() + 1 }; });
  const [xemChamCongCuaToi, setXemChamCongCuaToi] = useState(false);

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

  // Hồ sơ nhân sự dùng cho màn hình quản lý.
  useEffect(() => {
    // Giờ chuẩn lấy từ bảng quy định MỚI `sumi_quy_dinh_ca` (theo bộ phận),
    // không dùng `shift_configs` nữa — bảng đó vẫn để cho Lịch tuần và KPI.
    supabase.from('sumi_quy_dinh_ca').select('*').eq('active', true)
      .then(({ data }) => setCauHinhCa(data || []))
      .catch(() => setCauHinhCa([]));
    supabase.from('profiles').select('id,full_name,role,station,phone')
      .eq('approved', true).neq('active', false).order('full_name')
      .then(({ data }) => setHoSoList(data || []))
      .catch(() => setHoSoList([]));
  }, []);

  // Nhật ký cả tháng để dựng tóm tắt + lịch chấm công của bản thân.
  useEffect(() => {
    const { nam, thang } = thangXem;
    const tu = `${nam}-${String(thang).padStart(2, '0')}-01`;
    const den = `${nam}-${String(thang).padStart(2, '0')}-${String(new Date(nam, thang, 0).getDate()).padStart(2, '0')}`;
    fetchShiftLogsRange(tu, den).then((d) => setLogsThang(d || [])).catch(() => setLogsThang([]));
  }, [thangXem, logs]);

  const myTodayLogs = logs.filter(l => l.staff_id === profile?.id);
  const myCheckins = myTodayLogs.filter(l => l.type === 'checkin');
  const myCheckouts = myTodayLogs.filter(l => l.type === 'checkout');
  const activeCheckins = myCheckins.slice(myCheckouts.length);
  // ── Phân vai để chọn góc nhìn ──────────────────────────────────────────
  // Giám đốc/Quản lý: cả xưởng. Bếp trưởng & trợ lý GĐ xưởng: khâu của mình.
  // Còn lại: chỉ chấm công của bản thân.
  const vaiTro = [profile?.role, ...(profile?.extra_roles || [])].filter(Boolean);
  const laGiamDoc = vaiTro.some((r) => ['owner', 'admin'].includes(r));
  const khauQuanLy = vaiTro.includes('deputy_director_x41') ? 'xuong41'
    : vaiTro.includes('deputy_director_x42') ? 'xuong42'
      : vaiTro.some((r) => String(r).startsWith('kitchen_lead')) ? (boPhanCuaHoSo(profile) || '_khac')
        : null;
  const laQuanLy = laGiamDoc || !!khauQuanLy;

  const danhSachCa = chuanHoaCa(cauHinhCa);
  // Mỗi người thuộc bộ phận nào -> để biết ca chuẩn nào áp cho họ.
  const boPhanTheoNguoi = {};
  hoSoList.forEach((h) => { boPhanTheoNguoi[h.id] = boPhanCuaHoSo(h); });
  const boPhanCuaToi = boPhanTheoNguoi[profile?.id] ?? boPhanCuaHoSo(profile);
  const chamNgay = gomChamCongNgay(logs, danhSachCa, boPhanTheoNguoi);
  const rong = (id, ten) => ({
    staffId: id, ten, vaoISO: null, raISO: null, vao: null, ra: null,
    ca: null, coCaChuan: false, chenhLech: null, trangThai: 'upcoming',
    ghiChu: '', xinNghi: false, soGio: null,
  });
  const chamCuaToi = chamNgay.get(profile?.id) || rong(profile?.id, profile?.full_name);
  const tomTat = tomTatThang(logsThang, profile?.id, danhSachCa, boPhanCuaToi);

  const trongPhamVi = hoSoList.filter((h) => {
    if (laGiamDoc) return true;
    if (!khauQuanLy) return h.id === profile?.id;
    return (boPhanCuaHoSo(h) || '_khac') === khauQuanLy || h.id === profile?.id;
  });
  const danhSachQuanLy = trongPhamVi.map((h) => ({
    hoSo: h,
    cham: chamNgay.get(h.id) || rong(h.id, h.full_name),
  }));
  const toiTrongDanhSach = danhSachQuanLy.find((x) => x.hoSo.id === profile?.id) || null;

  const doiThang = (buoc) => setThangXem(({ nam, thang }) => {
    const d = new Date(nam, thang - 1 + buoc, 1);
    return { nam: d.getFullYear(), thang: d.getMonth() + 1 };
  });

  const tieuDe = laGiamDoc ? 'Chấm Công — Toàn Xưởng'
    : khauQuanLy ? 'Chấm Công — Khâu Của Tôi'
      : 'Chấm Công Của Tôi';
  const tieuDePhu = laGiamDoc ? 'Thấy tất cả nhân viên toàn xưởng'
    : khauQuanLy ? 'Thấy bản thân + nhân viên trong khâu'
      : 'Chỉ thấy chấm công của bản thân';


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Bản V2 tự vẽ đầu trang riêng (cc2-hero) và không dùng khung giờ nghỉ
          trưa cố định kiểu banner này — mockup đã bỏ hẳn khối này. Ẩn khi
          DUNG_GIAO_DIEN_V2 để không hiện chồng lên header của bản mới. */}
      {!DUNG_GIAO_DIEN_V2 && (
      <>
      <div className="cc-header" style={{ borderRadius: 18 }}>
        <div className="cc-header-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cc-header-title">{tieuDe}</div>
            <div className="cc-header-sub">{tieuDePhu}</div>
          </div>
          <div style={{ textAlign: 'right', color: '#fff' }}>
            <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
              {currentTime.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)' }}>
              {currentTime.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.8)' }}>Xem ngày:</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ minHeight: 40, padding: '0 10px', borderRadius: 12, border: 0, fontSize: 14, fontWeight: 700 }} />
          {date !== localDateStr() && (
            <button onClick={() => setDate(localDateStr())}
              style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, border: 0, background: 'rgba(255,255,255,.2)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              ↩ Về hôm nay
            </button>
          )}
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderRadius: 14, background: '#fff0d4', border: '1px solid #d7c3aa', display: 'flex', alignItems: 'center', gap: 10, color: '#2d1c10' }}>
        <span style={{ fontSize: 24 }}>🍱</span>
        <div>
          <strong style={{ fontSize: 15, display: 'block', color: '#a94a21' }}>Khung giờ nghỉ trưa cố định: 11:30 – 12:30</strong>
          <span style={{ fontSize: 13, color: '#725f50' }}>Mặc định toàn tiệm để mọi người sắp xếp nghỉ ngơi (Hệ thống tự động trừ 1 giờ vào tổng giờ làm việc thực tế).</span>
        </div>
      </div>
      </>
      )}
      {!DUNG_GIAO_DIEN_V2 && (
        <Tabs tabs={[{ key: 'checkin', label: 'Chấm công realtime' }, { key: 'schedule', label: 'Lịch tuần' }]} active={viewMode} onChange={setViewMode} />
      )}

      {viewMode === 'checkin' && (
        <div className="cc-wrap">
          {error && (
            <div style={{ margin: '0 16px 10px', padding: 12, borderRadius: 12, background: '#fee2e2', color: '#b42318', fontWeight: 700, fontSize: 14 }}>
              ⚠️ Lỗi tải dữ liệu: {error}
            </div>
          )}
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải chấm công…</div>
          ) : DUNG_GIAO_DIEN_V2 ? (
            /* Giao diện mới. Nhận ĐÚNG dữ liệu mà bản cũ đang dùng và gọi lại
               ĐÚNG các hàm mở modal cũ — không có đường ghi dữ liệu nào mới. */
            <ChamCongV2
              hoSo={profile}
              laQuanLy={laQuanLy}
              laGiamDoc={laGiamDoc}
              danhSachQuanLy={danhSachQuanLy}
              toiTrongDanhSach={toiTrongDanhSach}
              chamCuaToi={chamCuaToi}
              danhSachCa={danhSachCa}
              boPhanTheoNguoi={boPhanTheoNguoi}
              boPhanCuaToi={boPhanCuaToi}
              logsHomNay={logs}
              tomTat={tomTat}
              gioHienTai={currentTime}
              onCheckin={() => setShowCheckin(true)}
              onCheckout={() => setShowCheckout(true)}
              onXinNghi={() => setShowLeave(true)}
              onTaiLai={async () => { loadLogs(); }}
            />
          ) : (laQuanLy && !xemChamCongCuaToi) ? (
            <ChamCongQuanLy
              danhSach={danhSachQuanLy}
              toi={toiTrongDanhSach}
              laGiamDoc={laGiamDoc}
              tieuDeTongHop={laGiamDoc ? 'Báo cáo chênh lệch toàn xưởng' : 'Chênh lệch giờ — khâu của tôi'}
              onXemChamCongCuaToi={() => setXemChamCongCuaToi(true)}
            />
          ) : (
            <>
              {laQuanLy && (
                <div style={{ padding: '12px 16px 0' }}>
                  <button onClick={() => setXemChamCongCuaToi(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4efe8', border: 0, borderRadius: 12, minHeight: 44, padding: '0 14px', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: '#2d1c10' }}>
                    ← Quay lại quản lý nhóm
                  </button>
                </div>
              )}
              <ChamCongNhanVien
                hoSo={profile}
                homNay={localDateStr()}
                ngayXem={date}
                canCham={chamCuaToi}
                tomTat={tomTat}
                nam={thangXem.nam}
                thang={thangXem.thang}
                onLuiThang={() => doiThang(-1)}
                onToiThang={() => doiThang(1)}
                onCheckin={() => setShowCheckin(true)}
                onCheckout={() => setShowCheckout(true)}
                onXinNghi={() => setShowLeave(true)}
              />
              <div className="cc-section" style={{ marginTop: 12, paddingBottom: 20 }}>
                <button onClick={() => setShowAddManual(true)}
                  style={{ width: '100%', minHeight: 48, borderRadius: 14, border: '2px dashed #d7c3aa', background: 'transparent', color: '#8c5a3c', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                  ＋ Bổ sung ca đã làm (quên chấm)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {viewMode === 'schedule' && <WeeklyScheduleSection profile={profile} />}

      {/* Các Modal Thao Tác */}
      {showCheckin && (
        <CheckinModal
          danhSachCa={danhSachCa}
          boPhan={boPhanCuaToi}
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
