import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const time = value => value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '--:--';

export default function ShiftTodayCard({ onNavigate }) {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const load = () => {
    if (!profile?.id) return;
    supabase.from('shift_logs').select('id,type,checkin_time,shift_label,branch').eq('staff_id', profile.id).eq('work_date', today())
      .then(({ data, error }) => { if (!error) setLogs(data || []); });
  };
  useEffect(() => { load(); window.addEventListener('sumi-shift-changed', load); return () => window.removeEventListener('sumi-shift-changed', load); }, [profile?.id]);
  const checkin = logs.find(x => x.type === 'checkin');
  const checkout = logs.find(x => x.type === 'checkout');
  const action = checkout ? 'history' : checkin ? 'checkout' : 'checkin';
  const open = () => {
    onNavigate?.('shifts');
    if (action !== 'history') setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-shift-action', { detail: { action } })), 50);
  };
  return <section className={`sumi-shift-today ${checkout ? 'done' : checkin ? 'working' : 'waiting'}`}>
    <div className="sumi-shift-status"><span>{checkout ? '✓' : checkin ? '●' : '◷'}</span><div><small>CA LÀM HÔM NAY</small><strong>{checkout ? 'Đã kết thúc ca' : checkin ? 'Đang trong ca' : 'Chưa bắt đầu ca'}</strong></div></div>
    <div className="sumi-shift-times"><span><small>Vào ca</small><b>{time(checkin?.checkin_time)}</b></span><i/><span><small>Ra ca</small><b>{time(checkout?.checkin_time)}</b></span></div>
    <button onClick={open}>{checkout ? 'XEM CHẤM CÔNG' : checkin ? 'KẾT THÚC CA' : 'BẮT ĐẦU CA'}</button>
  </section>;
}
