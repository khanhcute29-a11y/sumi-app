import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { VoiceMicButton } from './VoiceMicButton';
import { ROLE_META, KITCHEN_LEAD_ROLES } from '../lib/roles';

const btn = {
  minHeight: 44,
  border: 0,
  borderRadius: 12,
  padding: '0 14px',
  fontWeight: 800,
  cursor: 'pointer',
  fontSize: 14
};

export default function PackageTaskPanel({ packageId, packageUnit, defaultDueAt, onChanged }) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);

  const isLead = ['owner', 'admin', ...KITCHEN_LEAD_ROLES, 'bakery'].some(
    r => r === profile?.role || (profile?.extra_roles || []).includes(r)
  );

  const load = async () => {
    const [t, p, pkg] = await Promise.all([
      supabase
        .from('tasks')
        .select('id,title,description,status,assignee_id,deadline,started_at,completed_at,version,required_proof_types,profiles!tasks_assignee_id_fkey(full_name,station,role)')
        .eq('work_package_id', packageId)
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id,full_name,station,role,extra_roles')
        .eq('approved', true)
        .eq('active', true)
        .order('full_name'),
      supabase
        .from('order_work_packages')
        .select('id,due_at,organization_units(id,name,code)')
        .eq('id', packageId)
        .maybeSingle()
    ]);

    if (t.error) throw t.error;
    setTasks(t.data || []);
    setStaff(p.data || []);

    // Gán deadline mặc định theo hạn chót của mẻ / đơn nếu chưa có
    if (!deadline) {
      const targetTime = defaultDueAt || pkg.data?.due_at;
      if (targetTime) {
        const dt = new Date(targetTime);
        // Format to YYYY-MM-DDTHH:mm
        const pad = (n) => String(n).padStart(2, '0');
        const formatted = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
        setDeadline(formatted);
      }
    }
  };

  useEffect(() => {
    load().catch(e => setError(e.message));
  }, [packageId]);

  // Lọc chỉ nhân sự dưới quyền thuộc đúng luồng sản xuất của bếp
  const subordinates = useMemo(() => {
    const unitCode = (packageUnit?.code || '').toUpperCase();
    const unitName = (packageUnit?.name || '').toLowerCase();
    const myRole = profile?.role || '';
    const myStation = profile?.station || '';

    // Xác định luồng: Lạnh, Nóng, Macaron (X41), hay Xưởng 42
    const isCold = unitCode.includes('COLD') || unitName.includes('lạnh') || myRole.includes('cold') || myStation.includes('Lạnh');
    const isHot = unitCode.includes('HOT') || unitName.includes('nóng') || myRole.includes('hot') || myStation.includes('Nóng');
    const isX41 = unitCode.includes('X41') || unitName.includes('41') || unitName.includes('macaron') || myRole.includes('macaron') || myStation.includes('41');
    const isX42 = unitCode.includes('X42') || unitName.includes('42') || unitName.includes('trường') || myRole.includes('x42') || myStation.includes('42');

    let filtered = staff.filter(s => {
      const sRole = s.role || '';
      const sStation = s.station || '';

      if (isCold) {
        return sStation.includes('Lạnh') || ['baker_cold', 'kitchen_deputy_cold', 'kitchen_lead_cold', 'tho_lanh', 'bp_lanh', 'bakery', 'kitchen'].includes(sRole);
      }
      if (isHot) {
        return sStation.includes('Nóng') || ['baker_hot', 'kitchen_deputy_hot', 'kitchen_lead_hot', 'tho_nong', 'bp_nong', 'bakery', 'kitchen'].includes(sRole);
      }
      if (isX41) {
        return sStation.includes('41') || sStation.includes('Macaron') || ['baker_macaron', 'kitchen_lead_macaron', 'tho_macaron', 'bakery', 'kitchen'].includes(sRole);
      }
      if (isX42) {
        return sStation.includes('42') || sStation.includes('Trường') || ['baker_x42', 'kitchen_lead_x42', 'tho_x42', 'bakery', 'kitchen'].includes(sRole);
      }
      return true;
    });

    // Nếu không khớp ai (do chưa gán khâu), trả về toàn bộ thợ làm bánh để tránh kẹt
    if (filtered.length === 0) {
      filtered = staff.filter(s => ['bakery', 'kitchen', 'baker_cold', 'baker_hot', 'baker_macaron', 'baker_x42'].includes(s.role) || s.station);
    }
    return filtered.length > 0 ? filtered : staff;
  }, [staff, packageUnit, profile]);

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
      setError('Vui lòng chọn nhân sự dưới quyền và nhập nội dung việc.');
      return;
    }
    await rpc('assign_package_task', {
      p_idempotency_key: crypto.randomUUID(),
      p_package_id: packageId,
      p_assignee_id: assignee,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_deadline: deadline ? new Date(deadline).toISOString() : null,
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
      const cleanExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `tasks/${t.id}/${crypto.randomUUID()}.${cleanExt}`;
      const up = await supabase.storage.from('uploads').upload(path, file, { contentType: file.type || 'image/jpeg' });
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
              border: 0,
              background: showAssignForm ? 'var(--border-default)' : 'var(--brand-primary)',
              color: showAssignForm ? 'var(--text-primary)' : '#fff',
              borderRadius: 10,
              padding: '6px 14px',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            {showAssignForm ? '✕ Đóng form giao' : '＋ Giao việc mới'}
          </button>
        )}
      </div>

      {/* Danh sách các việc đã giao */}
      {tasks.length === 0 && !showAssignForm && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '6px 0' }}>
          Chưa có đầu việc nào được giao cho thợ. Bấm "＋ Giao việc mới" để phân công.
        </div>
      )}

      {tasks.map(t => {
        const isDone = t.status === 'done' || t.status === 'completed';
        const isStarted = !!t.started_at;
        const isMine = t.assignee_id === profile?.id;
        const isOverdue = t.deadline && new Date(t.deadline) < new Date() && !isDone;
        const doneLate = isDone && t.deadline && t.completed_at && new Date(t.completed_at) > new Date(t.deadline);

        return (
          <div
            key={t.id}
            style={{
              padding: '12px',
              marginBottom: 8,
              borderRadius: 12,
              background: '#fff',
              border: isOverdue ? '1.5px solid #e03131' : '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              <div>
                <b style={{ fontSize: 15, color: 'var(--text-primary)' }}>{t.title}</b>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                  👤 Thợ thực hiện: <b>{t.profiles?.full_name || 'Chưa rõ'}</b>
                  {t.profiles?.station ? ` (${t.profiles.station})` : ''}
                </div>

                {t.deadline && (
                  <div style={{ fontSize: 12, color: isOverdue ? '#e03131' : '#b93e13', marginTop: 2, fontWeight: 700 }}>
                    ⏰ Hạn hoàn thành: {new Date(t.deadline).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    {isOverdue && ' (Đang quá hạn)'}
                    {doneLate && ' (Đã hoàn thành trễ hạn)'}
                  </div>
                )}

                {t.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>
                    "{t.description}"
                  </div>
                )}
              </div>

              <span
                style={{
                  fontSize: 12,
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontWeight: 800,
                  background: isDone ? (doneLate ? '#fff0d4' : '#e6f6ed') : isStarted ? '#fff0d4' : '#f4efe8',
                  color: isDone ? (doneLate ? '#b93e13' : '#087f5b') : isStarted ? '#b93e13' : '#725f50'
                }}
              >
                {isDone ? (doneLate ? '⚠️ Xong trễ hạn' : '✅ Hoàn thành đúng hạn') : isStarted ? '👩‍🍳 Đang làm' : '⏳ Chờ nhận'}
              </span>
            </div>

            {/* Nút thao tác cho người được giao */}
            {isMine && !isDone && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {!isStarted && (
                  <button
                    style={{ ...btn, background: 'var(--brand-primary)', color: '#fff' }}
                    disabled={busy}
                    onClick={() =>
                      rpc('start_task_v2', {
                        p_idempotency_key: crypto.randomUUID(),
                        p_task_id: t.id,
                        p_expected_version: t.version
                      })
                    }
                  >
                    ▶ Bắt đầu làm
                  </button>
                )}
                <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0e4d4', color: '#2d1c10' }}>
                  📷 Chụp ảnh
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={e => e.target.files[0] && handleProof(t, e.target.files[0])}
                  />
                </label>
                <button
                  style={{ ...btn, background: '#087f5b', color: '#fff' }}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const {error: taskErr} = await supabase.rpc('complete_task_v2', {
                        p_idempotency_key: crypto.randomUUID(),
                        p_task_id: t.id,
                        p_expected_version: t.version,
                        p_note: null
                      });
                      if(taskErr) throw taskErr;
                      const {error: pkgErr} = await supabase.rpc('complete_kitchen_work_package_with_proof', {
                        p_package_id: packageId,
                        p_proof_storage_path: null
                      });
                      if(pkgErr) {
                        setError(`Bàn giao kho thất bại: ${pkgErr.message}`);
                      } else {
                        await load();
                        onChanged?.();
                      }
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  ✓ Hoàn thành & Bàn giao Kho Thành Phẩm
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Form giao việc cho thợ bếp */}
      {isLead && showAssignForm && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, background: '#fff', border: '2px solid #d96b43' }}>
          <strong style={{ fontSize: 15, display: 'block', marginBottom: 10, color: '#d96b43' }}>
            ＋ Giao việc cho nhân sự (hoặc Bếp trưởng tự nhận việc)
          </strong>

          <div style={{ display: 'grid', gap: 10 }}>
            {/* 1. Chọn nhân sự thực hiện */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4, color: '#2d1c10' }}>
                👤 Nhân sự thực hiện:
              </label>
              <select
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                style={{ width: '100%', minHeight: 46, borderRadius: 10, padding: '0 10px', fontSize: 15, border: '1px solid var(--border-default)', color: '#2d1c10', background: '#fff' }}
              >
                <option value="">-- Chọn người làm (hoặc Tự nhận làm) --</option>
                {profile?.id && (
                  <option value={profile.id} style={{ fontWeight: 800, color: 'var(--brand-primary)' }}>
                    🙋‍♂️ [Tôi tự làm] {profile.full_name} ({ROLE_META[profile.role]?.shortLabel || 'Bếp Trưởng'})
                  </option>
                )}
                {subordinates.filter(x => x.id !== profile?.id).map(x => (
                  <option key={x.id} value={x.id}>
                    👤 {x.full_name} {x.role ? `[${ROLE_META[x.role]?.shortLabel || x.role}]` : ''} {x.station ? `· ${x.station}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Tên đầu việc */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4, color: '#2d1c10' }}>
                📝 Tên đầu việc:
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Nhập tên đầu việc cần làm (hoặc bấm mic)"
                  style={{ flex: 1, minHeight: 46, borderRadius: 10, padding: '0 12px', fontSize: 15, border: '1px solid var(--border-default)', color: '#2d1c10', background: '#fff' }}
                />
                <VoiceMicButton onTranscript={x => setTitle(prev => `${prev ? `${prev} ` : ''}${x}`)} />
              </div>
            </div>

            {/* 3. Mô tả chi tiết nội dung */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4, color: '#2d1c10' }}>
                📋 Mô tả nội dung / Hướng dẫn thực hiện:
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Mô tả kỹ yêu cầu, số lượng, lưu ý..."
                  style={{ flex: 1, minHeight: 46, borderRadius: 10, padding: '0 12px', fontSize: 15, border: '1px solid var(--border-default)', color: '#2d1c10', background: '#fff' }}
                />
                <VoiceMicButton onTranscript={x => setDescription(prev => `${prev ? `${prev} ` : ''}${x}`)} />
              </div>
            </div>

            {/* 4. Ngày & Giờ hoàn thành (Deadline đo lường KPI) */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4, color: '#2d1c10' }}>
                ⏰ Ngày & Giờ hoàn thành (Đo lường KPI đúng hạn):
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 46, borderRadius: 10, padding: '0 12px', fontSize: 15, border: '1px solid var(--border-default)', color: '#2d1c10', background: '#fff' }}
              />
            </div>

            <button
              type="button"
              style={{ ...btn, background: '#d96b43', color: '#fff', fontSize: 16, marginTop: 4, minHeight: 48 }}
              disabled={!assignee || !title.trim() || busy}
              onClick={handleAssign}
            >
              {busy ? 'Đang giao việc...' : '✓ Xác nhận giao việc cho nhân viên'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#b42318', fontSize: 13, marginTop: 6, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}


