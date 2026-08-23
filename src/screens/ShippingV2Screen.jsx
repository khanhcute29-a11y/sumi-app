import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { VoiceMicButton } from '../components/VoiceMicButton';
import OrderV2DetailModal from '../components/OrderV2DetailModal';

const button = {
  minHeight: 48,
  border: 0,
  borderRadius: 14,
  padding: '0 16px',
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer'
};

const gps = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Thiết bị không hỗ trợ định vị GPS'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(new Error('Vui lòng bật GPS trên điện thoại để xác thực vị trí giao hàng')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

export default function ShippingV2Screen() {
  const { profile } = useAuth();
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const manager = ['owner', 'admin', 'transport_lead'].some(
    r => r === profile?.role || (profile?.extra_roles || []).includes(r)
  );

  const load = async () => {
    const { data, error: runErr } = await supabase
      .from('delivery_runs')
      .select('id,run_code,status,version,provider,provider_label,shipping_fee,planned_distance_km,started_at,completed_at,assigned_driver_id,profiles:assigned_driver_id(full_name),delivery_stops(id,order_id,sequence_no,status,destination_address,delivered_at,orders(id,order_code,phone,address,note,required_at,order_type,status_v2,customer:customers(id,name,phone),order_items(id,name_snapshot,quantity,unit,specification)))')
      .order('created_at', { ascending: false });

    if (runErr) throw runErr;
    setRuns(data || []);
  };

  useEffect(() => {
    load().catch(e => setError(e.message));
  }, []);

  const rpc = async (name, args) => {
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc(name, args);
      if (rpcErr) throw rpcErr;
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const accept = r =>
    rpc('accept_delivery_run_v2', {
      p_idempotency_key: crypto.randomUUID(),
      p_run_id: r.id,
      p_expected_version: r.version
    });

  const start = async r => {
    try {
      let p = { lat: null, lng: null };
      try {
        p = await gps();
      } catch (e) {
        if (r.provider === 'internal') throw e;
      }
      await rpc('start_delivery_run_v3', {
        p_idempotency_key: crypto.randomUUID(),
        p_run_id: r.id,
        p_expected_version: r.version,
        p_lat: p.lat,
        p_lng: p.lng
      });
    } catch (e) {
      setError(e.message || 'Không lấy được GPS khi bắt đầu chuyến');
    }
  };

  // Tính thống kê nhanh cho tài xế
  const myCompletedRuns = runs.filter(r => r.assigned_driver_id === profile?.id && r.status === 'completed');
  const myTotalKm = myCompletedRuns.reduce((sum, r) => sum + (Number(r.planned_distance_km) || 0), 0);

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {manager && <DispatchPanel onCreated={load} setError={setError} />}

      {/* Header & Thống kê KPI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>🚚 Đội Vận Tải & Chuyến Giao</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
            Tài xế: <b>{profile?.full_name}</b> · Định vị GPS & Ảnh hoàn thành bắt buộc
          </p>
        </div>

        {myCompletedRuns.length > 0 && (
          <div style={{ padding: '8px 14px', borderRadius: 12, background: 'var(--surface-sunken)', fontSize: 13 }}>
            <div>Đã giao: <b>{myCompletedRuns.length} chuyến</b></div>
            <div style={{ color: 'var(--brand-primary)', fontWeight: 800 }}>Quãng đường: {myTotalKm.toFixed(1)} km</div>
          </div>
        )}
      </div>

      {/* Banner cảnh báo nhận bánh */}
      <div style={{ padding: '12px 14px', borderRadius: 14, background: '#fff0d4', border: '1px solid #d7c3aa', color: '#2d1c10', fontSize: 13 }}>
        <strong style={{ color: '#b93e13', display: 'block', marginBottom: 2 }}>
          ⚠️ LƯU Ý BẮT BUỘC KHI NHẬN GIAO:
        </strong>
        Kiểm tra kỹ mẫu bánh & số lượng trước khi rời xưởng. Khi đến nơi khách nhận nếu thiếu hoặc không có bánh sẽ tính lỗi cho người nhận đơn!
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 12, background: '#fee', color: '#b42318', fontWeight: 700, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Danh sách các chuyến giao */}
      {runs.map(r => {
        const isMine = r.assigned_driver_id === profile?.id;
        return (
          <div
            key={r.id}
            style={{
              padding: 16, borderRadius: 20, background: 'var(--surface-card)',
              border: isMine ? '2px solid var(--brand-primary)' : '1px solid var(--border-default)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 18, color: 'var(--text-primary)' }}>{r.run_code}</strong>
              <span style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 999, fontWeight: 800,
                background: r.status === 'completed' ? '#e6f6ed' : r.status === 'in_transit' ? '#fff0d4' : '#f4efe8',
                color: r.status === 'completed' ? '#087f5b' : r.status === 'in_transit' ? '#b93e13' : '#725f50'
              }}>
                {r.status === 'completed' ? '✅ Hoàn thành' : r.status === 'in_transit' ? '🛵 Đang đi giao' : r.status === 'accepted' ? '📋 Đã nhận chuyến' : '⏳ Chờ nhận'}
              </span>
            </div>

            <div style={{ margin: '8px 0', fontSize: 14, color: 'var(--text-secondary)' }}>
              {r.delivery_stops?.length || 0} điểm giao · {r.planned_distance_km ? `${r.planned_distance_km} km kế hoạch` : 'Chưa tính km'}
            </div>

            <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Tài xế: {r.provider === 'internal' ? (r.profiles?.full_name || 'Nhân viên SUMI') : (r.provider_label || 'Đối tác')}
              {r.shipping_fee != null ? ` · Phí ship ${Number(r.shipping_fee).toLocaleString('vi-VN')}đ` : ''}
            </div>

            {/* Nút hành động */}
            {r.status === 'planned' && r.provider === 'internal' && (
              <button
                disabled={busy}
                onClick={() => accept(r)}
                style={{ ...button, width: '100%', background: 'var(--brand-primary)', color: 'white', marginBottom: 8 }}
              >
                ✓ Nhận chuyến giao
              </button>
            )}

            {((r.status === 'accepted' && r.provider === 'internal') || (r.status === 'planned' && r.provider !== 'internal')) && (
              <button
                disabled={busy}
                onClick={() => start(r)}
                style={{ ...button, width: '100%', background: '#087f5b', color: 'white', marginBottom: 8 }}
              >
                📍 Bật GPS & Bắt đầu đi giao
              </button>
            )}

            {/* Các điểm dừng giao bánh */}
            {r.delivery_stops
              ?.sort((a, b) => a.sequence_no - b.sequence_no)
              .map(s => (
                <StopCard
                  key={s.id}
                  stop={s}
                  runActive={r.status === 'in_transit'}
                  onViewOrder={id => setSelectedOrderId(id)}
                  onDone={load}
                  setError={setError}
                />
              ))}
          </div>
        );
      })}

      {!runs.length && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Chưa có chuyến giao hàng nào
        </div>
      )}

      {/* Modal chi tiết toàn bộ luồng đơn hàng */}
      {selectedOrderId && (
        <OrderV2DetailModal
          orderId={selectedOrderId}
          onClose={() => {
            setSelectedOrderId(null);
            load();
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}

function DispatchPanel({ onCreated, setError }) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [driver, setDriver] = useState('');
  const [provider, setProvider] = useState('internal');
  const [providerLabel, setProviderLabel] = useState('Grab');
  const [fee, setFee] = useState('');
  const [km, setKm] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [o, d] = await Promise.all([
      supabase
        .from('order_operations_list')
        .select('id,order_code,address,required_at,status_v2')
        .eq('status_v2', 'ready_for_fulfillment')
        .order('required_at'),
      supabase
        .from('profiles')
        .select('id,full_name,role,extra_roles')
        .eq('approved', true)
        .eq('active', true)
    ]);
    if (o.error) throw o.error;
    if (d.error) throw d.error;
    setOrders(o.data || []);
    setDrivers((d.data || []).filter(x => x.role === 'shipper' || (x.extra_roles || []).includes('shipper')));
  };

  useEffect(() => {
    if (open) load().catch(e => setError(e.message));
  }, [open]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      if (!selected.length) throw new Error('Chọn ít nhất một đơn');
      if (provider === 'internal' && !driver) throw new Error('Chọn tài xế');
      if (provider !== 'internal' && !providerLabel.trim()) throw new Error('Nhập tên đơn vị giao');
      const { error: rpcErr } = await supabase.rpc('create_delivery_run_v3', {
        p_idempotency_key: crypto.randomUUID(),
        p_driver_id: provider === 'internal' ? driver : null,
        p_order_ids: selected,
        p_planned_distance_km: km ? Number(km) : null,
        p_provider: provider,
        p_provider_label: provider === 'internal' ? null : providerLabel.trim(),
        p_shipping_fee: fee ? Number(fee) : null
      });
      if (rpcErr) throw rpcErr;
      setOpen(false);
      setSelected([]);
      await onCreated();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ ...button, width: '100%', background: 'var(--brand-primary)', color: 'white' }}
      >
        ＋ Điều phối chuyến giao mới
      </button>
    );
  }

  return (
    <div style={{ padding: 16, borderRadius: 20, background: 'var(--surface-card)', border: '2px solid var(--brand-primary)', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>Điều phối chuyến giao</h3>
        <button onClick={() => setOpen(false)} style={{ border: 0, background: 'none', fontSize: 24, cursor: 'pointer' }}>
          ✕
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 10px' }}>
        Chọn các đơn đã hoàn thành làm bánh để gom chuyến cho tài xế.
      </p>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {orders.map(o => (
          <label key={o.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-default)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={e => setSelected(x => e.target.checked ? [...x, o.id] : x.filter(id => id !== o.id))}
            />
            <span style={{ fontSize: 14 }}>
              <b>{o.order_code}</b>
              <br />
              <small style={{ color: 'var(--text-muted)' }}>
                {o.address || 'Nhận tại quầy'} · {o.required_at ? new Date(o.required_at).toLocaleString('vi-VN') : ''}
              </small>
            </span>
          </label>
        ))}
      </div>
      {!orders.length && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có đơn chờ giao.</p>}

      <select
        value={provider}
        onChange={e => {
          setProvider(e.target.value);
          if (e.target.value === 'grab') setProviderLabel('Grab');
        }}
        style={{ width: '100%', minHeight: 46, borderRadius: 12, marginTop: 10, padding: '0 10px', fontSize: 15 }}
      >
        <option value="internal">Nhân viên SUMI</option>
        <option value="grab">Grab</option>
        <option value="external">Đơn vị giao khác</option>
      </select>

      {provider === 'internal' ? (
        <select
          value={driver}
          onChange={e => setDriver(e.target.value)}
          style={{ width: '100%', minHeight: 46, borderRadius: 12, marginTop: 8, padding: '0 10px', fontSize: 15 }}
        >
          <option value="">Chọn tài xế giao</option>
          {drivers.map(x => (
            <option key={x.id} value={x.id}>{x.full_name}</option>
          ))}
        </select>
      ) : (
        <input
          value={providerLabel}
          onChange={e => setProviderLabel(e.target.value)}
          placeholder="Tên đơn vị / người giao"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 46, borderRadius: 12, padding: '0 10px', marginTop: 8, fontSize: 15 }}
        />
      )}

      <input
        type="number"
        min="0"
        step="1000"
        value={fee}
        onChange={e => setFee(e.target.value)}
        placeholder="Phí giao hàng (VNĐ)"
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 46, borderRadius: 12, padding: '0 10px', marginTop: 8, fontSize: 15 }}
      />
      <input
        type="number"
        min="0"
        step="0.1"
        value={km}
        onChange={e => setKm(e.target.value)}
        placeholder="Km kế hoạch (tùy chọn)"
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 46, borderRadius: 12, padding: '0 10px', marginTop: 8, fontSize: 15 }}
      />

      <button
        disabled={busy || !selected.length || (provider === 'internal' && !driver)}
        onClick={create}
        style={{ ...button, width: '100%', marginTop: 10, background: '#087f5b', color: 'white' }}
      >
        {busy ? 'Đang tạo...' : `Tạo chuyến · ${selected.length} đơn`}
      </button>
    </div>
  );
}

