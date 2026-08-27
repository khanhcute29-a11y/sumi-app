import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { newId } from '../lib/ids';
import UserAvatar from '../components/UserAvatar';
import { ROLE_META, getRoleMeta, formatStationLabel } from '../lib/roles';

export default function MobileProfileScreen({onSignOut,onNavigate}){
 const {profile,reload}=useAuth(); const [done,setDone]=useState(0),[hours,setHours]=useState('0h');
 const isDirector=['owner','admin'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['owner','admin'].includes(r));
 const isFinance=isDirector||['accountant','cashier'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['accountant','cashier'].includes(r));
 const [uploading,setUploading]=useState(false); const [error,setError]=useState(''); const inputRef=useRef(null);
 useEffect(()=>{Promise.all([supabase.from('my_task_queue').select('*',{count:'exact',head:true}).eq('status','completed'),supabase.from('work_sessions').select('regular_minutes,overtime_minutes').eq('employee_id',profile?.id)]).then(([t,w])=>{if(!t.error)setDone(t.count||0);if(!w.error){const mins=(w.data||[]).reduce((s,x)=>s+(x.regular_minutes||0)+(x.overtime_minutes||0),0);setHours(`${Math.round(mins/60)}h`)}})},[profile?.id]);
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
  <div className="sumi-section-head"><span>CÔNG VIỆC & THU NHẬP</span></div><button className="sumi-menu-button" onClick={()=>onNavigate?.('shifts')}><span>⏱️</span><b>Chấm công và lịch làm</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('compensation')}><span>💵</span><b>Tăng ca và lương tháng</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('financeRequests')}><span>🧾</span><b>Chi & tạm ứng</b><em>›</em></button>{isFinance&&<button className="sumi-menu-button" onClick={()=>onNavigate?.('accountantOverview')}><span>📊</span><b>Kế toán tổng quan</b><em>›</em></button>}{isDirector&&<button className="sumi-menu-button" onClick={()=>onNavigate?.('approvals')}><span>✅</span><b>Yêu Cầu Duyệt</b><em>›</em></button>}
  <div className="sumi-section-head"><span>TÀI KHOẢN</span></div><button className="sumi-menu-button" onClick={()=>onNavigate?.('settings')}><span>⚙️</span><b>Thiết lập tài khoản</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('inbox')}><span>🔔</span><b>Thông báo của tôi</b><em>›</em></button><button className="sumi-menu-button" onClick={()=>onNavigate?.('visualGuides')}><span>🖼️</span><b>Hướng dẫn bằng hình ảnh</b><em>›</em></button><button className="sumi-menu-button danger" onClick={onSignOut}><span>🚪</span><b>Đăng xuất</b><em>›</em></button>
 </div>;
}
