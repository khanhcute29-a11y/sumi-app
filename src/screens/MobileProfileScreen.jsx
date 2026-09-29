import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { newId } from '../lib/ids';
import UserAvatar from '../components/UserAvatar';
import { fetchShiftLogsRange, fetchShiftConfigs } from '../lib/queries';
import { computeShiftHours } from '../lib/kpi';
import { localDateStr, mondayOf } from '../lib/date';
import { ROLE_META, getRoleMeta, formatStationLabel } from '../lib/roles';
import { IconClock, IconMoney, IconReceipt, IconReports, IconSettings, IconBell, IconImage, IconLogout, IconClipboard } from '../components/icons/FrogIcons';

export default function MobileProfileScreen({onSignOut,onNavigate}){
 const {profile,reload}=useAuth(); const [done,setDone]=useState(0),[hours,setHours]=useState('0h');
 const isDirector=['owner','admin'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['owner','admin'].includes(r));
 const isFinance=isDirector||['accountant','cashier'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['accountant','cashier'].includes(r));
 const [uploading,setUploading]=useState(false); const [error,setError]=useState(''); const inputRef=useRef(null);
 // Ô "Giờ làm" (KẾT QUẢ TUẦN NÀY): trước đây đọc bảng work_sessions KHÔNG tồn
 // tại (lỗi 404) nên luôn hiện 0h. Giờ tính từ chấm công thật (shift_logs) bằng
 // đúng hàm computeShiftHours mà màn Hôm nay đang dùng, từ thứ Hai tới hôm nay.
 useEffect(()=>{const tu=localDateStr(mondayOf(new Date())),den=localDateStr();Promise.all([supabase.from('my_task_queue').select('*',{count:'exact',head:true}).eq('status','completed'),Promise.all([fetchShiftLogsRange(tu,den),fetchShiftConfigs()]).then(([logs,cfg])=>computeShiftHours(logs||[],cfg||[],profile?.id,tu,den)).catch(()=>null)]).then(([t,w])=>{if(!t.error)setDone(t.count||0);if(w)setHours(`${Math.round(w.hoursWorked||0)}h`)})},[profile?.id]);
 const changeAvatar=async file=>{if(!file)return;setUploading(true);setError('');try{const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`avatars/${profile.id}/${newId()}.${ext}`;let r=await supabase.storage.from('uploads').upload(path,file,{upsert:false});if(r.error)throw r.error;r=await supabase.from('profiles').update({avatar_path:path}).eq('id',profile.id);if(r.error)throw r.error;reload();}catch(e){setError(e.message||'Không thể cập nhật ảnh');}finally{setUploading(false)}};
 return <div className="sumi-profile-page">
  <div className="sumi-profile-card">
    <button className="sumi-profile-avatar" onClick={()=>inputRef.current?.click()} aria-label="Đổi ảnh đại diện">
      <UserAvatar profile={profile} size={76}/><em>📷</em>
    </button>
    <input ref={inputRef} hidden type="file" accept="image/*" capture="user" onChange={e=>changeAvatar(e.target.files?.[0])}/>
    <div>
      <h1>{profile?.full_name||'Nhân viên SUMI'}</h1>
      <p>{getRoleMeta(profile?.role, profile?.station)?.label || profile?.role}{profile?.station ? ` · ${formatStationLabel(profile.station)}` : ''}</p>
      <small>{uploading?'Đang tải ảnh...':'Chạm vào ảnh để thay đổi'}</small>
    </div>
  </div>
  {error&&<div className="sumi-profile-error">{error}</div>}
  <div className="sumi-section-head"><span>KẾT QUẢ TUẦN NÀY</span><button onClick={()=>onNavigate?.('kpi')}>Chi tiết ›</button></div><div className="sumi-kpi-strip"><div><strong>{done}</strong><span>Việc đã xong</span></div><div><strong>—</strong><span>Đúng giờ</span></div><div><strong>{hours}</strong><span>Giờ làm</span></div></div><div className="sumi-progress-card"><div><span>Mục tiêu tuần</span><b>{done} việc hoàn thành</b></div><i><span style={{width:`${Math.min(done*4,100)}%`}}/></i></div>
  <div className="sumi-section-head"><span>CÔNG VIỆC & THU NHẬP</span></div><button className="sumi-menu-button" onClick={()=>onNavigate?.('shifts')}><span><IconClock size={20}/></span><b>Chấm công và lịch làm</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('compensation')}><span><IconMoney size={20}/></span><b>Tăng ca và lương tháng</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('financeRequests')}><span><IconReceipt size={20}/></span><b>Chi & tạm ứng</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('kpiTongQuan')}><span><IconClipboard size={20}/></span><b>Tổng quan KPI</b><em>›</em></button>{isFinance&&<button className="sumi-menu-button" onClick={()=>onNavigate?.('accountantOverview')}><span><IconReports size={20}/></span><b>Kế toán tổng quan</b><em>›</em></button>}
  <div className="sumi-section-head"><span>TÀI KHOẢN</span></div><button className="sumi-menu-button" onClick={()=>onNavigate?.('settings')}><span><IconSettings size={20}/></span><b>Thiết lập tài khoản</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('inbox')}><span><IconBell size={20}/></span><b>Thông báo của tôi</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('visualGuides')}><span><IconImage size={20}/></span><b>Hướng dẫn bằng hình ảnh</b><em>›</em></button><button className="sumi-menu-button danger" onClick={onSignOut}><span><IconLogout size={20}/></span><b>Đăng xuất</b><em>›</em></button>
 </div>;
}
