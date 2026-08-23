import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { VoiceMicButton } from './VoiceMicButton';

const btn = {
  minHeight: 44,
  border: 0,
  borderRadius: 12,
  padding: '0 14px',
  fontWeight: 800,
  cursor: 'pointer',
  fontSize: 14
};

const TASK_PRESETS = [
  '🎂 Đánh kem & chà láng',
  '✍️ Viết chữ & trang trí',
  '🍓 Soạn topping & trái cây',
  '🍞 Nhồi & ủ bột',
  '🥖 Tạo hình & nướng bánh',
  '🥮 Làm nhân bánh',
  '🧁 Bơm vỏ & nướng macaron',
  '📦 Đóng hộp & dán tem',
  '❄️ Bảo quản tủ lạnh',
  '🥪 Soạn suất trường học'
];

export default function PackageTaskPanel({ packageId, onChanged }) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);

  const isLead = ['owner', 'admin', 'kitchen_lead', 'kitchen_deputy', 'baker'].some(
    r => r === profile?.role || (profile?.extra_roles || []).includes(r)
  );

  const load = async () => {
    const [t, p] = await Promise.all([
      supabase
        .from('tasks')
        .select('id,title,description,status,assignee_id,started_at,completed_at,version,required_proof_types,profiles!tasks_assignee_id_fkey(full_name,station)')
        .eq('work_package_id', packageId)
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id,full_name,station,role,extra_roles')
        .eq('approved', true)
        .eq('active', true)
        .order('full_name')
    ]);

    if (t.error) throw t.error;
    setTasks(t.data || []);
    setStaff(p.data || []);
  };

  useEffect(() => {
    load().catch(e => setError(e.message));
  }, [packageId]);

  const rpc = async (name, args) => {
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc(name, args);
      if (rpcErr) throw rpcErr;
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async () => {
    if (!assignee || !title.trim()) {
      setError('Vui lòng chọn nhân viên và nhập nội dung việc.');
      return;
    }
    await rpc('assign_package_task', {
      p_idempotency_key: crypto.randomUUID(),
      p_package_id: packageId,
      p_assignee_id: assignee,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_deadline: null,
      p_required_proof_types: ['photo']
    });
    setTitle('');
    setDescription('');
    setShowAssignForm(false);
  };

  const handleProof = async (t, file) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = `tasks/${t.id}/${crypto.randomUUID()}-${file.name}`;
      const up = await supabase.storage.from('uploads').upload(path, file);
      if (up.error) throw up.error;
      const ins = await supabase.from('task_proofs').insert({
        task_id: t.id,
        proof_type: 'photo',
        storage_path: path,
        created_by: profile.id
      });
      if (ins.error) throw ins.error;
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 8, padding: '12px', background: 'var(--surface-sunken)', borderRadius: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          📋 Phân công công việc thợ bếp ({tasks.length})
        </strong>
        {isLead && (
          <button
            type="button"
            onClick={() => setShowAssignForm(v => !v)}
            style={{
              border: 0, background: showAssignForm ? 'var(--border-default)' : 'var(--brand-primary)',
              color: showAssignForm ? 'var(--text-primary)' : '#fff', borderRadius: 10,
              padding: '6px 12px', fontWeight: 800, fontSize: 13, cursor: 'pointer'
            }}
          >
            {showAssignForm ? '✕ Đóng form giao' : '＋ Giao việc cho thợ'}
          </button>
        )}
      </div>

      {/* Danh sách các việc đã giao */}
      {tasks.length === 0 && !showAssignForm && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '6px 0' }}>
          Chưa có đầu việc nào được giao cho thợ. Bấm "＋ Giao việc cho thợ" để phân công.
        </div>
      )}

      {tasks.map((t) => {
        const isDone = t.status === 'done';
        const isStarted = !!t.started_at;
        const isMine = t.assignee_id === profile?.id;

        return (
          <div
            key={t.id}
            style={{
              padding: '10px', marginBottom: 8, borderRadius: 10, background: '#fff',
              border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 6
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              <div>
                <b style={{ fontSize: 14, color: 'var(--text-primary)' }}>{t.title}</b>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  👤 Thợ phụ trách: <b>{t.profiles?.full_name || 'Chưa rõ'}</b>
                  {t.profiles?.station ? ` (${t.profiles.station})` : ''}
                </div>
                {t.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    "{t.description}"
                  </div>
                )}
              </div>

              <span style={{
                fontSize: 12, padding: '3px 8px', borderRadius: 999, fontWeight: 800,
                background: isDone ? '#e6f6ed' : isStarted ? '#fff0d4' : '#f4efe8',
                color: isDone ? '#087f5b' : isStarted ? '#b93e13' : '#725f50'
              }}>
                {isDone ? '✅ Xong' : isStarted ? '👩‍🍳 Đang làm' : '⏳ Chưa nhận'}
              </span>
            </div>

            {/* Nút thao tác cho người được giao */}
            {isMine && !isDone && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {!isStarted && (
                  <button
                    style={{ ...btn, background: 'var(--brand-primary)', color: '#fff' }}
                    disabled={busy}
                    onClick={() => rpc('start_task_v2', { p_idempotency_key: crypto.randomUUID(), p_task_id: t.id, p_expected_version: t.version })}
                  >
                    ▶ Bắt đầu làm
                  </button>
                )}
                <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0e4d4', color: '#2d1c10' }}>
                  📷 Chụp ảnh
                  <input hidden type="file" accept="image/*" capture="environment" onChange={e => e.target.files[0] && handleProof(t, e.target.files[0])} />
                </label>
                <button
                  style={{ ...btn, background: '#087f5b', color: '#fff' }}
                  disabled={busy}
                  onClick={() => rpc('complete_task_v2', { p_idempotency_key: crypto.randomUUID(), p_task_id: t.id, p_expected_version: t.version, p_note: null })}
                >
                  ✓ Hoàn thành
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Form giao việc cho thợ bếp */}
      {isLead && showAssignForm && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: '#fff', border: '2px solid var(--brand-primary)' }}>
          <strong style={{ fontSize: 14, display: 'block', marginBottom: 8, color: 'var(--brand-primary)' }}>
            ＋ Giao việc mới cho thợ bếp
          </strong>

          {/* Gợi ý nhanh các đầu việc */}
          <div style={{ marginBottom: 8 }}>
            <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 700 }}>
              Gợi ý 1-chạm:
            </small>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TASK_PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTitle(p)}
                  style={{
                    padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border-default)',
                    background: title === p ? 'var(--brand-primary)' : 'var(--surface-sunken)',
                    color: title === p ? '#fff' : 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              style={{ minHeight: 46, borderRadius: 10, padding: '0 10px', fontSize: 15, border: '1px solid var(--border-default)' }}
            >
              <option value="">Chọn thợ bếp phụ trách</option>
              {staff.map(x => (
                <option key={x.id} value={x.id}>
                  {x.full_name} {x.station ? `(${x.station})` : ''}
                </option>
              ))}
            </select>

            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Tên đầu việc (VD: Đánh kem và chà láng size 18)"
              style={{ minHeight: 46, borderRadius: 10, padding: '0 12px', fontSize: 15, border: '1px solid var(--border-default)' }}
            />

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ghi chú chi tiết hoặc bấm nút nói 🎤"
                style={{ flex: 1, minHeight: 46, borderRadius: 10, padding: '0 12px', fontSize: 15, border: '1px solid var(--border-default)' }}
              />
              <VoiceMicButton onTranscript={x => setDescription(prev => `${prev ? `${prev} ` : ''}${x}`)} />
            </div>

            <button
              type="button"
              style={{ ...btn, background: 'var(--brand-primary)', color: '#fff', fontSize: 16, marginTop: 4 }}
              disabled={!assignee || !title.trim() || busy}
              onClick={handleAssign}
            >
              {busy ? 'Đang giao việc...' : '✓ Xác nhận giao việc cho thợ'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#b42318', fontSize: 13, marginTop: 6, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}

