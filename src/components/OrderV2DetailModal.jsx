import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { assignOrderPackage, acceptOrderPackage } from '../lib/featureFlags';
import { useAuth } from '../lib/AuthContext';
import PackageTaskPanel from './PackageTaskPanel';
import { CommentSection } from './CommentSection';

const box = {
  padding: 16,
  border: '1px solid var(--border-default)',
  borderRadius: 18,
  background: 'var(--surface-card)',
  marginBottom: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
};

// Chuyển đổi specification JSON thành text tiếng Việt thân thiện, bỏ code tiếng Anh
function formatSpecificationLines(spec = {}) {
  if (!spec || typeof spec !== 'object') return [];
  const lines = [];

  // Bánh kem & bánh lạnh
  if (spec.size) {
    const sizeStr = String(spec.size).trim();
    lines.push(`Size: ${sizeStr}${isNaN(sizeStr) ? '' : 'cm'}`);
  }
  if (spec.content) {
    lines.push(`Chữ trên bánh: "${spec.content}"`);
  }
  if (spec.cake_line) {
    const label = spec.cake_line === 'cold_cake' ? 'Bánh lạnh (Bảo quản lạnh)' : 'Bánh kem trang trí';
    lines.push(`Dòng bánh: ${label}`);
  }
  if (spec.flavor) lines.push(`Vị / Nhân: ${spec.flavor}`);
  if (spec.color) lines.push(`Màu sắc: ${spec.color}`);

  // Bánh Trung Thu & Bakery
  if (spec.product_line === 'moon_cake' || spec.weight_gram || spec.egg_count !== undefined) {
    if (spec.weight_gram) lines.push(`Trọng lượng: ${spec.weight_gram}g`);
    if (spec.egg_count !== undefined && spec.egg_count !== null && spec.egg_count !== '') {
      lines.push(`${spec.egg_count} trứng`);
    }
    if (spec.flex_note) lines.push(`Ghi chú: ${spec.flex_note}`);
  }

  // Teabreak / School / Khác
  if (spec.catalog_specification) lines.push(`Quy cách: ${spec.catalog_specification}`);
  if (spec.group) lines.push(`Nhóm món: ${spec.group}`);
  if (spec.spec) lines.push(`Quy cách: ${spec.spec}`);
  if (spec.grade_note) lines.push(`Khối / Lớp: ${spec.grade_note}`);
  if (spec.packing) lines.push(`Đóng gói: ${spec.packing}`);
  if (spec.note) lines.push(`Ghi chú: ${spec.note}`);

  // Các thuộc tính tuỳ chỉnh khác (bỏ qua các trường hệ thống nội bộ tiếng Anh)
  const systemKeys = new Set(['product_flow', 'catalog_price', 'catalog_category', 'custom', 'size', 'content', 'cake_line', 'flavor', 'color', 'product_line', 'weight_gram', 'egg_count', 'flex_note', 'catalog_specification', 'group', 'spec', 'grade_note', 'packing', 'note']);
  for (const [k, v] of Object.entries(spec)) {
    if (!systemKeys.has(k) && v !== null && v !== undefined && v !== '') {
      lines.push(`${k}: ${v}`);
    }
  }

  return lines;
}

