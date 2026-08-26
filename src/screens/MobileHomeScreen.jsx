import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { listOrdersV2 } from '../lib/featureFlags';
import { useAuth } from '../lib/AuthContext';
import UserAvatar from '../components/UserAvatar';
import ShiftTodayCard from '../components/ShiftTodayCard';
import EditApprovalPanel from '../components/EditApprovalPanel';
import { EmployeeOverviewV4Inner } from '../components/mockups/EmployeeDashboard/EmployeeOverviewV4';

import { ROLE_META, KITCHEN_LEAD_ROLES, getRoleMeta, formatStationLabel } from '../lib/roles';
import { ORDER_FLOWS } from '../data/orderCatalogs';

const isDirector = p => ['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42'].includes(p?.role) || (p?.extra_roles || []).some(r => ['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42'].includes(r));
const canViewRevenue = p => ['owner', 'admin'].includes(p?.role) || (p?.extra_roles || []).some(r => ['owner', 'admin'].includes(r));
const isLead = p => KITCHEN_LEAD_ROLES.includes(p?.role) || (p?.extra_roles || []).some(r => KITCHEN_LEAD_ROLES.includes(r));
const getRoleLabel = (r, s) => getRoleMeta(r, s)?.label || r;
const fmtVnd = n => `${Math.round(n||0).toLocaleString('vi-VN')}đ`;
const periodRange = (period, customFrom, customTo) => {
 const now = new Date();
 if (period === 'today') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
 if (period === '7d') return { from: new Date(now.getTime() - 7 * 86400000), to: now };
 if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
 return { from: customFrom ? new Date(customFrom) : null, to: customTo ? new Date(`${customTo}T23:59:59`) : now };
};

