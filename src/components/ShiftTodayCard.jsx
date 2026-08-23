import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const timeStr = value => value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '--:--';

export default function ShiftTodayCard({ onNavigate }) {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);

  const load = () => {
    if (!profile?.id) return;
    supabase
      .from('shift_logs')
      .select('id,type,checkin_time,shift_label,branch')
      .eq('staff_id', profile.id)
      .eq('work_date', today())
      .order('checkin_time', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setLogs(data || []);
      });
  };

  useEffect(() => {
    load();
    window.addEventListener('sumi-shift-changed', load);
    return () => window.removeEventListener('sumi-shift-changed', load);
  }, [profile?.id]);

  const checkins = logs.filter(x => x.type === 'checkin');
  const checkouts = logs.filter(x => x.type === 'checkout');

  // Đang trong ca nếu có checkin nhiều hơn checkout
  const isWorking = checkins.length > checkouts.length;
  const lastCheckin = checkins[checkins.length - 1];
  const lastCheckout = checkouts[checkouts.length - 1];

  const handleAction = () => {
    onNavigate?.('shifts');
    const action = isWorking ? 'checkout' : 'checkin';
    setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-shift-action', { detail: { action } })), 60);
  };

  return (
    <section className={`sumi-shift-today ${isWorking ? 'working' : checkins.length > 0 ? 'done' : 'waiting'}`}>
      <div className="sumi-shift-status">
        <span>{isWorking ? '●' : checkins.length > 0 ? '✓' : '◷'}</span>
        <div>
          <small>CHẤM CÔNG HÔM NAY · NGHỈ TRƯA 11:30–12:30</small>
          <strong>
            {isWorking
              ? `Đang trong ca (${lastCheckin?.shift_label || 'Làm việc'})`
              : checkins.length > 0
                ? `Đã hoàn thành ${checkouts.length} ca làm việc`
                : 'Chưa bắt đầu ca làm'}
          </strong>
        </div>
      </div>

      <div className="sumi-shift-times">
        <span>
          <small>Vào ca gần nhất</small>
          <b>{timeStr(lastCheckin?.checkin_time)}</b>
        </span>
        <i />
        <span>
          <small>Ra ca gần nhất</small>
          <b>{timeStr(lastCheckout?.checkin_time)}</b>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={handleAction}
          style={{ flex: 1 }}
        >
          {isWorking ? '⏹ KẾT THÚC CA' : '▶ BẮT ĐẦU CA'}
        </button>
        <button
          type="button"
          onClick={() => {
            onNavigate?.('shifts');
            setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-shift-action', { detail: { action: 'add' } })), 60);
          }}
          style={{ width: 'auto', padding: '0 14px', background: 'rgba(0,0,0,0.1)', color: 'inherit' }}
          title="Thêm ca / Bổ sung giờ làm"
        >
          ＋ Thêm ca
        </button>
      </div>
    </section>
  );
}

