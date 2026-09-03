import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { listOrdersV2 } from '../lib/featureFlags';
import { useAuth } from '../lib/AuthContext';
import UserAvatar from '../components/UserAvatar';
import EditApprovalPanel from '../components/EditApprovalPanel';
import { EmployeeOverviewV4Inner } from '../components/mockups/EmployeeDashboard/EmployeeOverviewV4';
import { BossOverviewV3Inner } from '../components/mockups/BossDashboardV3/BossOverviewV3';
import TodayAttendanceWidget from '../components/mockups/EmployeeDashboard/TodayAttendanceWidget';
import DonTuCuaToi from '../components/shifts/v2/DonTuCuaToi';
import DeXuatChoDuyet from '../components/shifts/v2/DeXuatChoDuyet';
import TheDeXuat from '../components/shifts/v2/TheDeXuat';
import FinishedGoodsInventoryV2 from '../components/warehouse/FinishedGoodsInventoryV2';
import OrderV2DetailModal from '../components/OrderV2DetailModal';
import '../styles/cham-cong-v2.css';
import '../styles/cong-viec.css';
import '../components/mockups/EmployeeDashboard/employee-overview-v4.css';
import { boPhanCuaHoSo } from '../lib/chamCong';
import { fetchApprovalRequests, fetchShiftLogsRange, fetchShiftConfigs } from '../lib/queries';
import { fetchDanhSachNhanSuNgay } from '../lib/hoSoNgayNhanSu';
import { localDateStr } from '../lib/date';
import { computeShiftHours } from '../lib/kpi';
import { Zap, Megaphone, FileText as IconLeave, ClipboardList as IconReport, Package as IconPackageAdmin, Boxes as IconStock, ChevronRight, TrendingUp as IconMoneyUp, Clock as IconClock, Gift as IconGift } from 'lucide-react';

import { ROLE_META, KITCHEN_LEAD_ROLES, getRoleMeta, formatStationLabel } from '../lib/roles';
import { ORDER_FLOWS } from '../data/orderCatalogs';
import { IconReceipt, IconInbox, IconKitchen, IconPackage, IconShipping, IconCheckCircle, IconWarning, IconMixed } from '../components/icons/FrogIcons';

const isDirector = p => ['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42'].includes(p?.role) || (p?.extra_roles || []).some(r => ['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42'].includes(r));
const canViewRevenue = p => ['owner', 'admin'].includes(p?.role) || (p?.extra_roles || []).some(r => ['owner', 'admin'].includes(r));
const isLead = p => KITCHEN_LEAD_ROLES.includes(p?.role) || (p?.extra_roles || []).some(r => KITCHEN_LEAD_ROLES.includes(r));
const getRoleLabel = (r, s) => getRoleMeta(r, s)?.label || r;
const fmtVnd = n => `${Math.round(n||0).toLocaleString('vi-VN')}đ`;
export const periodRange = (period, customFrom, customTo) => {
 const now = new Date();
 if (period === 'today') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
 if (period === '7d') return { from: new Date(now.getTime() - 7 * 86400000), to: now };
 if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
 return { from: customFrom ? new Date(customFrom) : null, to: customTo ? new Date(`${customTo}T23:59:59`) : now };
};

