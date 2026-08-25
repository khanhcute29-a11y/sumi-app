import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { playNotificationSound } from '../lib/sound';

const LABELS = {
  new_order: 'Đơn mới',
  order_in_production: 'Bếp đang làm',
  work_package_assigned: 'Đơn về bếp',
  order_ready: 'Chờ vận chuyển',
  delivery_assigned: 'Chuyến mới',
  delivery_completed: 'Giao thành công',
  task_assigned: 'Việc mới',
  task_reminder: 'Nhắc việc',
  company_announcement: 'Thông báo công ty',
  order_comment: 'Trao đổi trong đơn',
  expense_claim: 'Đề nghị chi',
  salary_advance: 'Tạm ứng lương',
  incident: 'Sự cố',
};

// Loại tin nào thì mở trang nào
const tabOf = (n) => {
  if (n.entity_type === 'task') return 'tasks';
  if (n.entity_type === 'delivery_run') return 'shipping';
  if (n.notification_type === 'incident') return 'incidents';
  if (['expense_claim', 'salary_advance'].includes(n.entity_type)) return 'financeRequests';
  if (n.entity_type === 'company_feed') return 'feed';
  return 'orders';
};

export default function InboxV2Screen() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('unread');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    if (filter === 'unread') q = q.is('read_at', null);
    const { data, error: err } = await q;
    if (err) throw err;
    setRows(data || []);
  };

  useEffect(() => {
    setLoading(true);
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
    const ch = supabase
      .channel('notifications-v2-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => {
        // Giữ nguyên logic âm thanh cũ. Tin do trigger đơn hàng ghi có
        // sound_key='silent' nên hàm này không phát gì — chuông đã do hệ
        // thống thông báo hiện tại lo, tránh kêu chồng hai lần.
        playNotificationSound(p.new.sound_key);
        load().catch(() => {});
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [filter]);

  const open = async (n) => {
    // 1) Đánh dấu đã xem — cập nhật ngay trên màn hình để người dùng thấy
    //    liền, đồng thời ghi xuống máy chủ. TRƯỚC ĐÂY lỗi cập nhật bị nuốt
    //    im lặng nên tin không bao giờ chuyển sang "đã xem".
    if (!n.read_at) {
      const now = new Date().toISOString();
      setRows((prev) =>
        filter === 'unread'
          ? prev.filter((r) => r.id !== n.id)
          : prev.map((r) => (r.id === n.id ? { ...r, read_at: now } : r))
      );
      const { error: err } = await supabase
        .from('notifications')
        .update({ read_at: now, acknowledged_at: now })
        .eq('id', n.id);
      if (err) {
        setError('Không đánh dấu được đã xem: ' + err.message);
        load().catch(() => {});
      }
    }

    // 2) Mở đúng nơi. Có entity_id là đơn hàng -> mở THẲNG chi tiết đơn đó,
    //    thay vì chỉ nhảy tới danh sách chung.
    window.dispatchEvent(
      new CustomEvent('sumi-navigate', {
        detail: { tab: tabOf(n), entityId: n.entity_id, deepLink: n.deep_link },
      })
    );
  };

  const markAllRead = async () => {
    const chuaDoc = rows.filter((r) => !r.read_at).map((r) => r.id);
    if (chuaDoc.length === 0) return;
    const now = new Date().toISOString();
    setRows((prev) => (filter === 'unread' ? [] : prev.map((r) => ({ ...r, read_at: r.read_at || now }))));
    const { error: err } = await supabase
      .from('notifications')
      .update({ read_at: now, acknowledged_at: now })
      .in('id', chuaDoc);
    if (err) {
      setError('Không đánh dấu được: ' + err.message);
      load().catch(() => {});
    }
  };

  const soChuaDoc = rows.filter((r) => !r.read_at).length;

  const tabBtn = (active) => ({
    minHeight: 44,
    padding: '0 14px',
    marginLeft: 6,
    borderRadius: 12,
    border: active ? '2px solid var(--action-primary)' : '1px solid var(--border-default)',
    background: active ? 'var(--surface-primary-soft)' : 'var(--surface-card)',
    color: 'var(--text-primary)',
    fontWeight: 800,
    cursor: 'pointer',
  });

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>🔔 Tin nhắn {soChuaDoc > 0 && <span style={{ color: 'var(--action-primary)' }}>({soChuaDoc})</span>}</h2>
        <div>
          <button onClick={() => setFilter('unread')} style={tabBtn(filter === 'unread')}>Chưa đọc</button>
          <button onClick={() => setFilter('all')} style={tabBtn(filter === 'all')}>Tất cả</button>
        </div>
      </div>

      {soChuaDoc > 0 && (
        <button
          onClick={markAllRead}
          style={{ minHeight: 44, marginTop: 10, padding: '0 14px', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
        >
          Đánh dấu tất cả đã xem
        </button>
      )}

      {error && <div style={{ marginTop: 10, color: 'var(--status-danger)' }}>{error}</div>}

      <div style={{ marginTop: 12 }}>
        {rows.map((n) => {
          const daXem = Boolean(n.read_at);
          return (
            <button
              key={n.id}
              onClick={() => open(n)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: 15,
                marginBottom: 9,
                borderRadius: 16,
                // Đã xem thì nhạt hẳn đi để không lẫn với tin mới
                border: daXem ? '1px solid var(--border-subtle)' : '2px solid var(--action-primary)',
                background: daXem ? 'var(--surface-sunken)' : 'var(--surface-card)',
                color: daXem ? 'var(--text-muted)' : 'var(--text-primary)',
                opacity: daXem ? 0.72 : 1,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontWeight: daXem ? 600 : 800 }}>
                  {!daXem && <span style={{ color: 'var(--action-primary)', marginRight: 6 }}>●</span>}
                  {n.title}
                </strong>
                <span>{n.severity === 'urgent' ? '🔴' : n.severity === 'warning' ? '🟡' : '🔵'}</span>
              </div>
              <div style={{ marginTop: 6 }}>{n.body}</div>
              <div style={{ marginTop: 7, color: 'var(--text-muted)', fontSize: 13 }}>
                {LABELS[n.notification_type] || n.notification_type} · {new Date(n.created_at).toLocaleString('vi-VN')}
                {daXem && ' · Đã xem'}
              </div>
            </button>
          );
        })}
      </div>

      {!loading && !rows.length && (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
          {filter === 'unread' ? 'Không có tin chưa đọc' : 'Không có thông báo'}
        </div>
      )}
    </div>
  );
}
