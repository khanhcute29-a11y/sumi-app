import React, { useMemo, useState } from 'react';
import { boPhanCuaHoSo, caCuaBoPhan, TEN_BO_PHAN } from '../../lib/chamCong';
import { upsertCaRiengCaNhan, xoaCaRiengCaNhan, updateShiftRule, tinhSoGioChuan } from '../../lib/queries';

// Tùy chỉnh ca làm QUY ĐỊNH cho TỪNG cá nhân (Individual Shift Override) —
// khác với GioLamRiengPanel (giờ khác chuẩn cho 1 NGÀY cụ thể, staff_shift_
// overrides). Đây là giờ "chính thức" dùng lâu dài, thay hẳn giờ mặc định
// của bộ phận cho đúng người này.
//
// Tái dùng CƠ CHẾ ĐÃ CÓ SẴN: bảng sumi_quy_dinh_ca, dùng id nhân viên làm
// bo_phan (migration 202608300800, trước đây 11 người đã được set thẳng
// bằng SQL, CHƯA có giao diện) — không tạo bảng mới chồng chéo. RLS ghi
// bảng này chỉ owner/admin (is_business_director) nên component này KHÔNG
// tự kiểm tra quyền, chỗ gọi nó (ChiTietNhanSuModal) đã gate sẵn.
export default function CaCaNhanPanel({ hoSo, danhSachCa, onDone }) {
  const boPhan = boPhanCuaHoSo(hoSo);
  const caBoPhan = useMemo(() => caCuaBoPhan(danhSachCa, boPhan), [danhSachCa, boPhan]);
  const caRieng = useMemo(
    () => (danhSachCa || []).find((c) => c.boPhan === hoSo?.id),
    [danhSachCa, hoSo?.id],
  );

  const [dangSua, setDangSua] = useState(false);
  const [gioBatDau, setGioBatDau] = useState('');
  const [gioKetThuc, setGioKetThuc] = useState('');
  const [khongNghiTrua, setKhongNghiTrua] = useState(false);
  const [phamVi, setPhamVi] = useState('ca_nhan'); // 'ca_nhan' | 'bo_phan'
  const [caBoPhanChon, setCaBoPhanChon] = useState('');
  const [saving, setSaving] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');

  if (!boPhan) return null; // không theo ca cố định (giám đốc, kế toán…) — không có gì để sửa

  const batDauSua = () => {
    setGioBatDau(caRieng?.batDau || caBoPhan[0]?.batDau || '06:00');
    setGioKetThuc(caRieng?.ketThuc || caBoPhan[0]?.ketThuc || '15:00');
    setKhongNghiTrua(caRieng?.khongNghiTrua || false);
    setPhamVi('ca_nhan');
    setCaBoPhanChon(caBoPhan[0]?.id || '');
    setLoi(''); setXong('');
    setDangSua(true);
  };

  const luu = async () => {
    if (!gioBatDau || !gioKetThuc) { setLoi('Chọn đủ giờ bắt đầu và giờ kết thúc.'); return; }
    if (gioKetThuc <= gioBatDau) { setLoi('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    setSaving(true); setLoi('');
    try {
      if (phamVi === 'ca_nhan') {
        await upsertCaRiengCaNhan({ staffId: hoSo.id, staffName: hoSo.full_name, gioBatDau, gioKetThuc, khongNghiTrua });
      } else {
        if (!caBoPhanChon) throw new Error('Chọn ca của bộ phận cần sửa.');
        const caDangSua = caBoPhan.find((c) => c.id === caBoPhanChon);
        await updateShiftRule(caBoPhanChon, {
          gioBatDau, soGioChuan: tinhSoGioChuan(gioBatDau, gioKetThuc),
          phutDenSomToiThieu: caDangSua?.phutSom ?? 10,
        });
      }
      setXong('Đã lưu.');
      setDangSua(false);
      await onDone?.();
    } catch (e) {
      setLoi(e?.message || 'Không lưu được.');
    } finally { setSaving(false); }
  };

  const goCaRieng = async () => {
    if (!window.confirm(`Gỡ ca riêng của ${hoSo?.full_name || 'người này'}? Sẽ quay lại dùng giờ chung của bộ phận.`)) return;
    setSaving(true); setLoi('');
    try { await xoaCaRiengCaNhan(hoSo.id); setXong('Đã gỡ ca riêng.'); await onDone?.(); }
    catch (e) { setLoi(e?.message || 'Không gỡ được.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #eadcca' }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2d1c10', marginBottom: 6 }}>
        ⏰ Ca làm QUY ĐỊNH
      </div>

      {!dangSua ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#fff7ed', borderRadius: 10, padding: '8px 10px' }}>
          <span style={{ fontSize: 12.5 }}>
            {caRieng ? (
              <>👤 Ca riêng: <strong>{caRieng.batDau}–{caRieng.ketThuc}</strong>{caRieng.khongNghiTrua ? ' · liên tục, không nghỉ trưa' : ''}</>
            ) : caBoPhan.length ? (
              <>Theo {TEN_BO_PHAN[boPhan] || boPhan}: {caBoPhan.map((c) => `${c.batDau}–${c.ketThuc}`).join(' · ')}</>
            ) : 'Chưa khai báo ca cho bộ phận này.'}
          </span>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {caRieng && (
              <button type="button" disabled={saving} onClick={goCaRieng} style={{ border: 'none', background: 'none', color: '#dc2626', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>Gỡ</button>
            )}
            <button type="button" onClick={batDauSua} style={{ border: 'none', background: 'none', color: '#c2410c', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>✏️ Sửa</button>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #eadcca', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: '#725f50' }}>
              Giờ bắt đầu
              <input type="time" value={gioBatDau} onChange={(e) => setGioBatDau(e.target.value)}
                style={{ display: 'block', minHeight: 36, borderRadius: 8, border: '1px solid #eadcca', padding: '0 8px' }} />
            </label>
            <label style={{ fontSize: 11, color: '#725f50' }}>
              Giờ kết thúc
              <input type="time" value={gioKetThuc} onChange={(e) => setGioKetThuc(e.target.value)}
                style={{ display: 'block', minHeight: 36, borderRadius: 8, border: '1px solid #eadcca', padding: '0 8px' }} />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={khongNghiTrua} onChange={(e) => setKhongNghiTrua(e.target.checked)} />
            Ca liên tục, không nghỉ trưa (bỏ qua nhận diện nghỉ trưa 11h–13h)
          </label>

          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#2d1c10', marginTop: 2 }}>Phạm vi áp dụng</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name={`phamVi-${hoSo?.id}`} checked={phamVi === 'ca_nhan'} onChange={() => setPhamVi('ca_nhan')} />
            Chỉ áp dụng cho nhân sự này
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: caBoPhan.length ? 'pointer' : 'not-allowed', opacity: caBoPhan.length ? 1 : 0.5 }}>
            <input type="radio" name={`phamVi-${hoSo?.id}`} checked={phamVi === 'bo_phan'} onChange={() => setPhamVi('bo_phan')} disabled={!caBoPhan.length} />
            Áp dụng cho cả {TEN_BO_PHAN[boPhan] || boPhan}
          </label>
          {phamVi === 'bo_phan' && caBoPhan.length > 1 && (
            <select value={caBoPhanChon} onChange={(e) => setCaBoPhanChon(e.target.value)}
              style={{ minHeight: 36, borderRadius: 8, border: '1px solid #eadcca', padding: '0 8px', fontSize: 12 }}>
              {caBoPhan.map((c) => <option key={c.id} value={c.id}>{c.ten} ({c.batDau}–{c.ketThuc})</option>)}
            </select>
          )}
          {phamVi === 'bo_phan' && (
            <div style={{ fontSize: 11, color: '#b45309' }}>
              ⚠️ Ảnh hưởng TẤT CẢ nhân sự đang theo ca này trong {TEN_BO_PHAN[boPhan] || boPhan}, không chỉ riêng {hoSo?.full_name}.
            </div>
          )}

          {loi && <div style={{ color: '#dc2626', fontSize: 12 }}>⚠️ {loi}</div>}

          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" disabled={saving} onClick={luu} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: '#c2410c', color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
            <button type="button" disabled={saving} onClick={() => setDangSua(false)} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #eadcca', background: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
              Huỷ
            </button>
          </div>
        </div>
      )}
      {xong && !dangSua && <div style={{ color: '#087f5b', fontSize: 11.5, marginTop: 4 }}>✅ {xong}</div>}
    </div>
  );
}