export default function MobileHomeScreen({onNavigate}){
 const {profile}=useAuth(); const [tasks,setTasks]=useState([]),[orders,setOrders]=useState([]),[staff,setStaff]=useState([]),[unread,setUnread]=useState(0);
 useEffect(()=>{const run=()=>supabase.rpc('enqueue_order_operational_alerts');run();const timer=setInterval(run,300000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{Promise.all([supabase.from('my_task_queue').select('*').in('status',['open','in_progress']).order('deadline').limit(6),listOrdersV2().catch(()=>[]),supabase.from('profiles').select('id,full_name,role,station,active').eq('active',true).limit(5),supabase.from('notifications').select('*',{count:'exact',head:true}).is('read_at',null)]).then(([t,o,s,n])=>{if(!t.error)setTasks(t.data||[]);setOrders(Array.isArray(o)?o:[]);if(!s.error)setStaff(s.data||[]);if(!n.error)setUnread(n.count||0)});},[profile?.id]);
 // Nhân viên thường (không phải Giám đốc/Quản lý, không phải Bếp trưởng) dùng
 // hẳn màn hình Employee Overview V4 — nó tự vẽ header/banner riêng của nó,
 // nên trả về thẳng, không lồng vào khung header+main dùng chung bên dưới
 // (khung đó chỉ dành cho DirectorHome/LeadHome).
 if (!isDirector(profile) && !isLead(profile)) return <EmployeeOverviewV4Inner onNavigate={onNavigate} />;
 // Giám đốc/Chủ sở hữu thật (owner/admin, đúng điều kiện RPC is_business_director()
 // ở backend) dùng thẳng Boss Overview V3 — màn hình đã nối Supabase thật, tự vẽ
 // header riêng. Phó GĐ xưởng không có quyền owner/admin thật vẫn ở lại DirectorHome
 // cũ để tránh bấm vào các nút duyệt tiền/nhắc nhở mà RPC sẽ từ chối.
 if (isDirector(profile) && canViewRevenue(profile)) return <BossOverviewV3Inner onNavigate={onNavigate} />;
 return <div className="sumi-mobile-page"><header className="sumi-topbar"><div className="sumi-brand"><div className="sumi-brand-mark"><img src="/sumi-bakery-logo.png" alt="Sumi Bakery" /></div><div><div className="sumi-brand-name">SUMI BAKERY</div><div className="sumi-hello">Chào {profile?.full_name||'nhân viên'}</div></div></div><div className="sumi-top-actions"><button className="sumi-bell" onClick={()=>onNavigate('inbox')} aria-label="Thông báo">🔔{unread>0&&<b>{unread}</b>}</button><button className="sumi-avatar-button" onClick={()=>onNavigate('profile')} aria-label="Mở hồ sơ cá nhân"><UserAvatar profile={profile} size={44}/></button></div></header><main className="sumi-main"><PinnedAnnouncement onOpen={()=>onNavigate('feed')}/>{isDirector(profile)?<DirectorHome orders={orders} staff={staff} onNavigate={onNavigate} canViewRevenue={canViewRevenue(profile)}/>:<LeadHome orders={orders} tasks={tasks} onNavigate={onNavigate} profile={profile}/>}</main></div>;
}
function PinnedAnnouncement({onOpen}){const[row,setRow]=useState(null);useEffect(()=>{supabase.from('company_feed_posts').select('id,title,body,severity').eq('post_type','announcement').is('deleted_at',null).in('severity',['important','urgent']).order('created_at',{ascending:false}).limit(1).maybeSingle().then(r=>{if(!r.error)setRow(r.data)})},[]);return row?<button className={`sumi-pinned-announcement ${row.severity}`} onClick={onOpen}><span>📢</span><span><strong>{row.title}</strong><small>{row.body}</small></span><em>›</em></button>:null}
function SectionHead({title,value,onClick}){return <div className="sumi-section-head"><span>{title}</span>{onClick?<button onClick={onClick}>{value}</button>:<span>{value}</span>}</div>}
// Bộ lọc kỳ hạn (Tất cả/Hôm nay/7 ngày/Tháng/Tuỳ chọn) giống hệt Dashboard
// Giám đốc — CHỈ ảnh hưởng "Tổng đơn hàng" (theo ngày TẠO) và "Giao thành
// công" (theo ngày GIAO xong thực tế), các ô trạng thái còn lại luôn là số
// hiện tại (snapshot sống), không đổi theo kỳ hạn — khớp đúng hành vi bên
// BossOverviewV3.tsx (yêu cầu Hồ Hoàng Diễm 30/08/2026).
function OrderStatusOverview({orders,onNavigate}){
 const [period,setPeriod]=useState('all'); const [customFrom,setCustomFrom]=useState(''); const [customTo,setCustomTo]=useState('');
 const range=useMemo(()=>period==='all'?null:periodRange(period,customFrom,customTo),[period,customFrom,customTo]);
 const inRange=ts=>{if(!ts||!range)return false;const d=new Date(ts);if(range.from&&d<range.from)return false;if(range.to&&d>range.to)return false;return true};
 const counts=useMemo(()=>({
  total:range?orders.filter(o=>inRange(o.created_at)).length:orders.length,
  waiting:orders.filter(o=>['awaiting_assignment','awaiting_acceptance'].includes(o.status_v2)&&!o.is_overdue).length,
  production:orders.filter(o=>o.status_v2==='in_production'&&!o.is_overdue).length,
  ready:orders.filter(o=>o.status_v2==='ready_for_fulfillment'&&!o.is_overdue).length,
  delivery:orders.filter(o=>o.status_v2==='in_delivery'&&!o.is_overdue).length,
  completed:range?orders.filter(o=>inRange(o.delivery_completed_at||o.completed_at)).length:orders.filter(o=>o.status_v2==='completed').length,
  overdue:orders.filter(o=>Boolean(o.is_overdue)).length,
 }),[orders,range]);
 const open=filter=>{onNavigate('orders');setTimeout(()=>window.dispatchEvent(new CustomEvent('sumi-order-filter',{detail:{filter}})),0)};
 return <><SectionHead title="TÌNH TRẠNG ĐƠN HÀNG" value={`${counts.total} đơn`} onClick={()=>open(null)}/>
  <div className="sumi-period-tabs">
   <button className={period==='all'?'active':''} onClick={()=>setPeriod('all')}>Tất cả</button>
   {PERIOD_TABS.map(t=><button key={t.key} className={period===t.key?'active':''} onClick={()=>setPeriod(t.key)}>{t.label}</button>)}
  </div>
  {period==='custom'&&<div style={{display:'flex',gap:8,margin:'0 0 10px'}}>
    <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{flex:1,minHeight:48,border:'2px solid #d7c3aa',borderRadius:14,padding:'6px 10px'}}/>
    <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{flex:1,minHeight:48,border:'2px solid #d7c3aa',borderRadius:14,padding:'6px 10px'}}/>
  </div>}
  <div className="mock-order-overview"><button onClick={()=>open(null)}><span><IconReceipt size={22}/></span><strong>Tổng đơn hàng</strong><b>{counts.total}</b></button><button onClick={()=>open('waiting')}><span><IconInbox size={22}/></span><strong>Đơn chờ làm</strong><b>{counts.waiting}</b></button><button onClick={()=>open('production')}><span><IconKitchen size={22}/></span><strong>Bếp đang làm</strong><b>{counts.production}</b></button><button onClick={()=>open('ready')}><span><IconPackage size={22}/></span><strong>Chờ vận chuyển</strong><b>{counts.ready}</b></button><button onClick={()=>open('delivery')}><span><IconShipping size={22}/></span><strong>Đang vận chuyển</strong><b>{counts.delivery}</b></button><button onClick={()=>open('completed')}><span><IconCheckCircle size={22}/></span><strong>Giao thành công</strong><b>{counts.completed}</b></button><button onClick={()=>open('overdue')}><span><IconWarning size={22}/></span><strong>Chưa thực hiện</strong><b>{counts.overdue}</b></button></div></>;
}
export const PERIOD_TABS=[{key:'today',label:'Hôm nay'},{key:'7d',label:'7 ngày'},{key:'month',label:'Tháng'},{key:'custom',label:'Tuỳ chọn'}];
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
  const map={}; ORDER_FLOWS.forEach(f=>map[f.key]={...f,revenue:0,count:0}); map.other={key:'other',icon:'🧺',Icon:IconMixed,title:'Khác',revenue:0,count:0};
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
      <span style={{fontSize:22}}><f.Icon size={22}/></span>
      <div style={{flex:1,minWidth:0}}><strong style={{display:'block',fontSize:15}}>{f.title}</strong><small style={{color:'#725f50'}}>{f.count} đơn hoàn thành</small></div>
      <b style={{fontSize:16,color:'#b93e13'}}>{loading?'…':fmtVnd(f.revenue)}</b>
    </div>)}
   </div>
  </div>
 </div>;
}
function DirectorHome({orders,staff,onNavigate,canViewRevenue}){
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
  <OrderStatusOverview orders={orders} onNavigate={onNavigate}/><SectionHead title="NHÂN VIÊN" value="Xem tất cả ›" onClick={()=>onNavigate('staff')}/><div className="sumi-staff-list">{staff.slice(0,4).map(p=><button key={p.id} onClick={()=>staffWork(p)}><span className="avatar">{KITCHEN_LEAD_ROLES.includes(p.role)?'👨‍🍳':'👤'}</span><span><strong>{p.full_name}</strong><small>{getRoleLabel(p.role)}{p.station?` · ${p.station}`:''}</small></span><em>XEM VIỆC</em></button>)}</div><div className="sumi-flow-note">Bấm nhân viên để giao việc, theo dõi tiến độ và xem báo cáo công việc của người đó.</div>{canViewRevenue&&showRevenue&&<RevenueModal period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} byFlow={byFlow} total={revenueTotal} loading={revenueLoading} onClose={()=>setShowRevenue(false)}/>}</>}