export default function OrderV2DetailModal({ orderId, onClose, onChanged }) {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [units, setUnits] = useState([]);
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoomImage, setZoomImage] = useState(null);

  const director = ['owner', 'admin'].includes(profile?.role) || (profile?.extra_roles || []).some(x => ['owner', 'admin'].includes(x));

  const load = async () => {
    const [o, i, p, u, e, ops, att] = await Promise.all([
      supabase.from('orders').select('id,order_code,order_type,status_v2,required_at,fulfillment_method_v2,address,note,created_by_name,created_at,confidentiality,version').eq('id', orderId).single(),
      supabase.from('order_items').select('id,name_snapshot,quantity,unit,specification,unit_price,display_order').eq('order_id', orderId).order('display_order'),
      supabase.from('order_work_packages').select('id,unit_id,status,due_at,accepted_at,completed_at,version,organization_units(name,code),work_package_items(order_item_id,quantity)').eq('order_id', orderId),
      supabase.from('organization_units').select('id,name,code').eq('unit_type', 'kitchen').eq('active', true),
      supabase.from('domain_events').select('id,event_type,occurred_at,payload').eq('entity_type', 'order').eq('entity_id', orderId).order('occurred_at', { ascending: false }),
      supabase.from('order_operations_list').select('production_started_at,production_completed_at,production_minutes,delivery_started_at,delivery_completed_at,delivery_minutes,delivery_provider,provider_label,shipping_fee,driver_name,is_overdue,overdue_stage,overdue_minutes').eq('id', orderId).single(),
      supabase.from('order_attachments').select('id,attachment_type,storage_path,mime_type,created_at').eq('order_id', orderId).order('created_at', { ascending: false })
    ]);

    if (o.error) throw o.error;

    // Lấy URL xem ảnh cho các file đính kèm
    const resolvedAttachments = await Promise.all((att.data || []).map(async (a) => {
      let url = '';
      if (a.storage_path) {
        try {
          const { data: signed } = await supabase.storage.from('uploads').createSignedUrl(a.storage_path, 86400);
          url = signed?.signedUrl || supabase.storage.from('uploads').getPublicUrl(a.storage_path).data?.publicUrl;
        } catch {
          url = supabase.storage.from('uploads').getPublicUrl(a.storage_path).data?.publicUrl || '';
        }
      }
      return { ...a, url };
    }));

    setData({
      order: o.data,
      items: i.data || [],
      packages: p.data || [],
      events: e.data || [],
      operations: ops.data || {}
    });
    setAttachments(resolvedAttachments);
    setUnits(u.data || []);
  };

  useEffect(() => {
    load().catch(x => setError(x.message));
  }, [orderId]);

  const assign = async () => {
    setBusy(true); setError('');
    try {
      await assignOrderPackage({
        p_idempotency_key: crypto.randomUUID(),
        p_order_id: orderId,
        p_unit_id: unit,
        p_due_at: data.order.required_at,
        p_items: data.items.map(x => ({ order_item_id: x.id, quantity: x.quantity })),
        p_expected_version: data.order.version
      });
      await load();
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const accept = async (p) => {
    setBusy(true); setError('');
    try {
      await acceptOrderPackage({
        p_idempotency_key: crypto.randomUUID(),
        p_package_id: p.id,
        p_expected_version: p.version
      });
      await load();
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const approvePackage = async (p) => {
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('approve_work_package_completion', {
        p_idempotency_key: crypto.randomUUID(),
        p_package_id: p.id,
        p_expected_version: p.version
      });
      if (error) throw error;
      await load();
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!data) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center' }}>
      <div style={box}>{error || 'Đang tải chi tiết đơn...'}</div>
    </div>
  );

  const o = data.order;
  const isSchool = o.confidentiality === 'school_restricted';

  const customerSamplePhotos = attachments.filter(a => a.attachment_type === 'customer_sample' || !a.attachment_type);
  const proofPhotos = attachments.filter(a => a.attachment_type !== 'customer_sample' && !!a.attachment_type);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, maxHeight: '94vh', overflowY: 'auto', padding: 18, borderRadius: '24px 24px 0 0', background: 'var(--surface-app)' }}>
        
        {/* Header đơn hàng */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>{o.order_code}</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 3 }}>
              Tạo bởi: {o.created_by_name || 'Hệ thống'} · {new Date(o.created_at).toLocaleString('vi-VN')}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'none', fontSize: 28, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>

        {isSchool && (
          <div style={{ ...box, marginTop: 12, background: '#fff3cd', color: '#856404', fontWeight: 800 }}>
            🔒 Đơn trường học · Tuyệt đối không hiển thị giá
          </div>
        )}

        {/* Danh sách sản phẩm & quy cách tiếng Việt */}
        <div style={{ ...box, marginTop: 12 }}>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            📦 Sản phẩm và quy cách
          </strong>
          {data.items.map((x) => {
            const specLines = formatSpecificationLines(x.specification);
            return (
              <div key={x.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {x.name_snapshot}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {x.quantity} {x.unit || 'cái'}
                    {!isSchool && x.unit_price ? ` · ${Number(x.unit_price).toLocaleString('vi-VN')}đ` : ''}
                  </span>
                </div>

                {specLines.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {specLines.map((line, idx) => (
                      <span key={idx} style={{
                        fontSize: 13, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-sunken)', color: 'var(--text-secondary)', fontWeight: 500
                      }}>
                        {line}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Ảnh mẫu khách gửi (Cake Sample Photo) */}
        {customerSamplePhotos.length > 0 && (
          <div style={box}>
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 10, color: 'var(--text-primary)' }}>
              🖼️ Ảnh mẫu bánh kem khách gửi ({customerSamplePhotos.length})
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {customerSamplePhotos.map((att) => (
                <div
                  key={att.id}
                  onClick={() => setZoomImage(att.url)}
                  style={{
                    position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    border: '2px solid var(--border-default)', aspectRatio: '1/1', background: '#000'
                  }}
                  title="Bấm để xem ảnh lớn"
                >
                  <img
                    src={att.url}
                    alt="Mẫu bánh kem"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{
                    position: 'absolute', bottom: 0, insetInline: 0, padding: '2px 4px',
                    background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, textAlign: 'center'
                  }}>
                    🔍 Xem ảnh lớn
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thông tin Giao nhận & Khách hàng */}
        <div style={box}>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            🚚 Thông tin giao nhận
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
            <div>
              <b>Phương thức:</b> {o.fulfillment_method_v2 === 'pickup' ? '🏬 Nhận tại quầy' : '🛵 Giao tận nơi'}
            </div>
            {o.address && (
              <div>
                <b>Địa chỉ:</b> {o.address}
              </div>
            )}
            <div>
              <b>Hẹn giờ:</b> {o.required_at ? new Date(o.required_at).toLocaleString('vi-VN') : 'Chưa có giờ hẹn'}
            </div>
            {o.note && (
              <div style={{ marginTop: 4, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}>
                <b>Ghi chú đơn:</b> {o.note}
              </div>
            )}
          </div>
        </div>

        {/* Cảnh báo quá hạn (nếu có) */}
        {data.operations?.is_overdue && (
          <div style={{ ...box, background: '#fee2e2', color: '#b42318', fontWeight: 850 }}>
            ⚠️ Chưa thực hiện · {data.operations.overdue_stage} · quá {data.operations.overdue_minutes} phút
          </div>
        )}

        {/* Tiến độ thời gian xử lý */}
        <div style={box}>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            ⏱️ Tiến độ thời gian xử lý
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            <div>
              <b>Bếp:</b> {data.operations?.production_started_at ? `Bắt đầu lúc ${new Date(data.operations.production_started_at).toLocaleString('vi-VN')}` : 'Chưa bắt đầu'}
              {data.operations?.production_completed_at ? ` · Xong lúc ${new Date(data.operations.production_completed_at).toLocaleString('vi-VN')}` : ''}
              {data.operations?.production_minutes != null ? ` (${data.operations.production_minutes} phút)` : ''}
            </div>
            <div>
              <b>Giao hàng:</b> {data.operations?.delivery_started_at ? `Bắt đầu lúc ${new Date(data.operations.delivery_started_at).toLocaleString('vi-VN')}` : 'Chưa bắt đầu'}
              {data.operations?.delivery_completed_at ? ` · Xong lúc ${new Date(data.operations.delivery_completed_at).toLocaleString('vi-VN')}` : ''}
              {data.operations?.delivery_minutes != null ? ` (${data.operations.delivery_minutes} phút)` : ''}
            </div>
            {(data.operations?.driver_name || data.operations?.provider_label) && (
              <div>
                <b>Người giao:</b> {data.operations.driver_name || data.operations.provider_label}
                {!isSchool && data.operations?.shipping_fee != null ? ` · Phí ship: ${Number(data.operations.shipping_fee).toLocaleString('vi-VN')}đ` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Ảnh chụp lúc hoàn thành hoặc giao hàng */}
        {proofPhotos.length > 0 && (
          <div style={box}>
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 10, color: 'var(--text-primary)' }}>
              📸 Ảnh chụp hoàn thành / giao hàng ({proofPhotos.length})
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
              {proofPhotos.map((att) => (
                <div
                  key={att.id}
                  onClick={() => setZoomImage(att.url)}
                  style={{
                    position: 'relative', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    border: '2px solid var(--border-default)', aspectRatio: '1/1', background: '#000'
                  }}
                >
                  <img
                    src={att.url}
                    alt={att.attachment_type || 'Ảnh'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Các bếp thực hiện */}
        <div style={box}>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            👨‍🍳 Các bếp thực hiện
          </strong>
          {data.packages.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Chưa phân bếp</p>}
          {data.packages.map((p) => (
            <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {p.organization_units?.name} · {p.status === 'completed' ? '✅ Đã hoàn thành' : p.status === 'in_progress' ? '👩‍🍳 Đang làm' : '⏳ Chờ nhận'}
                </span>
                <div>
                  {['assigned'].includes(p.status) && (
                    <button disabled={busy} onClick={() => accept(p)} style={{ minHeight: 40, border: 0, borderRadius: 10, padding: '0 14px', fontWeight: 800, background: 'var(--brand-primary)', color: '#fff' }}>
                      Nhận phần đơn
                    </button>
                  )}
                  {['in_progress', 'awaiting_approval'].includes(p.status) && (
                    <button disabled={busy} onClick={() => approvePackage(p)} style={{ minHeight: 40, border: 0, borderRadius: 10, padding: '0 14px', fontWeight: 800, background: '#087f5b', color: 'white' }}>
                      Duyệt hoàn thành
                    </button>
                  )}
                </div>
              </div>
              {p.accepted_at && (
                <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)' }}>
                  Nhận lúc {new Date(p.accepted_at).toLocaleString('vi-VN')}
                  {p.completed_at ? ` · Xong lúc ${new Date(p.completed_at).toLocaleString('vi-VN')}` : ''}
                </small>
              )}
              {['accepted', 'in_progress', 'awaiting_approval'].includes(p.status) && (
                <div style={{ marginTop: 10 }}>
                  <PackageTaskPanel packageId={p.id} onChanged={load} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Phân thêm bếp cho Giám đốc */}
        {director && (
          <div style={box}>
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
              Phân thêm bếp
            </strong>
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              style={{ width: '100%', minHeight: 48, borderRadius: 12, padding: '0 10px', fontSize: 16, border: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}
            >
              <option value="">Chọn bếp phụ trách</option>
              {units.map(x => <option value={x.id} key={x.id}>{x.name}</option>)}
            </select>
            <button
              disabled={!unit || busy}
              onClick={assign}
              style={{ width: '100%', minHeight: 48, marginTop: 10, border: 0, borderRadius: 12, fontWeight: 900, background: 'var(--brand-primary)', color: 'white', fontSize: 16, cursor: 'pointer' }}
            >
              Giao phần đơn cho bếp
            </button>
          </div>
        )}

        {/* Bình luận nội bộ đơn hàng */}
        <div style={box}>
          <CommentSection order={o} profile={profile} />
        </div>

        {/* Lịch sử trạng thái */}
        <div style={box}>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>
            🕘 Lịch sử cập nhật
          </strong>
          {data.events.map((e) => (
            <div key={e.id} style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-secondary)', borderBottom: '1px dashed var(--border-subtle)' }}>
              {new Date(e.occurred_at).toLocaleString('vi-VN')} · {e.event_type}
            </div>
          ))}
        </div>

        {error && <div style={{ color: '#b42318', marginTop: 8, fontWeight: 700 }}>{error}</div>}

      </div>

      {/* Lightbox / Modal xem ảnh phóng to */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
        >
          <button
            onClick={() => setZoomImage(null)}
            style={{
              position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.25)',
              border: 0, borderRadius: '50%', width: 44, height: 44, color: '#fff', fontSize: 24, cursor: 'pointer'
            }}
          >
            ×
          </button>
          <img
            src={zoomImage}
            alt="Phóng to ảnh mẫu bánh"
            style={{ maxWidth: '96%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>
            Bấm bất kỳ đâu ngoài ảnh để đóng
          </div>
        </div>
      )}
    </div>
  );
}

