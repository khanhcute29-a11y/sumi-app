import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './forms/Button';
import { Select } from './forms/Select';
import {
  fetchShiftSchedule, addShiftScheduleEntry, removeShiftScheduleEntry,
  fetchShiftConfigs, fetchShiftLogsRange, fetchApprovalRequests, fetchAllProfiles,
} from '../lib/queries';
import { hasAnyRole } from '../lib/roles';
import { localDateStr, mondayOf, weekDates } from '../lib/date';
import { LeaveScheduleRequestModal } from './LeaveScheduleRequestModal';

const STATIONS = [
  { key: 'bakery', label: 'Bakery' },
  { key: 'nong', label: 'Bếp Nóng' },
  { key: 'lanh', label: 'Bếp Lạnh' },
  { key: 'xuong41', label: 'Xưởng 41' },
  { key: 'xuong42', label: 'Xưởng 42' },
];
const DOW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function WeeklyScheduleSection({ profile }) {
  const isOwner = hasAnyRole(profile, ['owner', 'admin']);
  const [weekMonday, setWeekMonday] = useState(() => mondayOf(new Date()));
  const [station, setStation] = useState(isOwner ? 'bakery' : (profile?.station || 'bakery'));
  const [schedule, setSchedule] = useState([]);
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [liveStaffIds, setLiveStaffIds] = useState(new Set());
  const [leaveByStaffDate, setLeaveByStaffDate] = useState(new Set());
  const [pendingLeaveByStaffDate, setPendingLeaveByStaffDate] = useState(new Set());
  const [allProfiles, setAllProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignCell, setAssignCell] = useState(null);
  const [assignError, setAssignError] = useState('');
  const [leaveRequestDate, setLeaveRequestDate] = useState(null);

  const days = useMemo(() => weekDates(weekMonday), [weekMonday]);
  const from = localDateStr(days[0]);
  const to = localDateStr(days[6]);
  const todayStr = localDateStr();

  const loadData = () => {
    setLoading(true);
    setError('');
    const loads = [
      fetchShiftSchedule({ station, from, to }),
      fetchShiftConfigs(),
      fetchShiftLogsRange(from, to),
      fetchApprovalRequests({ type: 'leave_request' }),
    ];
    if (isOwner) loads.push(fetchAllProfiles());
    return Promise.all(loads)
      .then(([scheduleData, configsData, logsData, approvalsData, profilesData]) => {
        setSchedule(scheduleData);
        setShiftConfigs(configsData);
        const live = new Set(
          logsData.filter((l) => l.type === 'checkin' && !logsData.some((c) => c.type === 'checkout' && c.staff_id === l.staff_id && c.work_date === l.work_date))
            .map((l) => `${l.staff_id}_${l.work_date}`)
        );
        setLiveStaffIds(live);
        const approvedLeaves = new Set(
          approvalsData.filter((a) => a.status === 'approved' && a.leave_date)
            .map((a) => `${a.requester_id}_${a.leave_date}`)
        );
        setLeaveByStaffDate(approvedLeaves);
        const pendingLeaves = new Set(
          approvalsData.filter((a) => a.status === 'pending' && a.leave_date)
            .map((a) => `${a.requester_id}_${a.leave_date}`)
        );
        setPendingLeaveByStaffDate(pendingLeaves);
        if (profilesData) setAllProfiles(profilesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, from, to, isOwner]);

  const cellEntries = (shiftConfigId, date) => {
    const dateStr = localDateStr(date);
    return schedule.filter((s) => s.shift_config_id === shiftConfigId && s.work_date === dateStr);
  };

  const handleRemove = async (id) => {
    try {
      await removeShiftScheduleEntry(id);
      setSchedule((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  // Chỉ cảnh báo, không chặn — Sếp/Admin vẫn có thể gán nếu thật sự cần.
  const conflictWarning = (staffId, dateStr) => {
    const key = `${staffId}_${dateStr}`;
    if (leaveByStaffDate.has(key)) return 'Người này đã được duyệt nghỉ ngày này.';
    if (pendingLeaveByStaffDate.has(key)) return 'Người này đang có đơn xin nghỉ chờ duyệt ngày này.';
    if (liveStaffIds.has(key)) return 'Người này đang chấm công/làm ca khác trong ngày này.';
    return null;
  };

  const handleAssign = async (staffId, staffName) => {
    if (!assignCell) return;
    try {
      await addShiftScheduleEntry({
        station, workDate: localDateStr(assignCell.date), shiftConfigId: assignCell.shiftConfigId,
        staffId, staffName, createdBy: profile?.id,
      });
      setAssignCell(null);
      setAssignError('');
      const refreshed = await fetchShiftSchedule({ station, from, to });
      setSchedule(refreshed);
    } catch (err) {
      setAssignError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {isOwner && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {STATIONS.map((s) => (
            <div key={s.key} style={{ flexShrink: 0 }}>
              <Button variant={station === s.key ? 'primary' : 'secondary'} size="sm" onClick={() => setStation(s.key)}>{s.label}</Button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="secondary" size="sm" onClick={() => setWeekMonday((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}>‹ Tuần trước</Button>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{localDateStr(days[0])} — {localDateStr(days[6])}</div>
        <Button variant="secondary" size="sm" onClick={() => setWeekMonday((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}>Tuần sau ›</Button>
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', font: 'var(--text-caption)', color: 'var(--text-muted)', padding: 6 }}></th>
                {days.map((d, i) => (
                  <th key={i} style={{ font: 'var(--text-caption)', color: localDateStr(d) === todayStr ? 'var(--action-primary)' : 'var(--text-muted)', padding: 6 }}>
                    {DOW_LABELS[i]}<br />{localDateStr(d).slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shiftConfigs.map((sc) => (
                <tr key={sc.id}>
                  <td style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', padding: 6, whiteSpace: 'nowrap' }}>{sc.label}</td>
                  {days.map((d, i) => {
                    const entries = cellEntries(sc.id, d);
                    const dateStr = localDateStr(d);
                    const canAddMore = station !== 'bakery' || entries.length === 0;
                    return (
                      <td key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 6, verticalAlign: 'top', minWidth: 90 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {entries.map((e) => {
                            const key = `${e.staff_id}_${dateStr}`;
                            const isLive = liveStaffIds.has(key);
                            const isLeave = leaveByStaffDate.has(key);
                            const isPendingLeave = pendingLeaveByStaffDate.has(key);
                            const bg = isLeave ? 'var(--status-danger-soft)' : isLive ? 'var(--status-success-soft)' : 'var(--surface-sunken)';
                            const color = isLeave ? 'var(--status-danger)' : isLive ? 'var(--status-success)' : 'var(--text-primary)';
                            return (
                              <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, background: bg, color, borderRadius: 'var(--radius-sm)', padding: '3px 6px', font: 'var(--text-caption)' }}>
                                <span>
                                  {e.staff_name}{isLeave ? ' (nghỉ)' : ''}
                                  {isPendingLeave && !isLeave && <span style={{ color: 'var(--status-warning)' }}> (chờ duyệt)</span>}
                                </span>
                                {isOwner && <button onClick={() => handleRemove(e.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color, fontSize: 11 }}>✕</button>}
                                {e.staff_id === profile?.id && dateStr >= todayStr && !isLeave && !isPendingLeave && (
                                  <button onClick={() => setLeaveRequestDate(dateStr)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', font: 'var(--text-caption)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Xin nghỉ</button>
                                )}
                              </div>
                            );
                          })}
                          {isOwner && canAddMore && (
                            <button onClick={() => { setAssignError(''); setAssignCell({ date: d, shiftConfigId: sc.id }); }} style={{ border: '1px dashed var(--border-subtle)', background: 'none', borderRadius: 'var(--radius-sm)', padding: '3px 6px', font: 'var(--text-caption)', color: 'var(--text-muted)', cursor: 'pointer' }}>+ Thêm</button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, font: 'var(--text-caption)', color: 'var(--text-secondary)' }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-success)', display: 'inline-block' }}></i>Đang làm (đã bắt đầu ca)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, font: 'var(--text-caption)', color: 'var(--text-secondary)' }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-danger)', display: 'inline-block' }}></i>Đã duyệt nghỉ</span>
      </div>

      {assignCell && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={() => { setAssignCell(null); setAssignError(''); }}>
          <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 320, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Thêm người vào ca</div>
            <Select
              value=""
              onChange={(e) => {
                const p = allProfiles.find((p) => p.id === e.target.value);
                if (!p || !assignCell) return;
                const dateStr = localDateStr(assignCell.date);
                const warning = conflictWarning(p.id, dateStr);
                if (warning && !window.confirm(`⚠️ ${warning}\nVẫn muốn gán "${p.full_name}" vào ca này?`)) return;
                handleAssign(p.id, p.full_name);
              }}
              options={allProfiles.filter((p) => p.approved && p.active !== false && p.full_name).map((p) => ({ value: p.id, label: p.full_name }))}
              placeholder="Chọn nhân viên..."
            />
            {assignError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{assignError}</div>}
            <Button variant="secondary" size="sm" onClick={() => { setAssignCell(null); setAssignError(''); }}>Đóng</Button>
          </div>
        </div>
      )}

      {leaveRequestDate && (
        <LeaveScheduleRequestModal
          leaveDate={leaveRequestDate}
          staffId={profile?.id}
          staffName={profile?.full_name}
          staffRole={profile?.role}
          onClose={() => setLeaveRequestDate(null)}
          onSent={() => { setLeaveRequestDate(null); loadData(); }}
        />
      )}
    </div>
  );
}