// Mã khâu bếp thật trên order_operations_list.kitchen_codes (từ
// organization_units.code) — đối chiếu trực tiếp trên dữ liệu thật
// (04/09/2026), KHÔNG đoán: bep_lanh->BAKERY_COLD, bep_nong->BAKERY_HOT,
// xuong41->X41_KITCHEN, xuong42->X42_KITCHEN. Dùng để lọc "Tình trạng đơn
// hàng" xuống đúng khâu Bếp trưởng/Quản lý xưởng đó phụ trách, thay vì hiện
// đơn của toàn hệ thống như trước.
const MA_KHAU_BEP_THEO_BO_PHAN={bep_lanh:'BAKERY_COLD',bep_nong:'BAKERY_HOT',xuong41:'X41_KITCHEN',xuong42:'X42_KITCHEN'};

// 6 ô "TÔI (Quản trị & Tiện ích điều hành)" cho Bếp trưởng — cùng kiểu ô màu
// như Giám đốc (BossOverviewV3), nhưng chỉ giữ tính năng LIÊN QUAN tới vai
// trò Bếp trưởng: không có "Nhân viên" kiểu phân quyền tài khoản, không có
// mục tài chính chỉ Giám đốc mới xem.
//
// Sửa theo phản hồi 04/09/2026:
//  - "Lịch làm" (trùng hẳn với widget Chấm công phía trên, cùng ra 'shifts')
//    -> đổi thành "Đơn từ/Xin nghỉ": đơn của mình + đơn cấp dưới đang chờ
//    mình duyệt + lịch sử đội đã qua tay mình duyệt (kể cả Giám đốc duyệt
//    tiếp sau đó) — mở sheet riêng, KHÔNG điều hướng sang 'shifts' nữa.
//  - "Nhân viên" (trỏ 'staff' — màn phân quyền tài khoản kiểu Giám đốc, quá
//    tay với Bếp trưởng) -> đổi thành "Báo cáo ngày": danh sách nhân sự cùng
//    khâu, trạng thái chấm công hôm nay — mở sheet riêng.
//  - Thêm ô thứ 6 "Tồn kho thành phẩm" lấp chỗ trống của lưới 2 cột (5 ô lẻ)
//    — mở ĐÚNG component Kho Thành Phẩm đang dùng trong list Đơn hàng
//    (FinishedGoodsInventoryV2), không dựng bản khác.
const O_DIEU_HANH_BEP_TRUONG=[
 {ten:'Giao việc',Icon:Zap,tab:'tasks',mau:'#7c3aed',nen:'#f2ecff',phu:'Giao & duyệt việc bếp'},
 {ten:'Bảng tin',Icon:Megaphone,tab:'feed',mau:'#0284c7',nen:'#e6f4fc',phu:'Chỉ đạo & thông báo'},
 {ten:'Đơn từ/Xin nghỉ',Icon:IconLeave,sheet:'donTu',mau:'#0b9462',nen:'#e7f7ef',phu:'Của tôi & đội cần duyệt'},
 {ten:'Nguyên liệu',Icon:IconPackageAdmin,tab:'warehouse',mau:'#a16207',nen:'#fdf4dd',phu:'Yêu cầu & tồn kho'},
 {ten:'Báo cáo ngày',Icon:IconReport,sheet:'baoCao',mau:'#be185d',nen:'#fdeaf2',phu:'Đội bếp hôm nay'},
 {ten:'Tồn kho thành phẩm',Icon:IconStock,sheet:'khoTP',mau:'#2563eb',nen:'#e8f0ff',phu:'Xem như trong Đơn hàng'},
];

// Sheet dùng chung kiểu RevenueModal đã có sẵn trong file này — tái dùng
// nguyên class CSS (.sumi-order-create-overlay/...-body/-create-head), không
// tạo CSS mới.
function LeadSheet({title,onClose,children}){
 return <div className="sumi-order-create-overlay" onClick={onClose}>
  <div className="sumi-order-create-body" onClick={e=>e.stopPropagation()}>
   <div className="sumi-create-head"><button onClick={onClose} aria-label="Đóng">←</button><h2>{title}</h2></div>
   {children}
  </div>
 </div>;
}