export default function MobileHomeScreen({onNavigate}){
 const {profile}=useAuth(); const [tasks,setTasks]=useState([]),[orders,setOrders]=useState([]),[staff,setStaff]=useState([]),[unread,setUnread]=useState(0);
 useEffect(()=>{const run=()=>supabase.rpc('enqueue_order_operational_alerts');run();const timer=setInterval(run,300000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{Promise.all([supabase.from('my_task_queue').select('*').in('status',['open','in_progress']).order('deadline').limit(6),listOrdersV2().catch(()=>[]),supabase.from('profiles').select('id,full_name,role,station,active').eq('active',true).limit(5),supabase.from('notifications').select('*',{count:'exact',head:true}).eq('is_read',false)]).then(([t,o,s,n])=>{if(!t.error)setTasks(t.data||[]);setOrders(Array.isArray(o)?o:[]);if(!s.error)setStaff(s.data||[]);if(!n.error)setUnread(n.count||0)});},[profile?.id]);
 const counts=useMemo(()=>({
  total:orders.length,
  waiting:orders.filter(o=>['awaiting_assignment','awaiting_acceptance'].includes(o.status_v2)&&!o.is_overdue).length,
  production:orders.filter(o=>o.status_v2==='in_production'&&!o.is_overdue).length,
  ready:orders.filter(o=>o.status_v2==='ready_for_fulfillment'&&!o.is_overdue).length,
  delivery:orders.filter(o=>o.status_v2==='in_delivery'&&!o.is_overdue).length,
  completed:orders.filter(o=>o.status_v2==='completed').length,
  overdue:orders.filter(o=>Boolean(o.is_overdue)).length,
 }),[orders]);
 // Nhân viên thường (không phải Giám đốc/Quản lý, không phải Bếp trưởng) dùng
 // hẳn màn hình Employee Overview V4 — nó tự vẽ header/banner riêng của nó,
 // nên trả về thẳng, không lồng vào khung header+main dùng chung bên dưới
 // (khung đó chỉ dành cho DirectorHome/LeadHome).
 if (!isDirector(profile) && !isLead(profile)) return <EmployeeOverviewV4Inner />;
 return <div className="sumi-mobile-page"><header className="sumi-topbar"><div className="sumi-brand"><div className="sumi-brand-mark"><img src="/sumi-bakery-logo.png" alt="Sumi Bakery" /></div><div><div className="sumi-brand-name">SUMI BAKERY</div><div className="sumi-hello">Chào {profile?.full_name||'nhân viên'}</div></div></div><div className="sumi-top-actions"><button className="sumi-bell" onClick={()=>onNavigate('inbox')} aria-label="Thông báo">🔔{unread>0&&<b>{unread}</b>}</button><button className="sumi-avatar-button" onClick={()=>onNavigate('profile')} aria-label="Mở hồ sơ cá nhân"><UserAvatar profile={profile} size={44}/></button></div></header><main className="sumi-main"><PinnedAnnouncement onOpen={()=>onNavigate('feed')}/>{isDirector(profile)?<DirectorHome counts={counts} staff={staff} onNavigate={onNavigate} canViewRevenue={canViewRevenue(profile)}/>:<LeadHome counts={counts} tasks={tasks} onNavigate={onNavigate}/>}</main></div>;
}
function PinnedAnnouncement({onOpen}){const[row,setRow]=useState(null);useEffect(()=>{supabase.from('company_feed_posts').select('id,title,body,severity').eq('post_type','announcement').is('deleted_at',null).in('severity',['important','urgent']).order('created_at',{ascending:false}).limit(1).maybeSingle().then(r=>{if(!r.error)setRow(r.data)})},[]);return row?<button className={`sumi-pinned-announcement ${row.severity}`} onClick={onOpen}><span>📢</span><span><strong>{row.title}</strong><small>{row.body}</small></span><em>›</em></button>:null}
function SectionHead({title,value,onClick}){return <div className="sumi-section-head"><span>{title}</span>{onClick?<button onClick={onClick}>{value}</button>:<span>{value}</span>}</div>}
function OrderStatusOverview({counts,onNavigate}){
 const open=filter=>{onNavigate('orders');setTimeout(()=>window.dispatchEvent(new CustomEvent('sumi-order-filter',{detail:{filter}})),0)};
 return <><SectionHead title="TÌNH TRẠNG ĐƠN HÀNG" value={`${counts.total} đơn`} onClick={()=>open(null)}/><div className="mock-order-overview"><button onClick={()=>open(null)}><span>🧾</span><strong>Tổng đơn hàng</strong><b>{counts.total}</b></button><button onClick={()=>open('waiting')}><span>📥</span><strong>Đơn chờ làm</strong><b>{counts.waiting}</b></button><button onClick={()=>open('production')}><span>👩‍🍳</span><strong>Bếp đang làm</strong><b>{counts.production}</b></button><button onClick={()=>open('ready')}><span>📦</span><strong>Chờ vận chuyển</strong><b>{counts.ready}</b></button><button onClick={()=>open('delivery')}><span>🛵</span><strong>Đang vận chuyển</strong><b>{counts.delivery}</b></button><button onClick={()=>open('completed')}><span>✅</span><strong>Giao thành công</strong><b>{counts.completed}</b></button><button onClick={()=>open('overdue')}><span>⚠️</span><strong>Chưa thực hiện</strong><b>{counts.overdue}</b></button></div></>;
}
const PERIOD_TABS=[{key:'today',label:'Hôm nay'},{key:'7d',label:'7 ngày'},{key:'month',label:'Tháng'},{key:'custom',label:'Tuỳ chọn'}];
function useRevenue(period,customFrom,customTo,enabled=true){
 const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true);
 useEffect(()=>{
  if(!enabled){setRows([]);setLoading(false);return}
  const {from,to}=periodRange(period,customFrom,customTo);
  if(!from){setRows([]);setLoading(false);return}
  setLoading(true);
  supabase.from('orders').select('order_type,total').eq('status_v2','completed').gte('completed_at',from.toISOString()).lte('completed_at',to.toISOString()).then(({data,error})=>{setRows(!error&&data?data:[]);setLoading(false)});
 },[period,customFrom,customTo,enabled]);
 const byFlow=useMemo(()=>{
  const map={}; ORDER_FLOWS.forEach(f=>map[f.key]={...f,revenue:0,count:0}); map.other={key:'other',icon:'🧺',title:'Khác',revenue:0,count:0};
  rows.forEach(o=>{const bucket=map[o.order_type]||map.other; bucket.revenue+=Number(o.total)||0; bucket.count+=1});
  return [...ORDER_FLOWS.map(f=>map[f.key]),map.other].filter(b=>b.count>0||true);
 },[rows]);
 const total=useMemo(()=>rows.reduce((s,o)=>s+(Number(o.total)||0),0),[rows]);
 return {loading,byFlow,total};
}
function RevenueModal({period,setPeriod,customFrom,setCustomFrom,customTo,setCustomTo,byFlow,total,loading,onClose}){
 return <div className="sumi-order-create-overlay" onClick={onClose}>
  <div className="sumi-order-create-body" onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={onClose} aria-label="Đóng">←</button><h2>💰 Doanh thu theo luồng</h2></div>
   <div className="sumi-period-tabs">{PERIOD_TABS.map(t=><button key={t.key} className={period===t.key?'active':''} onClick={()=>setPeriod(t.key)}>{t.label}</button>)}</div>
   {period==='custom'&&<div style={{display:'flex',gap:8,margin:'10px 0'}}>
     <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{flex:1,minHeight:50,border:'2px solid #d7c3aa',borderRadius:14,padding:'8px 10px'}}/>
     <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{flex:1,minHeight:50,border:'2px solid #d7c3aa',borderRadius:14,padding:'8px 10px'}}/>
   </div>}
   <div style={{padding:16,marginTop:10,borderRadius:16,background:'#138a53',color:'#fff'}}>
     <div style={{fontSize:12,fontWeight:800,opacity:.85}}>TỔNG DOANH THU</div>
     <div style={{fontSize:30,fontWeight:900,marginTop:4}}>{loading?'…':fmtVnd(total)}</div>
   </div>
   <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>
    {byFlow.map(f=><div key={f.key} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',border:'2px solid #eadcca',borderRadius:16,background:'#fff'}}>
      <span style={{fontSize:22}}>{f.icon}</span>
      <div style={{flex:1,minWidth:0}}><strong style={{display:'block',fontSize:15}}>{f.title}</strong><small style={{color:'#725f50'}}>{f.count} đơn hoàn thành</small></div>
      <b style={{fontSize:16,color:'#b93e13'}}>{loading?'…':fmtVnd(f.revenue)}</b>
    </div>)}
   </div>
  </div>
 </div>;
}
function DirectorHome({counts,staff,onNavigate,canViewRevenue}){
 const staffWork=p=>{sessionStorage.setItem('sumi_managed_staff_id',p.id);onNavigate('tasks')};
 const [period,setPeriod]=useState('today'); const [customFrom,setCustomFrom]=useState(''); const [customTo,setCustomTo]=useState('');
 const [showRevenue,setShowRevenue]=useState(false);
 const {loading:revenueLoading,byFlow,total:revenueTotal}=useRevenue(period,customFrom,customTo,canViewRevenue);
 const periodLabel=PERIOD_TABS.find(t=>t.key===period)?.label||'Hôm nay';
 return <><EditApprovalPanel/><div className="sumi-workplace">📊 Toàn hệ thống{canViewRevenue?` · ${periodLabel}`:''}</div>
  {canViewRevenue?<>
   <div className="sumi-period-tabs">{PERIOD_TABS.map(t=><button key={t.key} className={period===t.key?'active':''} onClick={()=>setPeriod(t.key)}>{t.label}</button>)}</div>
   {period==='custom'&&<div style={{display:'flex',gap:8,margin:'8px 0 4px'}}><input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{flex:1,minHeight:48,border:'2px solid #d7c3aa',borderRadius:14,padding:'6px 10px'}}/><input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{flex:1,minHeight:48,border:'2px solid #d7c3aa',borderRadius:14,padding:'6px 10px'}}/></div>}
   <div className="sumi-money-grid"><button className="revenue" onClick={()=>setShowRevenue(true)} style={{border:0,cursor:'pointer',textAlign:'left'}}><small>DOANH THU</small><strong>{revenueLoading?'…':fmtVnd(revenueTotal)}</strong><span>Bấm để xem theo 5 luồng ›</span></button><div className="cost"><small>CHI</small><strong>—</strong><span>Chỉ GĐ được xem</span></div></div>
  </>:<div className="sumi-money-grid"><div className="cost"><small>DOANH THU</small><strong>—</strong><span>Chỉ Giám đốc được xem</span></div><div className="cost"><small>CHI</small><strong>—</strong><span>Chỉ Giám đốc được xem</span></div></div>}
  <OrderStatusOverview counts={counts} onNavigate={onNavigate}/><SectionHead title="NHÂN VIÊN" value="Xem tất cả ›" onClick={()=>onNavigate('staff')}/><div className="sumi-staff-list">{staff.slice(0,4).map(p=><button key={p.id} onClick={()=>staffWork(p)}><span className="avatar">{KITCHEN_LEAD_ROLES.includes(p.role)?'👨‍🍳':'👤'}</span><span><strong>{p.full_name}</strong><small>{getRoleLabel(p.role)}{p.station?` · ${p.station}`:''}</small></span><em>XEM VIỆC</em></button>)}</div><div className="sumi-flow-note">Bấm nhân viên để giao việc, theo dõi tiến độ và xem báo cáo công việc của người đó.</div>{canViewRevenue&&showRevenue&&<RevenueModal period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} byFlow={byFlow} total={revenueTotal} loading={revenueLoading} onClose={()=>setShowRevenue(false)}/>}</>}
