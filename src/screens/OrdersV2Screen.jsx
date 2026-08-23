import React, { useEffect, useMemo, useState } from 'react';
import { listOrdersV2 } from '../lib/featureFlags';
import { loadFeatureFlags } from '../lib/featureFlags';
import CreateOrderV2Modal from '../components/CreateOrderV2Modal';
import OrderV2DetailModal from '../components/OrderV2DetailModal';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';

const LABELS = {
  awaiting_assignment: 'Đơn chờ làm', awaiting_acceptance: 'Đơn chờ làm', in_production: 'Bếp đang làm',
  ready_for_fulfillment: 'Chờ vận chuyển', in_delivery: 'Đang vận chuyển', completed: 'Giao thành công', cancelled: 'Đã huỷ',
};

const FILTERS = [
  { key: 'waiting', label: 'Đơn chờ làm', match: o => ['awaiting_assignment','awaiting_acceptance'].includes(o.status_v2) && !o.is_overdue },
  { key: 'production', label: 'Bếp đang làm', match: o => o.status_v2 === 'in_production' && !o.is_overdue },
  { key: 'ready', label: 'Chờ vận chuyển', match: o => o.status_v2 === 'ready_for_fulfillment' && !o.is_overdue },
  { key: 'delivery', label: 'Đang vận chuyển', match: o => o.status_v2 === 'in_delivery' && !o.is_overdue },
  { key: 'completed', label: 'Giao thành công', match: o => o.status_v2 === 'completed' },
  { key: 'overdue', label: 'Chưa thực hiện', match: o => Boolean(o.is_overdue) },
];

const minutesText = value => {
  if (value === null || value === undefined) return '';
  const hours = Math.floor(value / 60); const minutes = value % 60;
  return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
};

