import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

export default function EditApprovalPanel() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const isDirector = ['owner', 'admin'].includes(profile?.role) ||
                     (profile?.extra_roles || []).some(x => ['owner', 'admin'].includes(x));

  const loadRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('order_edit_requests')
        .select('*, orders(order_code)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setRequests(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDirector) {
      loadRequests();
      const interval = setInterval(loadRequests, 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [isDirector]);

  const handleApprove = async (requestId, orderId) => {
    setBusy(requestId);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('approve_order_edit_request', {
        p_request_id: requestId,
        p_director_id: profile.id,
        p_director_name: profile.full_name || profile.email,
        p_approved: true
      });

      if (err) throw err;
      if (!data.success) throw new Error(data.message || 'Failed to approve');

      // Log KPI
      await supabase.from('kpi_logs').insert({
        order_id: orderId,
        staff_id: profile.id,
        staff_name: profile.full_name || profile.email,
        event_type: 'edit_approval_processed',
        notes: 'Giám đốc duyệt cho phép chỉnh sửa'
      }); // Fire-and-forget

      await loadRequests();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (requestId, orderId) => {
    setBusy(requestId);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('approve_order_edit_request', {
        p_request_id: requestId,
        p_director_id: profile.id,
        p_director_name: profile.full_name || profile.email,
        p_approved: false
      });

      if (err) throw err;
      if (!data.success) throw new Error(data.message || 'Failed to reject');

      await supabase.from('kpi_logs').insert({
        order_id: orderId,
        staff_id: profile.id,
        staff_name: profile.full_name || profile.email,
        event_type: 'edit_approval_processed',
        notes: 'Giám đốc từ chối yêu cầu chỉnh sửa'
      }); // Fire-and-forget

      await loadRequests();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!isDirector) return null;

  return (
    <div style={{
      padding: 16,
      border: '1px solid var(--border-default)',
      borderRadius: 18,
      background: 'var(--surface-card)',
      marginBottom: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>
          📨 Yêu cầu chỉnh sửa chờ duyệt
        </strong>
        {requests.length > 0 && (
          <span style={{
            display: 'inline-block', minWidth: 28, height: 28, borderRadius: '50%',
            background: '#e53935', color: '#fff', fontSize: 14, fontWeight: 900,
            textAlign: 'center', lineHeight: '28px'
          }}>
            {requests.length}
          </span>
        )}
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: 10, background: '#fee2e2', borderRadius: 10,
          color: '#b42318', fontWeight: 700, fontSize: 13
        }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          ⏳ Đang tải...
        </div>
      )}

      {!loading && requests.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          ✅ Không có yêu cầu chờ duyệt
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((req) => (
            <div
              key={req.id}
              style={{
                padding: 12,
                background: 'var(--surface-sunken)',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
                    Đơn #{req.orders?.order_code || req.order_id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    👤 {req.requested_by_name}
                  </div>
                  {req.reason && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                      💭 "{req.reason}"
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    🕘 {new Date(req.created_at).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleApprove(req.id, req.order_id)}
                  disabled={busy === req.id}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#087f5b',
                    color: '#fff',
                    border: 0,
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: busy === req.id ? 'not-allowed' : 'pointer',
                    opacity: busy === req.id ? 0.6 : 1
                  }}
                >
                  {busy === req.id ? '⏳' : '✓ Duyệt'}
                </button>
                <button
                  onClick={() => handleReject(req.id, req.order_id)}
                  disabled={busy === req.id}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#b42318',
                    color: '#fff',
                    border: 0,
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: busy === req.id ? 'not-allowed' : 'pointer',
                    opacity: busy === req.id ? 0.6 : 1
                  }}
                >
                  {busy === req.id ? '⏳' : '✕ Từ chối'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