// "Đơn từ/Xin nghỉ" — của tôi (DonTuCuaToi) + đội đang chờ tôi duyệt
// (DeXuatChoDuyet capCuaToi=1, chỉ hiện đơn PENDING) + lịch sử đội đã qua
// tay tôi (mọi đơn có cap1_by = chính tôi, dù đã duyệt/từ chối, dù Giám đốc
// đã xử lý cấp 2 tiếp sau đó hay chưa — không cần dò danh sách "cấp dưới",
// cap1_by=tôi ĐÃ LÀ bằng chứng đơn đó thuộc quyền tôi).
function DonTuXinNghiSheet({hoSo,onClose}){
 const[lichSu,setLichSu]=useState(null);
 const[lamMoi,setLamMoi]=useState(0);
 useEffect(()=>{
  let huy=false;
  fetchApprovalRequests({}).then(ds=>{if(!huy)setLichSu((ds||[]).filter(r=>r.cap1_by===hoSo?.id&&r.status!=='pending'))}).catch(()=>{if(!huy)setLichSu([])});
  return()=>{huy=true};
 },[hoSo?.id,lamMoi]);
 return <LeadSheet title="📝 Đơn từ / Xin nghỉ" onClose={onClose}>
  <DonTuCuaToi hoSo={hoSo}/>
  <DeXuatChoDuyet hoSo={hoSo} capCuaToi={1} onDaXuLy={()=>setLamMoi(x=>x+1)}/>
  <div className="cc2-section-title" style={{marginTop:16}}><span>LỊCH SỬ ĐỘI ĐÃ XỬ LÝ</span></div>
  {lichSu===null?<div className="cc2-empty">Đang tải…</div>:lichSu.length===0?(
   <div className="cc2-empty">Chưa có đơn nào của đội qua tay bạn duyệt.</div>
  ):(
   <div className="cc2-history">{lichSu.map(r=><TheDeXuat key={r.id} don={r}/>)}</div>
  )}
 </LeadSheet>;
}