function StopCard({ stop, runActive, onViewOrder, onDone, setError }) {
  const { profile } = useAuth();
  const [recipient, setRecipient] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const done = async () => {
    setBusy(true);
    setError('');
    try {
      if (!file) throw new Error('BẮT BUỘC CHỤP ẢNH BÁNH GIAO CHO KHÁCH để hoàn thành đơn!');
      if (!recipient.trim()) throw new Error('Vui lòng nhập tên người nhận bánh.');

      // Bắt buộc lấy GPS
      const p = await gps();

      const path = `orders/${stop.order_id}/delivery/${crypto.randomUUID()}-${file.name}`;
      const up = await supabase.storage.from('uploads').upload(path, file);
      if (up.error) throw up.error;

      const att = await supabase
        .from('order_attachments')
        .insert({
          order_id: stop.order_id,
          attachment_type: 'delivery_proof',
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          created_by: profile.id,
          gps_lat: p.lat,
          gps_lng: p.lng
        })
        .select('id')
        .single();
      if (att.error) throw att.error;

      const x = await supabase.rpc('complete_delivery_stop', {
        p_idempotency_key: crypto.randomUUID(),
        p_stop_id: stop.id,
        p_proof_attachment_id: att.data.id,
        p_lat: p.lat,
        p_lng: p.lng,
        p_recipient: recipient.trim()
      });
      if (x.error) throw x.error;
      await onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const map = stop.destination_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.destination_address)}`
    : '#';

  const order = stop.orders;
  const items = order?.order_items || [];
  const customerName = order?.customer?.name || 'Khách lẻ';
  const customerPhone = order?.phone || order?.customer?.phone;

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 15, color: 'var(--text-primary)' }}>
          Điểm {stop.sequence_no} · Đơn #{order?.order_code || stop.order_id?.slice(0, 8)}
        </b>
        {stop.status === 'delivered' ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: '#087f5b' }}>
            ✅ Đã giao {stop.delivered_at ? new Date(stop.delivered_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#b93e13', background: '#fff0d4', padding: '2px 8px', borderRadius: 999 }}>
            🛵 Đang đi giao
          </span>
        )}
      </div>

      {/* Thông tin khách hàng & Ghi chú */}
      <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff', borderRadius: 10, border: '1px solid var(--border-default)', fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
          <span>👤 Khách: <b>{customerName}</b></span>
          {customerPhone && (
            <a
              href={`tel:${customerPhone}`}
              style={{ color: '#087f5b', fontWeight: 800, textDecoration: 'none', background: '#e6f6ed', padding: '2px 8px', borderRadius: 6 }}
            >
              📞 Gọi: {customerPhone}
            </a>
          )}
        </div>

        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
          📍 <b>Địa chỉ:</b> {stop.destination_address || order?.address || 'Chưa có địa chỉ'}
        </div>

        {items.length > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border-default)' }}>
            <strong style={{ color: 'var(--brand-primary)', fontSize: 12 }}>🎂 BÁNH CẦN GIAO:</strong>
            {items.map(it => (
              <div key={it.id} style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>
                • <b>{it.quantity} {it.unit || 'cái'}</b> - {it.name_snapshot}
              </div>
            ))}
          </div>
        )}

        {order?.note && (
          <div style={{ marginTop: 4, color: '#b93e13', fontSize: 12, fontStyle: 'italic' }}>
            💬 Ghi chú: {order.note}
          </div>
        )}
      </div>

      {/* Nút xem toàn bộ luồng đơn hàng */}
      <button
        type="button"
        onClick={() => onViewOrder?.(stop.order_id)}
        style={{
          width: '100%', minHeight: 38, border: '1px solid var(--border-default)', borderRadius: 10,
          background: '#fff', color: 'var(--brand-primary)', fontWeight: 800, fontSize: 13,
          cursor: 'pointer', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
        }}
      >
        🔍 Xem chi tiết đơn hàng & Mẫu bánh
      </button>

      {stop.status !== 'delivered' && runActive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <a
            href={map}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'grid', placeItems: 'center', minHeight: 44, borderRadius: 12,
              background: '#e7f5ff', color: '#075985', textDecoration: 'none', fontWeight: 800, fontSize: 14
            }}
          >
            🗺️ Mở chỉ đường Google Maps
          </a>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="Tên khách nhận bánh (Bắt buộc)"
              style={{ flex: 1, minHeight: 46, borderRadius: 12, padding: '0 12px', fontSize: 15, border: '1px solid var(--border-default)' }}
            />
            <VoiceMicButton onTranscript={setRecipient} />
          </div>

          <label
            style={{
              display: 'grid', placeItems: 'center', minHeight: 48, borderRadius: 12,
              background: file ? '#e6f6ed' : '#fff', border: '1px solid var(--border-default)',
              color: file ? '#087f5b' : 'var(--text-primary)', fontWeight: 800, fontSize: 14, cursor: 'pointer'
            }}
          >
            📷 {file ? `✓ Đã chọn ảnh: ${file.name}` : '📸 Chụp ảnh bánh khi giao (BẮT BUỘC)'}
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => e.target.files[0] && setFile(e.target.files[0])}
            />
          </label>

          <button
            disabled={busy || !file || !recipient.trim()}
            onClick={done}
            style={{
              ...button, width: '100%',
              background: (!file || !recipient.trim()) ? 'var(--border-default)' : '#087f5b',
              color: 'white', fontSize: 16
            }}
          >
            {busy ? 'Đang gửi GPS & ảnh...' : '✓ Xác nhận giao xong (Lấy GPS & Ảnh)'}
          </button>
        </div>
      )}
    </div>
  );
}

