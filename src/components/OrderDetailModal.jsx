import React from 'react';
import { Badge } from './feedback/Badge';
import { IconPaperclip, IconHome, IconMapPin, IconClock, IconPhone, IconClipboard, IconKitchen, IconTruck } from './icons/FrogIcons';

const STATUS_LABELS = {
  moi: 'Mới', dang_lam: 'Đang làm', cho_giao: 'Chờ giao', dang_giao: 'Đang giao',
  hoan_thanh: 'Hoàn thành', huy: 'Đã huỷ',
};

function Thumb({ url, label }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <img src={url} alt={label} style={{ width: 64, height: 64, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
      <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{label}</span>
    </a>
  );
}

export function OrderDetailModal({ order, onClose }) {
  const items = order.order_items || [];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 65, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{order.customer?.name || 'Khách lẻ'}</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{order.order_code} · {order.channel || '—'}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Badge tone={order.status === 'huy' ? 'danger' : order.status === 'hoan_thanh' ? 'success' : 'neutral'} style={{ alignSelf: 'flex-start' }}>
            {STATUS_LABELS[order.status] || order.status}
          </Badge>

          <div>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', marginBottom: 6 }}>Sản phẩm</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it) => {
                const details = [it.size && `Size ${it.size}`, it.cot && `Cốt ${it.cot}`, it.vi && `Vị ${it.vi}`, it.content && `Nội dung "${it.content}"`, it.candle && `Nến ${it.candle}`].filter(Boolean).join(' · ');
                return (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{it.name} x{it.qty}</div>
                      {details && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{details}</div>}
                    </div>
                    <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{Number(it.price || 0).toLocaleString('vi-VN')}đ</div>
                  </div>
                );
              })}
            </div>
          </div>

          {items.some((it) => it.ref_photo_url) && (
            <div>
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><IconPaperclip size={14} /> Ảnh mẫu khách gửi</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {items.filter((it) => it.ref_photo_url).map((it) => <Thumb key={it.id} url={it.ref_photo_url} label={it.name} />)}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {order.delivery_method === 'lay_tai_xuong' ? <><IconHome size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Khách tự đến lấy tại xưởng</> : <><IconMapPin size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{order.address || '—'}</>}
            </div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              <IconClock size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{order.delivery_date || '—'} {order.delivery_time || ''}
            </div>
            {order.customer?.phone && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconPhone size={14} /> {order.customer.phone}</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-label)', color: 'var(--text-primary)' }}>
              <span>Tổng tiền</span><span>{Number(order.total || 0).toLocaleString('vi-VN')}đ</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              <span>Đặt cọc</span><span>{Number(order.deposit || 0).toLocaleString('vi-VN')}đ</span>
            </div>
            {order.payment_method && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Thanh toán: {order.payment_method === 'bank' ? 'Chuyển khoản' : 'COD'}</div>
            )}
          </div>

          {order.note && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={14} /> {order.note}</div>}
          {order.kitchen_staff_name && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconKitchen size={14} /> Bếp: {order.kitchen_staff_name}</div>}
          {order.shipper_staff_name && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconTruck size={14} /> Người giao: {order.shipper_staff_name}</div>}

          {(order.kitchen_photo_url || order.pickup_photo_url || order.delivery_photo_url || order.signed_doc_photo_url) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Thumb url={order.kitchen_photo_url} label="Bếp làm xong" />
              <Thumb url={order.pickup_photo_url} label="Lúc xuất bến" />
              <Thumb url={order.delivery_photo_url} label="Lúc đến nơi" />
              <Thumb url={order.signed_doc_photo_url} label="Biên bản ký giấy" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