// "Báo cáo ngày" — danh sách nhân sự CÙNG KHÂU (station) với Bếp trưởng đang
// xem, trạng thái chấm công hôm nay. Lọc client-side theo `station` — khớp
// đúng điều kiện la_quan_ly_cua_ho_so() dưới database đang dùng cho quyền
// quản lý (không tự đặt luật phạm vi khác).
const NHAN_TRANG_THAI_NS={dang_lam:{c:'Đang làm',m:'#1e7e4c',n:'#e6f4ea'},xong:{c:'Đã tan ca',m:'#2563eb',n:'#eef3ff'},nghi:{c:'Xin nghỉ',m:'#a16207',n:'#fdf4dd'},chua_cham:{c:'Chưa chấm công',m:'#a52c22',n:'#fdecea'}};
function BaoCaoNgaySheet({hoSo,onClose}){
 const[ds,setDs]=useState(null);
 useEffect(()=>{
  let huy=false;
  fetchDanhSachNhanSuNgay(localDateStr()).then(rows=>{
   if(huy)return;
   const cungKhau=(rows||[]).filter(p=>p.id!==hoSo?.id&&hoSo?.station&&p.station===hoSo.station);
   setDs(cungKhau);
  }).catch(()=>{if(!huy)setDs([])});
  return()=>{huy=true};
 },[hoSo?.id,hoSo?.station]);
 const gio=iso=>iso?new Date(iso).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}):'--:--';
 return <LeadSheet title="📋 Báo cáo ngày — đội của tôi" onClose={onClose}>
  {!hoSo?.station?(
   <div className="cc2-empty">Hồ sơ của bạn chưa gán khâu (station) nên chưa xác định được "đội của tôi".</div>
  ):ds===null?(
   <div className="cc2-empty">Đang tải…</div>
  ):ds.length===0?(
   <div className="cc2-empty">Chưa có nhân sự nào khác cùng khâu.</div>
  ):(
   <div className="cc2-history">
    {ds.map(p=>{const tt=NHAN_TRANG_THAI_NS[p.trangThai]||NHAN_TRANG_THAI_NS.chua_cham;return(
     <div key={p.id} className="cv-card" style={{marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
       <strong>{p.full_name}</strong>
       <span className="cv-badge" style={{background:tt.n,color:tt.m}}>{tt.c}</span>
      </div>
      <div className="cv-meta"><span className="cv-meta-item">Vào: {gio(p.gioVao)}</span><span className="cv-meta-item">Ra: {gio(p.gioRa)}</span>{p.phutMuon>0&&<span className="cv-meta-item" style={{color:'#a52c22'}}>Trễ {p.phutMuon}p</span>}</div>
     </div>
    )})}
   </div>
  )}
 </LeadSheet>;
}

// ── HIỆU SUẤT BẾP (tháng này) ────────────────────────────────────────────
// Thay cho "Xưởng sản xuất bánh SUMI / Ca sản xuất hôm nay" (dư, đã có Tình
// trạng đơn hàng bên dưới lo phần đó) — yêu cầu 04/09/2026: 3 thẻ kiểu Nhân
// viên (Doanh thu/Giờ làm/Thưởng), MỖI thẻ gồm CẢ số của bếp lẫn số cá nhân,
// bấm vào xem chi tiết từng người/từng khoản.
const fmtVND=n=>new Intl.NumberFormat('vi-VN').format(Math.round(n||0))+'đ';
function dauThangDenNay(){
 const d=new Date();const p=n=>String(n).padStart(2,'0');
 const tu=new Date(d.getFullYear(),d.getMonth(),1);
 return{tu:`${tu.getFullYear()}-${p(tu.getMonth()+1)}-${p(tu.getDate())}`,den:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
}
async function fetchDoiCungKhau(station,boId){
 const{data,error}=await supabase.from('profiles').select('id,full_name')
  .eq('approved',true).neq('active',false).eq('station',station);
 if(error)throw error;
 // Bếp trưởng đang xem không có station cố định (hồ sơ thiếu dữ liệu) — ít
 // nhất vẫn tính được CHÍNH MÌNH, không để mảng rỗng làm mất luôn số cá nhân.
 return data&&data.length?data:(boId?[{id:boId,full_name:'Tôi'}]:[]);
}
async function fetchGioLamDoi(teamIds,tu,den){
 const[logs,configs]=await Promise.all([fetchShiftLogsRange(tu,den),fetchShiftConfigs()]);
 return teamIds.map(id=>({id,gio:Math.round((computeShiftHours(logs,configs,id,tu,den).hoursWorked||0)*10)/10}));
}
async function fetchThuongDoi(teamIds,tu,den){
 if(!teamIds.length)return[];
 const{data,error}=await supabase.from('staff_rewards').select('*')
  .in('staff_id',teamIds).gte('awarded_on',tu).lte('awarded_on',den)
  .order('awarded_on',{ascending:false});
 if(error)throw error;
 const rows=data||[];
 const nguoiTaoIds=[...new Set(rows.map(r=>r.created_by).filter(Boolean))];
 let tenTheoId={};
 if(nguoiTaoIds.length){
  const{data:ps}=await supabase.from('profiles').select('id,full_name').in('id',nguoiTaoIds);
  (ps||[]).forEach(p=>{tenTheoId[p.id]=p.full_name});
 }
 return rows.map(r=>({...r,ten_nguoi_thuong:tenTheoId[r.created_by]||'Sếp'}));
}

// Một nhân sự trong bảng "Giờ làm" — bấm vào MỞ RA (accordion, không phải
// modal chồng modal) danh sách vào/ra từng ngày trong tháng của người đó.
// Tải lười (chỉ khi bấm), gom logs kiểu giống hệt fetchMyAttendanceHistory
// (employeeOverviewV4.js) — KHÔNG viết lại cách ghép checkin/checkout.
function HangGioLam({nguoi,tenHienThi,laToi,tu,den}){
 const[mo,setMo]=useState(false);
 const[ngay,setNgay]=useState(null);
 const boMo=async()=>{
  const dangMo=!mo;setMo(dangMo);
  if(dangMo&&ngay===null){
   try{
    const logs=await fetchShiftLogsRange(tu,den);
    const cua=logs.filter(l=>l.staff_id===nguoi.id&&l.checkin_time);
    const theoNgay=new Map();
    cua.forEach(l=>{
     const r=theoNgay.get(l.work_date)||{date:l.work_date,checkin:null,checkout:null,tre:0};
     if(l.type==='checkin'){r.checkin=l.checkin_time;r.tre=l.late_minutes||0;}
     if(l.type==='checkout')r.checkout=l.checkin_time;
     theoNgay.set(l.work_date,r);
    });
    setNgay([...theoNgay.values()].sort((a,b)=>b.date<a.date?-1:1));
   }catch{setNgay([]);}
  }
 };
 const gio=iso=>iso?new Date(iso).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}):'--:--';
 return<div>
  <button onClick={boMo} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 4px',border:0,borderTop:'1px solid #f2ece3',background:'transparent',cursor:'pointer',textAlign:'left'}}>
   <strong style={{fontSize:14,color:'#2d1c10'}}>{tenHienThi}{laToi?' (tôi)':''}</strong>
   <span style={{display:'flex',alignItems:'center',gap:6}}>
    <span className="eov4-hours-pill">{nguoi.gio}h</span>
    <ChevronRight size={16} style={{transform:mo?'rotate(90deg)':'none',transition:'transform .15s',color:'#a08a72'}}/>
   </span>
  </button>
  {mo&&(
   ngay===null?<div className="eov4-empty-box">Đang tải…</div>:ngay.length===0?(
    <div className="eov4-empty-box">Chưa có dữ liệu chấm công tháng này.</div>
   ):(
    <div style={{padding:'0 4px 8px'}}>
     {ngay.map(n=>(
      <div key={n.date} style={{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'#5f4b3d',padding:'4px 0'}}>
       <span>{n.date}</span>
       <span>{gio(n.checkin)} → {gio(n.checkout)}{n.tre>0?<span style={{color:'#a52c22',fontWeight:800}}> · Trễ {n.tre}p</span>:null}</span>
      </div>
     ))}
    </div>
   )
  )}
 </div>;
}

