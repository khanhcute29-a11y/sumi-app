import React, { useEffect, useState } from 'react';
import { fetchGieoHatHistory } from '../lib/gieoHat';

function formatNgay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatGio(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

const LINK_LABELS = {
  order_created: '📦 Chốt đơn',
  order_delivery: '🛵 Giao hàng',
  order_work_package: '👩‍🍳 Sản xuất',
  task: '✅ Việc',
  cham_cong: '⏱️ Chấm công',
};

// Xem chi tiết đầy đủ 1 lượt Cộng/Trừ sao — mọi dòng đều bấm mở được, kể cả
// dòng tự động (trễ giờ...) không có đơn liên quan, vì lúc đó chi tiết chỉ
// có ở đây (không phải mọi dòng đều có nút mở đơn riêng).
function GieoHatDetailModal({ item, onOpenOrder, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fdf9f2', width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 20, boxSizing: 'border-box', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>{item.staff_name}</div>
            <div style={{ fontSize: 12, color: '#8C7A6B', marginTop: 2 }}>
              {formatNgay(item.ngay || item.created_at)} {formatGio(item.created_at)}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: item.loai === 'cong' ? '#138a53' : '#b42318', whiteSpace: 'nowrap' }}>
            {item.loai === 'cong' ? '+' : '-'}{item.so_sao} ⭐
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 11, color: '#725f50', fontWeight: 700 }}>Người thực hiện</div>
            <div style={{ fontSize: 13.5, color: '#2d1c10', fontWeight: 700, marginTop: 2 }}>
              {item.created_by_name || (item.auto_generated ? '⚙️ Hệ thống tự động' : 'Không rõ')}
            </div>
          </div>

          {item.so_tien != null && (
            <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 11, color: '#725f50', fontWeight: 700 }}>Quy đổi lương</div>
              <div style={{ fontSize: 13.5, color: '#2d1c10', fontWeight: 700, marginTop: 2 }}>
                {item.loai === 'cong' ? '+' : '-'}{Number(item.so_tien).toLocaleString('vi-VN')}đ
              </div>
            </div>
          )}

          {item.note && (
            <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 11, color: '#725f50', fontWeight: 700 }}>Ghi chú / lý do</div>
              <div style={{ fontSize: 13.5, color: '#2d1c10', marginTop: 2 }}>{item.note}</div>
            </div>
          )}

          {item.link_type && LINK_LABELS[item.link_type] && (
            <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 11, color: '#725f50', fontWeight: 700 }}>Liên quan tới</div>
              <div style={{ fontSize: 13.5, color: '#2d1c10', fontWeight: 700, marginTop: 2 }}>{LINK_LABELS[item.link_type]}</div>
            </div>
          )}

          {item.photo_url && (
            <div>
              <div style={{ fontSize: 11, color: '#725f50', fontWeight: 700, marginBottom: 6 }}>Ảnh chứng từ</div>
              <img src={item.photo_url} alt="Chứng từ" style={{ width: '100%', borderRadius: 12, display: 'block' }} onClick={() => window.open(item.photo_url, '_blank')} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {item.order && (
            <button
              onClick={() => onOpenOrder?.(item.order.id)}
              style={{ flex: 1, minHeight: 46, border: 'none', borderRadius: 12, background: '#e6f6ed', color: '#09663d', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
            >📦 Xem chi tiết đơn #{item.order.order_code}</button>
          )}
          <button
            onClick={onClose}
            style={{ flex: item.order ? 0 : 1, minWidth: item.order ? 90 : undefined, minHeight: 46, border: '1.5px solid #eadcca', borderRadius: 12, background: '#fff', color: '#725f50', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', padding: '0 16px' }}
          >Đóng</button>
        </div>
      </div>
    </div>
  );
}

// Lịch sử "Gieo Hạt" toàn công ty (Cộng/Trừ sao) — ai được tặng, do ai tặng,
// mấy sao, liên quan đơn nào. Chỉ xem, không sửa/xoá ở đây (sửa/xoá đã có sẵn
// đúng chỗ tại StarRateBar gắn trong từng đơn/việc/chấm công cụ thể).
export default function GieoHatHistoryScreen({ onOpenOrder }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterLoai, setFilterLoai] = useState('all'); // all | cong | tru
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let huy = false;
    setLoading(true);
    fetchGieoHatHistory({ limit: 300 })
      .then((data) => { if (!huy) setRows(data); })
      .catch((e) => { if (!huy) setError(e.message || 'Không tải được lịch sử.'); })
      .finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filterLoai !== 'all' && r.loai !== filterLoai) return false;
    if (!q) return true;
    return (r.staff_name || '').toLowerCase().includes(q)
      || (r.created_by_name || '').toLowerCase().includes(q)
      || (r.note || '').toLowerCase().includes(q)
      || (r.order?.order_code || '').toLowerCase().includes(q);
  });

  const tongCong = rows.filter((r) => r.loai === 'cong').reduce((s, r) => s + (r.so_sao || 0), 0);
  const tongTru = rows.filter((r) => r.loai === 'tru').reduce((s, r) => s + (r.so_sao || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#725f50', fontWeight: 700 }}>Tổng Cộng sao</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#138a53' }}>+{tongCong.toLocaleString('vi-VN')} ⭐</div>
        </div>
        <div style={{ flex: 1, background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: '#725f50', fontWeight: 700 }}>Tổng Trừ sao</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#b42318' }}>-{tongTru.toLocaleString('vi-VN')} ⭐</div>
        </div>
      </div>

      <input
        type="text" placeholder="Tìm theo tên, ghi chú, mã đơn..." value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', minHeight: 44, border: '1.5px solid #eadcca', borderRadius: 12, padding: '0 12px', fontSize: 14, boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        {[['all', 'Tất cả'], ['cong', '➕ Cộng'], ['tru', '➖ Trừ']].map(([key, label]) => (
          <button
            key={key} onClick={() => setFilterLoai(key)}
            style={{
              flex: 1, minHeight: 38, borderRadius: 999, border: filterLoai === key ? '1.5px solid #c88a4b' : '1.5px solid #eadcca',
              background: filterLoai === key ? '#fdece3' : '#fff', color: filterLoai === key ? '#b93e13' : '#725f50',
              fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
            }}
          >{label}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#8C7A6B', padding: 20 }}>Đang tải...</div>}
      {error && <div style={{ background: '#fee2e2', color: '#b42318', borderRadius: 10, padding: 10, fontWeight: 700, fontSize: 13 }}>⚠️ {error}</div>}
      {!loading && !error && visible.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8C7A6B', padding: 20 }}>Chưa có lượt tặng/trừ sao nào khớp.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map((r) => (
          <div
            key={`${r.loai}-${r.id}`} onClick={() => setSelected(r)} role="button"
            style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#2d1c10' }}>{r.staff_name}</div>
                <div style={{ fontSize: 11.5, color: '#8C7A6B', marginTop: 2 }}>
                  {r.created_by_name ? `Tặng bởi ${r.created_by_name}` : 'Tự động hệ thống'} · {formatNgay(r.ngay || r.created_at)}
                  {r.auto_generated && ' · ⚙️ Tự động'}
                </div>
              </div>
              <div style={{
                fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap',
                color: r.loai === 'cong' ? '#138a53' : '#b42318',
              }}>
                {r.loai === 'cong' ? '+' : '-'}{r.so_sao} ⭐
              </div>
            </div>
            {r.note && <div style={{ fontSize: 12.5, color: '#4A3B2C', marginTop: 6 }}>{r.note}</div>}
            {r.order && (
              <div style={{
                marginTop: 8, display: 'inline-block', border: '1px solid #c9dfd3', background: '#e6f6ed', color: '#09663d',
                borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 800,
              }}>{LINK_LABELS[r.link_type] || '📦'} #{r.order.order_code}</div>
            )}
            {!r.order && r.link_type && LINK_LABELS[r.link_type] && (
              <div style={{ marginTop: 8, display: 'inline-block', color: '#725f50', fontSize: 11.5, fontWeight: 700 }}>
                {LINK_LABELS[r.link_type]}
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <GieoHatDetailModal item={selected} onOpenOrder={onOpenOrder} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
