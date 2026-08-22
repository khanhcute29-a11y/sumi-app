import React, { useEffect, useMemo, useState } from 'react';
import { listOrdersV2 } from '../lib/featureFlags';
import { loadFeatureFlags } from '../lib/featureFlags';
import CreateOrderV2Modal from '../components/CreateOrderV2Modal';
import OrderV2DetailModal from '../components/OrderV2DetailModal';
import { useAuth } from '../lib/AuthContext';

const LABELS = {
  awaiting_assignment: 'Chờ nhận', awaiting_acceptance: 'Chờ bếp nhận', in_production: 'Đang làm',
  ready_for_fulfillment: 'Chờ vận chuyển', in_delivery: 'Đang vận chuyển', completed: 'Hoàn thành', cancelled: 'Đã huỷ',
};

export default function OrdersV2Screen() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try { setOrders(await listOrdersV2()); }
    catch (err) { setError(err?.message || 'Không tải được danh sách đơn hàng.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); loadFeatureFlags().then(f=>setCanCreate(f.orders_v2_write)); }, []);
  useEffect(() => { const open=()=>setShowCreate(true); window.addEventListener('sumi-create-order',open); return()=>window.removeEventListener('sumi-create-order',open); }, []);
  useEffect(() => { const open=(event)=>{ if(event.detail?.entityId) setSelectedId(event.detail.entityId); }; window.addEventListener('sumi-open-order',open); return()=>window.removeEventListener('sumi-open-order',open); }, []);
  const roleCanCreate=['owner','admin','cashier','sale','kitchen_lead'].includes(profile?.role)||(profile?.extra_roles||[]).some(r=>['owner','admin','cashier','sale','kitchen_lead'].includes(r));
  const shown = useMemo(() => filter === 'all' ? orders : orders.filter(o => o.status_v2 === filter), [orders, filter]);
  const filters = ['all','awaiting_assignment','in_production','ready_for_fulfillment','in_delivery','completed'];
  const stage=(s)=>s==='completed'?5:s==='in_delivery'?4:s==='ready_for_fulfillment'?3:s==='in_production'?2:1;
  if(showCreate)return <CreateOrderV2Modal embedded onClose={()=>setShowCreate(false)} onCreated={load}/>;
  return <div className="mock-orders">
    <div className="mock-page-head">
      <div><small>THEO DÕI XUYÊN SUỐT</small><h1>Đơn hàng</h1><p>{orders.length} đơn đang hiển thị</p></div>
      {(canCreate||roleCanCreate)&&<button onClick={()=>setShowCreate(true)}>＋ TẠO ĐƠN</button>}
    </div>
    <div className="mock-order-tabs">
      {filters.map(key => <button className={filter===key?'active':''} key={key} onClick={()=>setFilter(key)}>
        {key==='all'?'Tất cả':LABELS[key]}{key!=='all'?` · ${orders.filter(o=>o.status_v2===key).length}`:''}
      </button>)}
    </div>
    {error && <div className="mock-empty" role="alert"><span>⚠️</span><h2>Chưa tải được đơn hàng</h2><p>{error}</p><button onClick={load}>TẢI LẠI</button></div>}
    {loading ? <div className="mock-empty">Đang tải đơn...</div> : !error && shown.map(o => <button className="mock-order-card" key={o.id} onClick={()=>setSelectedId(o.id)}>
      <div className="mock-order-top"><strong>#{o.order_code || 'CHƯA CÓ MÃ'}</strong><span>{LABELS[o.status_v2] || o.status_v2}</span></div>
      <h2>{o.customer_name || o.order_type || 'Đơn sản xuất'}</h2>
      <p>{o.total_quantity || 0} sản phẩm · {o.completed_package_count || 0}/{o.package_count || 0} phần đã xong</p>
      <div className="mock-track">{[1,2,3,4,5].map(n=><i key={n} className={n<=stage(o.status_v2)?'done':''}/>)}</div>
      <div className="mock-track-label"><span>Chờ nhận</span><b>{LABELS[o.status_v2] || o.status_v2}</b><span>Hoàn thành</span></div>
      <time>{o.required_at ? `Cần giao ${new Date(o.required_at).toLocaleString('vi-VN')}` : 'Chưa đặt giờ giao'}</time>
    </button>)}
    {!loading && !error && shown.length===0 && <div className="mock-empty"><span>📦</span><h2>Chưa có đơn trong mục này</h2><p>Bấm “Tạo đơn” để bắt đầu luồng công việc mới.</p></div>}
    {selectedId&&<OrderV2DetailModal orderId={selectedId} onClose={()=>setSelectedId(null)} onChanged={load}/>} 
  </div>;
}