function HieuSuatBepSheet({loai,onClose,doiRoster,tenTheoId,doanhThuBep,doanhThuCaNhan,donCuaBep,gioLamDoi,thuongDoi,profile,tu,den}){
 const[xemDon,setXemDon]=useState(null);      // orderId đang xem chi tiết
 if(loai==='doanhThu'){
  const donCoDoanhThu=(donCuaBep||[]).filter(o=>o.status_v2==='completed');
  return<LeadSheet title="💰 Doanh thu bếp (tháng này)" onClose={onClose}>
   <div className="eov4-kpi-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
    <div className="eov4-kpi-card eov4-kpi-green"><div className="eov4-kpi-value">{fmtVND(doanhThuBep)}</div><div className="eov4-kpi-label">Cả bếp ({donCoDoanhThu.length} đơn)</div></div>
    <div className="eov4-kpi-card eov4-kpi-blue"><div className="eov4-kpi-value">{fmtVND(doanhThuCaNhan)}</div><div className="eov4-kpi-label">Cá nhân tôi</div></div>
   </div>
   <div className="eov4-field-label" style={{marginTop:14}}>Đơn hoàn thành trong tháng — bấm để xem chi tiết đơn</div>
   {donCoDoanhThu.length===0?<div className="eov4-empty-box">Chưa có đơn hoàn thành nào tháng này.</div>:(
    <div className="eov4-table">{donCoDoanhThu.map(o=>(
     <button key={o.id} className="eov4-table-row" onClick={()=>setXemDon(o.id)} style={{width:'100%',border:0,background:'transparent',cursor:'pointer',textAlign:'left',font:'inherit'}}>
      <div className="eov4-table-main"><strong>#{o.order_code}</strong><span>{o.created_by_name||'—'}</span></div>
      <span style={{display:'flex',alignItems:'center',gap:4}}><span className="eov4-hours-pill">{fmtVND(o.total)}</span><ChevronRight size={14} color="#a08a72"/></span>
     </button>
    ))}</div>
   )}
   {xemDon&&<OrderV2DetailModal orderId={xemDon} onClose={()=>setXemDon(null)}/>}
  </LeadSheet>;
 }
 if(loai==='gioLam'){
  const tongBep=(gioLamDoi||[]).reduce((s,x)=>s+x.gio,0);
  const cuaToi=(gioLamDoi||[]).find(x=>x.id===profile?.id)?.gio||0;
  return<LeadSheet title="🕘 Giờ làm bếp (tháng này)" onClose={onClose}>
   <div className="eov4-kpi-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
    <div className="eov4-kpi-card eov4-kpi-green"><div className="eov4-kpi-value">{tongBep}h</div><div className="eov4-kpi-label">Cả bếp</div></div>
    <div className="eov4-kpi-card eov4-kpi-blue"><div className="eov4-kpi-value">{cuaToi}h</div><div className="eov4-kpi-label">Cá nhân tôi</div></div>
   </div>
   <div className="eov4-field-label" style={{marginTop:14}}>Từng nhân sự — bấm vào xem chi tiết vào/ra từng ngày</div>
   {!gioLamDoi||gioLamDoi.length===0?<div className="eov4-empty-box">Chưa có dữ liệu.</div>:(
    <div>{[...gioLamDoi].sort((a,b)=>b.gio-a.gio).map(x=>(
     <HangGioLam key={x.id} nguoi={x} tenHienThi={tenTheoId[x.id]||(x.id===profile?.id?'Tôi':'?')} laToi={x.id===profile?.id} tu={tu} den={den}/>
    ))}</div>
   )}
  </LeadSheet>;
 }
 // 'thuong'
 const tongBep=(thuongDoi||[]).reduce((s,r)=>s+Number(r.amount||0),0);
 const cuaToi=(thuongDoi||[]).filter(r=>r.staff_id===profile?.id);
 const tongCaNhan=cuaToi.reduce((s,r)=>s+Number(r.amount||0),0);
 const[xemThuong,setXemThuong]=useState(null); // reward đang mở chi tiết
 const HangThuong=({r,hienTen})=>(
  <button key={r.id} className="eov4-table-row" onClick={()=>setXemThuong(r)} style={{width:'100%',border:0,background:'transparent',cursor:'pointer',textAlign:'left',font:'inherit'}}>
   <div className="eov4-table-main"><strong>{hienTen?`${tenTheoId[r.staff_id]||'?'} — `:''}{r.title||'Thưởng nóng'}</strong><span>Từ {r.ten_nguoi_thuong} · {r.awarded_on}{r.note?` · ${r.note}`:''}</span></div>
   <span style={{display:'flex',alignItems:'center',gap:4}}>
    <span className="eov4-hours-pill">+{fmtVND(r.amount)}</span>
    <ChevronRight size={14} color="#a08a72"/>
   </span>
  </button>
 );
 // Nguồn thưởng — "liên kết đến từ đâu" đúng như yêu cầu gốc. Chỉ có 2 loại
 // link_type thật trong dữ liệu (task/order_created); loại khác hoặc không
 // có link thì chỉ ghi "Sếp tự chọn thưởng", không bịa thêm nguồn.
 const NHAN_NGUON={task:'Từ một việc đã hoàn thành',order_created:'Từ một đơn hàng đã tạo'};
 return<LeadSheet title="🎁 Thưởng bếp (tháng này)" onClose={onClose}>
  <div className="eov4-kpi-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
   <div className="eov4-kpi-card eov4-kpi-amber"><div className="eov4-kpi-value">{fmtVND(tongBep)}</div><div className="eov4-kpi-label">Cả bếp</div></div>
   <div className="eov4-kpi-card eov4-kpi-blue"><div className="eov4-kpi-value">{fmtVND(tongCaNhan)}</div><div className="eov4-kpi-label">Cá nhân tôi</div></div>
  </div>
  <div className="eov4-field-label" style={{marginTop:14}}>Thưởng của tôi — bấm vào xem chi tiết</div>
  {cuaToi.length===0?<div className="eov4-empty-box">Chưa có thưởng nào tháng này.</div>:(
   <div className="eov4-table">{cuaToi.map(r=><HangThuong key={r.id} r={r} hienTen={false}/>)}</div>
  )}
  <div className="eov4-field-label" style={{marginTop:14}}>Thưởng cả đội</div>
  {!thuongDoi||thuongDoi.length===0?<div className="eov4-empty-box">Chưa có thưởng nào tháng này.</div>:(
   <div className="eov4-table">{thuongDoi.map(r=><HangThuong key={r.id} r={r} hienTen={true}/>)}</div>
  )}
  {xemThuong&&(
   <div onClick={()=>setXemThuong(null)} style={{position:'fixed',inset:0,zIndex:1500,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:520,maxHeight:'88vh',overflowY:'auto',background:'#fffaf0',borderRadius:'22px 22px 0 0',padding:'20px 18px calc(20px + env(safe-area-inset-bottom))'}}>
     <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
      <div>
       <div style={{fontSize:11,fontWeight:800,color:'#a16207',textTransform:'uppercase'}}>Chi tiết thưởng</div>
       <h2 style={{margin:'4px 0 0',fontSize:20,fontWeight:900,color:'#2d1c10'}}>{xemThuong.title||'Thưởng nóng'}</h2>
      </div>
      <button onClick={()=>setXemThuong(null)} style={{border:0,background:'#f3eadf',width:36,height:36,borderRadius:12,fontSize:18,fontWeight:900,cursor:'pointer'}}>×</button>
     </div>
     <div style={{fontSize:30,fontWeight:900,color:'#c2790e',marginBottom:14}}>+{fmtVND(xemThuong.amount)}</div>
     <div className="eov4-table">
      <div className="eov4-table-row"><div className="eov4-table-main"><strong>Người được thưởng</strong></div><span>{tenTheoId[xemThuong.staff_id]||(xemThuong.staff_id===profile?.id?'Tôi':'?')}</span></div>
      <div className="eov4-table-row"><div className="eov4-table-main"><strong>Ai thưởng</strong></div><span>{xemThuong.ten_nguoi_thuong}</span></div>
      <div className="eov4-table-row"><div className="eov4-table-main"><strong>Ngày</strong></div><span>{xemThuong.awarded_on}</span></div>
      <div className="eov4-table-row"><div className="eov4-table-main"><strong>Nguồn</strong></div><span>{NHAN_NGUON[xemThuong.link_type]||'Sếp tự chọn thưởng'}</span></div>
     </div>
     {xemThuong.note&&<div style={{marginTop:12}}><div className="eov4-field-label">Lý do</div><div style={{fontSize:14,color:'#5f4b3d',lineHeight:1.5}}>{xemThuong.note}</div></div>}
     {xemThuong.photo_url&&<img src={xemThuong.photo_url} alt="Ảnh chứng từ thưởng" style={{width:'100%',borderRadius:14,marginTop:14}}/>}
    </div>
   </div>
  )}
 </LeadSheet>;
}

