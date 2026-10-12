import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { localDateStr } from '../../lib/date';
import { timLanVaoQuenChamRa, kiemTraGioRa, kiemTraCaMoi, hienGioNgay } from '../../lib/boSungCa';

// Giám đốc sửa chấm công cho nhân viên (Giám đốc chốt 12/10/2026): qua ngày mới
// nhân viên KHÔNG tự bổ sung ca hôm trước được nữa (trigger
// sumi_chan_cham_cong_ngay_cu), ca quên chấm ra để Giám đốc xử lý tại đây.
// Ghi qua RPC sumi_gd_bo_sung_cham_cong — database tự kiểm tra quyền Giám đốc,
// lần vào còn mở, không chồng giờ; kiểm tra ở đây chỉ để báo lỗi sớm, dễ hiểu.
// Chỉ hiện cho owner/admin (ChiTietNhanSuModal gate bằng duocSuaCaQuyDinh).

const oNhap = { minHeight: 38, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' };

export default function SuaChamCongPanel({ hoSo, onDone }) {
  const [mo, setMo] = useState(false);
  const [lichSu, setLichSu] = useState(null);
  const [cheDo, setCheDo] = useState('them_gio_ra');
  const [lanVaoId, setLanVaoId] = useState('');
  const [ngayRa, setNgayRa] = useState('');
  const [gioRa, setGioRa] = useState('');
  const [ngayCa, setNgayCa] = useState('');
  const [gioVaoCa, setGioVaoCa] = useState('');
  const [gioRaCa, setGioRaCa] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');
  const homNay = localDateStr();

  const taiLai = async () => {
    const tu = new Date(); tu.setDate(tu.getDate() - 31);
    const { data, error } = await supabase.from('shift_logs')
      .select('id,type,work_date,checkin_time,shift_label,branch,reason')
      .eq('staff_id', hoSo.id).in('type', ['checkin', 'checkout'])
      .gte('work_date', localDateStr(tu))
      .order('checkin_time', { ascending: true });
    if (error) { setLichSu([]); setLoi('Không tải được lịch sử chấm công.'); return; }
    setLichSu(data || []);
  };
  useEffect(() => { if (mo) taiLai(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mo, hoSo.id]);

  const caMo = useMemo(() => (lichSu ? timLanVaoQuenChamRa(lichSu, homNay, { kemCaDangMo: true }) : []), [lichSu, homNay]);
  const lanVao = caMo.find((x) => x.log.id === lanVaoId) || caMo[0];
  useEffect(() => {
    if (lanVao && !lanVaoId) { setLanVaoId(lanVao.log.id); setNgayRa(lanVao.log.work_date); }
    if (lichSu && !caMo.length) setCheDo('ca_moi');
  }, [lanVao, lanVaoId, lichSu, caMo.length]);

  const luu = async () => {
    setLoi(''); setXong('');
    let thamSo;
    if (cheDo === 'them_gio_ra') {
      if (!lanVao || !gioRa || !ngayRa) { setLoi('Chọn lần vào ca và nhập ngày, giờ ra.'); return; }
      const ra = new Date(`${ngayRa}T${gioRa}:00`);
      const l = kiemTraGioRa({ lanVao, gioRa: ra, now: new Date() });
      if (l) { setLoi(l); return; }
      thamSo = { p_staff_id: hoSo.id, p_lan_vao_id: lanVao.log.id, p_gio_vao: null, p_gio_ra: ra.toISOString(), p_ghi_chu: ghiChu || null };
    } else {
      if (!ngayCa || !gioVaoCa || !gioRaCa) { setLoi('Nhập ngày, giờ vào và giờ ra của ca.'); return; }
      const vao = new Date(`${ngayCa}T${gioVaoCa}:00`);
      const ra = new Date(`${ngayCa}T${gioRaCa}:00`);
      const l = kiemTraCaMoi({ logs: lichSu || [], gioVao: vao, gioRa: ra, now: new Date() });
      if (l) { setLoi(l.replace(/hãy chọn "Thêm giờ ra cho ca quên chấm" ở trên/, 'chọn "Thêm giờ ra" cho lần vào đó')); return; }
      thamSo = { p_staff_id: hoSo.id, p_lan_vao_id: null, p_gio_vao: vao.toISOString(), p_gio_ra: ra.toISOString(), p_ghi_chu: ghiChu || null };
    }
    setDangGui(true);
    try {
      const { error } = await supabase.rpc('sumi_gd_bo_sung_cham_cong', thamSo);
      if (error) throw error;
      setXong(cheDo === 'them_gio_ra' ? 'Đã thêm giờ ra.' : 'Đã thêm ca.');
      setGioRa(''); setGioVaoCa(''); setGioRaCa(''); setGhiChu(''); setLanVaoId('');
      await taiLai();
      await onDone?.();
    } catch (e) {
      setLoi(e?.message || 'Không lưu được.');
    } finally { setDangGui(false); }
  };

  const nut = (gt, nhan) => (
    <button type="button" onClick={() => { setCheDo(gt); setLoi(''); setXong(''); }}
      style={{ flex: 1, minHeight: 38, borderRadius: 8, border: '1px solid var(--border-default)', background: cheDo === gt ? 'var(--action-primary)' : 'var(--surface-card)', color: cheDo === gt ? '#fff' : 'var(--text-primary)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>{nhan}</button>
  );

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
      <button type="button" onClick={() => setMo((v) => !v)}
        style={{ width: '100%', minHeight: 44, textAlign: 'left', border: 'none', background: 'none', padding: 0, font: 'var(--text-caption)', fontWeight: 800, color: 'var(--text-primary)', cursor: 'pointer' }}>
        🛠 Sửa chấm công (Giám đốc) {mo ? '▲' : '▼'}
      </button>
      {mo && (
        <>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', marginBottom: 8 }}>
            Nhân viên chỉ tự bổ sung được trong ngày. Ca quên chấm ra của ngày đã qua sửa ở đây. Mọi lần sửa đều ghi nhãn [BỔ SUNG][Giám đốc].
          </div>
          {lichSu === null ? (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang tải…</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {nut('them_gio_ra', `Thêm giờ ra (${caMo.length} ca mở)`)}
                {nut('ca_moi', 'Thêm ca bị sót')}
              </div>

              {cheDo === 'them_gio_ra' ? (
                caMo.length === 0 ? (
                  <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>31 ngày qua không có lần vào ca nào chưa chấm ra.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {caMo.map((x) => (
                        <button key={x.log.id} type="button" onClick={() => { setLanVaoId(x.log.id); setNgayRa(x.log.work_date); setLoi(''); }}
                          style={{ minHeight: 40, textAlign: 'left', padding: '6px 10px', borderRadius: 10, border: `2px solid ${x.log.id === lanVao?.log.id ? 'var(--action-primary)' : 'var(--border-default)'}`, background: 'var(--surface-card)', fontSize: 12.5, cursor: 'pointer' }}>
                          <strong>Vào lúc {hienGioNgay(x.log.checkin_time)}</strong>
                          <span style={{ color: 'var(--text-muted)' }}> · {x.log.shift_label || 'Ca làm việc'}{x.dangMo ? ' · đang mở hôm nay' : ''}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input type="date" value={ngayRa} max={homNay} onChange={(e) => setNgayRa(e.target.value)} title="Ngày về" style={oNhap} />
                      <input type="time" value={gioRa} onChange={(e) => setGioRa(e.target.value)} title="Giờ ra" style={oNhap} />
                    </div>
                  </>
                )
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="date" value={ngayCa} max={homNay} onChange={(e) => setNgayCa(e.target.value)} title="Ngày làm" style={oNhap} />
                  <input type="time" value={gioVaoCa} onChange={(e) => setGioVaoCa(e.target.value)} title="Giờ vào" style={oNhap} />
                  <input type="time" value={gioRaCa} onChange={(e) => setGioRaCa(e.target.value)} title="Giờ ra" style={oNhap} />
                </div>
              )}

              {(cheDo === 'ca_moi' || caMo.length > 0) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                  <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} placeholder="Ghi chú (VD: hỏi lại nhân viên về 23h)"
                    style={{ ...oNhap, flex: 1, minWidth: 160 }} />
                  <button type="button" disabled={dangGui} onClick={luu}
                    style={{ minHeight: 38, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--action-primary)', color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
                    {dangGui ? 'Đang lưu…' : 'Lưu'}
                  </button>
                </div>
              )}
            </>
          )}
          {loi && <div style={{ color: 'var(--status-danger)', fontSize: 12, marginTop: 6 }}>⚠️ {loi}</div>}
          {xong && <div style={{ color: '#087f5b', fontSize: 12, marginTop: 6 }}>✅ {xong}</div>}
        </>
      )}
    </div>
  );
}