function LeadHome({counts,tasks,onNavigate}){return <><ShiftTodayCard onNavigate={onNavigate}/><div className="sumi-workplace">👨‍🍳 Xưởng sản xuất bánh SUMI</div><div className="sumi-org-path">Giám đốc → Bếp trưởng → Bếp phó → Thợ bánh</div><section className="sumi-lead-hero"><small>CA SẢN XUẤT HÔM NAY</small><h1>{tasks.length} việc đang làm</h1><p>Nhận đơn · chia việc · duyệt hoàn thành</p></section><div className="sumi-action-grid"><button onClick={()=>onNavigate('orders')}>🧾<span>Đơn được giao cho bếp</span></button><button onClick={()=>onNavigate('tasks')}>👥<span>Giao người thực hiện</span></button><button onClick={()=>onNavigate('warehouse')}>🌾<span>Yêu cầu nguyên liệu</span></button><button onClick={()=>onNavigate('tasks')}>✅<span>Duyệt mẻ hoàn thành</span></button></div><OrderStatusOverview counts={counts} onNavigate={onNavigate}/><SectionHead title="TIẾN ĐỘ SẢN XUẤT" value={`${tasks.length} việc`}/><TaskQueue tasks={tasks}/><div className="sumi-flow-note">Bếp trưởng duyệt “Hoàn thành” thì hệ thống mới nhập kho thành phẩm. Nhân viên báo làm xong chưa tự cộng kho.</div></>}
function TaskQueue({tasks}){return <div className="sumi-task-queue">{tasks.map((t,i)=><button key={t.id}><b>{i+2}</b><span><strong>{t.title}</strong><small>{t.order_code?`Đơn ${t.order_code}`:'Việc trong ngày'}</small></span><em>{t.status==='in_progress'?'ĐANG LÀM':'CHỜ'}</em></button>)}</div>}