function HieuSuatBep({profile,ordersCuaKhau}){
 const[doi,setDoi]=useState(null);       // [{id,full_name}]
 const[gioLamDoi,setGioLamDoi]=useState(null);
 const[thuongDoi,setThuongDoi]=useState(null);
 const{tu,den}=useMemo(()=>dauThangDenNay(),[]);

 useEffect(()=>{
  let huy=false;
  fetchDoiCungKhau(profile?.station,profile?.id).then(async ds=>{
   if(huy)return;
   setDoi(ds);
   const ids=ds.map(x=>x.id);
   const[gl,th]=await Promise.all([fetchGioLamDoi(ids,tu,den).catch(()=>[]),fetchThuongDoi(ids,tu,den).catch(()=>[])]);
   if(!huy){setGioLamDoi(gl);setThuongDoi(th);}
  }).catch(()=>{if(!huy){setDoi([]);setGioLamDoi([]);setThuongDoi([]);}});
  return()=>{huy=true};
 },[profile?.station,profile?.id,tu,den]);

 const tenTheoId=useMemo(()=>{const m={};(doi||[]).forEach(p=>{m[p.id]=p.full_name});return m;},[doi]);

 const donThangNay=useMemo(()=>(ordersCuaKhau||[]).filter(o=>o.created_at&&o.created_at.slice(0,10)>=tu),[ordersCuaKhau,tu]);
 const doanhThuBep=useMemo(()=>donThangNay.filter(o=>o.status_v2==='completed').reduce((s,o)=>s+Number(o.total||0),0),[donThangNay]);
 const doanhThuCaNhan=useMemo(()=>donThangNay.filter(o=>o.status_v2==='completed'&&o.created_by_name===profile?.full_name).reduce((s,o)=>s+Number(o.total||0),0),[donThangNay,profile?.full_name]);
 const tongGio=(gioLamDoi||[]).reduce((s,x)=>s+x.gio,0);
 const cuaToiGio=(gioLamDoi||[]).find(x=>x.id===profile?.id)?.gio;
 const tongThuong=(thuongDoi||[]).reduce((s,r)=>s+Number(r.amount||0),0);

 const [sheet,setSheet]=useState(null);

 // Panel LỚN, nền xanh — đây là điểm nhấn tạo động lực cho cả bếp (yêu cầu
 // 04/09/2026), không phải một khối số liệu phụ nên KHÔNG dùng lưới 3 thẻ
 // nhỏ (eov4-kpi-grid) nữa. Mỗi hàng là MỘT nút bấm thật (cả hàng, không chỉ
 // con số) kèm mũi tên › để rõ ràng là bấm được, không dừng ở dạng tĩnh.
 const Hang=({Icon,nhan,soBep,soCaNhan,onClick})=>(
  <button onClick={onClick} style={{
   width:'100%',display:'flex',alignItems:'center',gap:12,
   padding:'14px 4px',border:0,borderTop:'1px solid rgba(255,255,255,.16)',
   background:'transparent',color:'#fff',textAlign:'left',cursor:'pointer',
  }}>
   <div style={{width:44,height:44,borderRadius:14,background:'rgba(255,255,255,.16)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <Icon size={22} color="#fff"/>
   </div>
   <div style={{flex:1,minWidth:0}}>
    <div style={{fontSize:12,fontWeight:800,opacity:.85}}>{nhan}</div>
    <div style={{fontSize:26,fontWeight:900,marginTop:2}}>{soBep}</div>
    <div style={{fontSize:12,fontWeight:700,opacity:.8,marginTop:1}}>Cá nhân tôi: {soCaNhan}</div>
   </div>
   <ChevronRight size={22} color="rgba(255,255,255,.75)"/>
  </button>
 );
 return<>
  <div style={{
   background:'linear-gradient(150deg,#17a367,#0b6b3f)',borderRadius:26,
   padding:'18px 16px 6px',marginBottom:16,boxShadow:'0 14px 34px rgba(11,107,63,.28)',
  }}>
   <div style={{fontSize:13,fontWeight:900,letterSpacing:'.04em',color:'#fff',display:'flex',alignItems:'center',gap:6}}>
    🏆 HIỆU SUẤT BẾP · THÁNG NÀY
   </div>
   <div style={{fontSize:11.5,color:'rgba(255,255,255,.75)',marginTop:2,marginBottom:4}}>
    Thành quả cả đội — bấm vào từng mục để xem chi tiết
   </div>
   <Hang Icon={IconMoneyUp} nhan="DOANH THU" soBep={fmtVND(doanhThuBep)} soCaNhan={fmtVND(doanhThuCaNhan)} onClick={()=>setSheet('doanhThu')}/>
   <Hang Icon={IconClock} nhan="GIỜ LÀM" soBep={gioLamDoi===null?'Đang tải…':`${tongGio}h`} soCaNhan={cuaToiGio===undefined?'…':`${cuaToiGio}h`} onClick={()=>setSheet('gioLam')}/>
   <Hang Icon={IconGift} nhan="THƯỞNG" soBep={thuongDoi===null?'Đang tải…':fmtVND(tongThuong)} soCaNhan={fmtVND((thuongDoi||[]).filter(r=>r.staff_id===profile?.id).reduce((s,r)=>s+Number(r.amount||0),0))} onClick={()=>setSheet('thuong')}/>
  </div>
  {sheet&&<HieuSuatBepSheet loai={sheet} onClose={()=>setSheet(null)}
   doiRoster={doi} tenTheoId={tenTheoId} doanhThuBep={doanhThuBep} doanhThuCaNhan={doanhThuCaNhan}
   donCuaBep={donThangNay} gioLamDoi={gioLamDoi} thuongDoi={thuongDoi} profile={profile} tu={tu} den={den}/>}
 </>;
}

function LeadHome({orders,tasks,onNavigate,profile}){
 const maKhau=MA_KHAU_BEP_THEO_BO_PHAN[boPhanCuaHoSo(profile)];
 // Không xác định được khâu (dữ liệu thiếu station) thì hiện nguyên danh sách
 // — thà thấy dư còn hơn dữ liệu biến mất không rõ lý do.
 const ordersCuaKhau=maKhau?orders.filter(o=>Array.isArray(o.kitchen_codes)&&o.kitchen_codes.includes(maKhau)):orders;
 const[sheetMo,setSheetMo]=useState(null);
 return <>
  <TodayAttendanceWidget profile={profile} onNavigate={onNavigate}/>
  <HieuSuatBep profile={profile} ordersCuaKhau={ordersCuaKhau}/>
  <SectionHead title="👤 TÔI (QUẢN TRỊ & TIỆN ÍCH ĐIỀU HÀNH)"/>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
   {O_DIEU_HANH_BEP_TRUONG.map(o=>{const Icon=o.Icon;return(
    <div key={o.ten} onClick={()=>o.tab?onNavigate(o.tab):setSheetMo(o.sheet)} style={{background:'#fff',border:'1.5px solid #eadcca',borderRadius:18,padding:'12px 14px',cursor:'pointer',boxShadow:'0 2px 8px rgba(0,0,0,0.03)',display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:88,boxSizing:'border-box'}}>
     <div style={{width:38,height:38,borderRadius:12,background:o.nen,display:'flex',alignItems:'center',justifyContent:'center'}}><Icon size={21} color={o.mau} strokeWidth={1.9}/></div>
     <div style={{marginTop:8}}><div style={{fontSize:13.5,fontWeight:800,color:'#2d1c10'}}>{o.ten}</div><div style={{fontSize:11,color:'#725f50',marginTop:1}}>{o.phu}</div></div>
    </div>
   )})}
  </div>
  <OrderStatusOverview orders={ordersCuaKhau} onNavigate={onNavigate}/>
  <SectionHead title="TIẾN ĐỘ SẢN XUẤT" value={`${tasks.length} việc`}/>
  <TaskQueue tasks={tasks}/>
  <div className="sumi-flow-note">Bếp trưởng duyệt "Hoàn thành" thì hệ thống mới nhập kho thành phẩm. Nhân viên báo làm xong chưa tự cộng kho.</div>
  {sheetMo==='donTu'&&<DonTuXinNghiSheet hoSo={profile} onClose={()=>setSheetMo(null)}/>}
  {sheetMo==='baoCao'&&<BaoCaoNgaySheet hoSo={profile} onClose={()=>setSheetMo(null)}/>}
  {sheetMo==='khoTP'&&<div style={{position:'fixed',inset:0,zIndex:1400,background:'#fdf9f2',overflowY:'auto',padding:16,boxSizing:'border-box'}}><FinishedGoodsInventoryV2 onBack={()=>setSheetMo(null)}/></div>}
 </>;
}
function TaskQueue({tasks}){return <div className="sumi-task-queue">{tasks.map((t,i)=><button key={t.id}><b>{i+2}</b><span><strong>{t.title}</strong><small>{t.order_code?`Đơn ${t.order_code}`:'Việc trong ngày'}</small></span><em>{t.status==='in_progress'?'ĐANG LÀM':'CHỜ'}</em></button>)}</div>}