export default function OrdersV2Screen() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try { await supabase.rpc('enqueue_order_operational_alerts'); setOrders(await listOrdersV2()); }
    catch (err) { setError(err?.message || 'Không tải được danh sách đơn hàng.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); loadFeatureFlags().then(f=>setCanCreate(f.orders_v2_write)); }, []);
  useEffect(() => { const open=()=>setShowCreate(true); window.addEventListener('sumi-create-order',open); return()=>window.removeEventListener('sumi-create-order',open); }, []);
  useEffect(() => { const open=(event)=>{ if(event.detail?.entityId) setSelectedId(event.detail.entityId); }; window.addEventListener('sumi-open-order',open); return()=>window.removeEventListener('sumi-open-order',open); }, []);
  useEffect(() => { const select=(event)=>setFilter(event.detail?.filter||null); window.addEventListener('sumi-order-filter',select); return()=>window.removeEventListener('sumi-order-filter',select); }, []);
  const roleCanCreate=['owner','admin','cashier','sale','kitchen_lead'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['owner','admin','cashier','sale','kitchen_lead'].includes(r));
  const shown = useMemo(() => filter ? orders.filter(FILTERS.find(x => x.key === filter)?.match || (()=>true)) : [], [orders, filter]);
  const stage=(s)=>s==='completed'?5:s==='in_delivery'?4:s==='ready_for_fulfillment'?3:s==='in_production'?2:1;
  if(showCreate)return <CreateOrderV2Modal embedded onClose={()=>setShowCreate(false)} onCreated={load}/>;
  return <div className="mock-orders">
    <div className="mock-page-head">
      <div><small>THEO DÕI XUYÊN SUỐT</small><h1>Đơn hàng</h1><p>{orders.length} đơn đang hiển thị</p></div>
      {(canCreate||roleCanCreate)&&<button onClick={()=>setShowCreate(true)}>＋ TẠO ĐƠN</button>}
    </div>
    {!filter&&<div className="mock-order-overview">
      {FILTERS.map(item => <button className={filter===item.key?'active':''} key={item.key} onClick={()=>setFilter(item.key)}>
        <span>{item.key==='waiting'?'📥':item.key==='production'?'👩‍🍳':item.key==='ready'?'📦':item.key==='delivery'?'🛵':item.key==='completed'?'✅':'⚠️'}</span><strong>{item.label}</strong><b>{orders.filter(item.match).length}</b>
      </button>)}
    </div>}
    {filter&&<div className="mock-list-head"><button onClick={()=>setFilter(null)}>← Tổng quan</button><strong>{FILTERS.find(x=>x.key===filter)?.label}</strong></div>}
    {error && <div className="mock-empty" role="alert"><span>⚠️</span><h2>Chưa tải được đơn hàng</h2><p>{error}</p><button onClick={load}>TẢI LẠI</button></div>}
    {loading ? <div className="mock-empty">Đang tải đơn...</div> : !error && filter && shown.map(o => <button className="mock-order-card" key={o.id} onClick={()=>setSelectedId(o.id)}>
      <div className="mock-order-top"><strong>#{o.order_code || 'CHƯA CÓ MÃ'}</strong><span className={o.is_overdue?'is-overdue':''}>{o.is_overdue?'⚠️ Chưa thực hiện':(LABELS[o.status_v2] || o.status_v2)}</span></div>
      <h2>{o.customer_name || 'Khách chưa ghi tên'}</h2>
      <p><b>{o.order_type_label || o.order_type || 'Đơn sản xuất'}</b> · {o.address || 'Nhận tại quầy'}</p>
      <p>Tạo lúc {new Date(o.created_at).toLocaleString('vi-VN')} · {o.total_quantity || 0} sản phẩm</p>
      <div className="mock-track">{[1,2,3,4,5].map(n=><i key={n} className={n<=stage(o.status_v2)?'done':''}/>)}</div>
      <div className="mock-track-label"><span>Chờ nhận</span><b>{LABELS[o.status_v2] || o.status_v2}</b><span>Hoàn thành</span></div>
      {o.status_v2==='in_production'&&o.production_started_at&&<p className="mock-order-metric">👨‍🍳 Bếp đã làm {minutesText(Math.max(0,Math.floor((Date.now()-new Date(o.production_started_at))/60000)))}</p>}
      {o.production_minutes!==null&&o.production_minutes!==undefined&&<p className="mock-order-metric">✅ Thời gian bếp: {minutesText(o.production_minutes)}</p>}
      {o.status_v2==='in_delivery'&&o.delivery_started_at&&<p className="mock-order-metric">🚚 Đang giao {minutesText(Math.max(0,Math.floor((Date.now()-new Date(o.delivery_started_at))/60000)))} · {o.driver_name||o.provider_label||'Chưa rõ người giao'}</p>}
      {o.delivery_minutes!==null&&o.delivery_minutes!==undefined&&<p className="mock-order-metric">✅ Thời gian giao: {minutesText(o.delivery_minutes)}{o.driver_name||o.provider_label?` · ${o.driver_name||o.provider_label}`:''}</p>}
      {o.shipping_fee!==null&&o.shipping_fee!==undefined&&<p className="mock-order-metric">Phí giao: {Number(o.shipping_fee).toLocaleString('vi-VN')}đ</p>}
      {o.production_started_at&&<p className="mock-order-time">Nhận đơn: {new Date(o.production_started_at).toLocaleString('vi-VN')}</p>}
      {o.production_completed_at&&<p className="mock-order-time">Bếp hoàn thành: {new Date(o.production_completed_at).toLocaleString('vi-VN')}</p>}
      {o.delivery_started_at&&<p className="mock-order-time">Bắt đầu giao: {new Date(o.delivery_started_at).toLocaleString('vi-VN')}</p>}
      {o.delivery_completed_at&&<p className="mock-order-time">Giao xong: {new Date(o.delivery_completed_at).toLocaleString('vi-VN')}</p>}
      {o.is_overdue&&<div className="mock-order-overdue"><b>Quá giờ {minutesText(o.overdue_minutes)}</b><span>{o.overdue_stage}</span></div>}
      <time>{o.required_at ? `Cần giao ${new Date(o.required_at).toLocaleString('vi-VN')}` : 'Chưa đặt giờ giao'}</time>
    </button>)}
    {!loading && !error && filter && shown.length===0 && <div className="mock-empty"><span>📦</span><h2>Chưa có đơn trong mục này</h2><p>Bấm “Tạo đơn” để bắt đầu luồng công việc mới.</p></div>}
    {selectedId&&<OrderV2DetailModal orderId={selectedId} onClose={()=>setSelectedId(null)} onChanged={load}/>} 
  </div>;
}
