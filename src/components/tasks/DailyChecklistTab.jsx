import React, { useEffect, useState } from 'react';
import { Checkbox } from '../forms/Checkbox';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { Select } from '../forms/Select';
import {
  fetchTaskTemplates, fetchTaskCompletions, setTaskCompletion, confirmTaskCompletion,
  createTaskTemplate, deleteTaskTemplate,
} from '../../lib/queries';
import { localDateStr } from '../../lib/date';

const ALL_STATIONS = '__all__';
const STATION_OPTIONS = [
  { value: ALL_STATIONS, label: 'Tất cả khâu' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'nong', label: 'Bếp nóng' },
  { value: 'lanh', label: 'Bếp lạnh' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
];

export function DailyChecklistTab({ profile, isOwner, viewingStaffId, viewingStaffName, viewingStation, refreshKey }) {
  const [templates, setTemplates] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newStation, setNewStation] = useState(ALL_STATIONS);
  const [recurrence,setRecurrence]=useState('daily');
  const [scheduledTime,setScheduledTime]=useState('');
  const [weekdays,setWeekdays]=useState([]);
  const [dayOfMonth,setDayOfMonth]=useState('1');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [kpiDiem, setKpiDiem] = useState('0');
  // 'staff' = giao riêng nhân viên đang xem, 'station' = giao cho cả bộ phận
  // (Khâu áp dụng) — trước đây bị lỗi luôn gán cứng theo nhân viên đang xem
  // dù đã chọn khâu, khiến "giao cả bộ phận" không thật sự hoạt động.
  const [assignScope, setAssignScope] = useState('staff');
  const today = localDateStr(new Date());

  const load = () => {
    Promise.all([fetchTaskTemplates({ active: true }), fetchTaskCompletions({ date: today, staffId: viewingStaffId })])
      .then(([t, c]) => { setTemplates(t); setCompletions(c); setError(''); })
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, [viewingStaffId, refreshKey]);

  const weekday=new Date(`${today}T12:00:00`).getDay(); const monthDay=Number(today.slice(-2));
  const applicable = templates.filter((t) => (!t.assignee_id||t.assignee_id===viewingStaffId)&&(!t.station||t.station===viewingStation)
   &&(t.recurrence==='weekly'?(t.weekdays||[]).includes(weekday):t.recurrence==='monthly'?Number(t.day_of_month)===monthDay:true));
  const completionFor = (templateId) => completions.find((c) => c.template_id === templateId && c.staff_id === viewingStaffId);
  const canToggle = profile?.id === viewingStaffId;

  // Giao cả bộ phận bắt buộc phải chọn khâu cụ thể (không phải "Tất cả khâu")
  // — nếu không sẽ áp dụng cho TOÀN BỘ nhân sự công ty, dễ bấm nhầm.
  const canAssignStation = isOwner && assignScope === 'station' && newStation !== ALL_STATIONS;
  const handleAddTemplate = async () => {
    if (!newTitle.trim()) { setError('Nhập tên việc hằng ngày.'); return; }
    if (isOwner && assignScope === 'station' && newStation === ALL_STATIONS) {
      setError('Chọn 1 khâu cụ thể để giao cho cả bộ phận, hoặc chuyển sang "Giao riêng nhân viên này".');
      return;
    }
    setSavingTemplate(true); setError('');
    try {
      await createTaskTemplate({
        title: newTitle.trim(),
        station: newStation === ALL_STATIONS ? null : newStation,
        assigneeId: canAssignStation ? null : viewingStaffId,
        recurrence,weekdays,dayOfMonth:recurrence==='monthly'?Number(dayOfMonth):null,scheduledTime:scheduledTime||null,remindMinutes:15,
        kpiDiem: isOwner ? Number(kpiDiem) || 0 : 0,
      });
      setNewTitle(''); setNewStation(ALL_STATIONS); setScheduledTime(''); setKpiDiem('0');
      load();
    } catch (err) { setError(err.message); } finally { setSavingTemplate(false); }
  };

  const handleHideTemplate = async (id) => {
    setBusyId(id); setError('');
    try { await deleteTaskTemplate(id); load(); }
    catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  const handleToggle = async (templateId, currentlyDone) => {
    setBusyId(templateId); setError('');
    try {
      await setTaskCompletion({ templateId, staffId: viewingStaffId, date: today, completed: !currentlyDone });
      load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  const handleConfirm = async (completionId) => {
    setBusyId(completionId); setError('');
    try {
      await confirmTaskCompletion(completionId);
      load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Checklist ngày {today}{viewingStaffName ? ` — ${viewingStaffName}` : ''}</div>
      <div className="sumi-todo-builder">
       <header><div><small>{isOwner?'GIAO CHECKLIST':'CHECKLIST CỦA TÔI'}</small><strong>＋ Thêm việc cần nhớ</strong></div><span>🔔 Nhắc trước 15 phút</span></header>
       <Input label="Tên việc" placeholder="VD: Kiểm tra tủ bánh lúc 16 giờ" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
       <div className="sumi-todo-schedule"><Select label="Lặp lại" value={recurrence} onChange={e=>setRecurrence(e.target.value)} options={[{value:'daily',label:'Hàng ngày'},{value:'weekly',label:'Hàng tuần'},{value:'monthly',label:'Hàng tháng'}]}/><Input label="Giờ nhắc" type="time" value={scheduledTime} onChange={e=>setScheduledTime(e.target.value)}/></div>
       {recurrence==='weekly'&&<div className="sumi-weekdays">{['CN','T2','T3','T4','T5','T6','T7'].map((x,i)=><button type="button" className={weekdays.includes(i)?'active':''} key={x} onClick={()=>setWeekdays(v=>v.includes(i)?v.filter(n=>n!==i):[...v,i])}>{x}</button>)}</div>}
       {recurrence==='monthly'&&<Input label="Ngày trong tháng" type="number" min="1" max="31" value={dayOfMonth} onChange={e=>setDayOfMonth(e.target.value)}/>}
       {isOwner&&<Select label="Khâu áp dụng" value={newStation} onChange={(e) => setNewStation(e.target.value)} options={STATION_OPTIONS} placeholder="Tất cả khâu" />}
       {isOwner && (
         <div className="sumi-todo-schedule">
           <Select label="Giao cho" value={assignScope} onChange={(e) => setAssignScope(e.target.value)}
             options={[
               { value: 'staff', label: `Riêng ${viewingStaffName || 'nhân viên này'}` },
               { value: 'station', label: 'Cả bộ phận (chọn khâu ở trên)' },
             ]} />
           <Input label="Điểm KPI (+/-)" type="number" value={kpiDiem} onChange={(e) => setKpiDiem(e.target.value)} />
         </div>
       )}
       {isOwner && assignScope === 'station' && newStation === ALL_STATIONS && (
         <div style={{ font: 'var(--text-caption)', color: 'var(--status-warning)' }}>Chọn 1 khâu cụ thể ở trên để giao cho cả bộ phận.</div>
       )}
       <Button disabled={savingTemplate} onClick={handleAddTemplate}>{savingTemplate ? 'Đang lưu...' : isOwner?'Giao vào checklist':'Thêm vào checklist của tôi'}</Button>
      </div>
      {applicable.length === 0 && <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>Chưa có việc hằng ngày nào cho khâu này.</div>}
      {applicable.map((t) => {
        const c = completionFor(t.id);
        const done = !!c?.completed_at;
        const confirmed = !!c?.confirmed_at;
        return (
          <div key={t.id} className={`sumi-todo-row ${done?'done':''}`}>
            <div className="sumi-todo-main"><Checkbox label={t.title} checked={done} onChange={canToggle ? () => handleToggle(t.id, done) : undefined}/><small>{t.recurrence==='weekly'?'Lặp hàng tuần':t.recurrence==='monthly'?`Ngày ${t.day_of_month} hàng tháng`:'Lặp hàng ngày'}{t.scheduled_time?` · ${String(t.scheduled_time).slice(0,5)}`:''}{!t.assignee_id&&t.station?' · Cả bộ phận':''}{t.kpi_diem?` · ${t.kpi_diem>0?'+':''}${t.kpi_diem} điểm KPI`:''}</small></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {t.locked&&<span title="Việc do quản lý tạo">🔒</span>}
              {confirmed && <span style={{ font: 'var(--text-caption)', color: 'var(--status-success)' }}>Đã xác nhận</span>}
              {isOwner && done && !confirmed && (
                <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => handleConfirm(c.id)}>Xác nhận</Button>
              )}
              {(isOwner||(t.source==='personal'&&t.created_by===profile?.id))&&<Button size="sm" variant="ghost" disabled={busyId===t.id} onClick={()=>handleHideTemplate(t.id)}>Xóa</Button>}
            </div>
          </div>
        );
      })}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
    </div>
  );
}
