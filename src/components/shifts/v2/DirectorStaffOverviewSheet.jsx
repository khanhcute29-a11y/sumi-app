import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import TongQuanGiamDoc from './TongQuanGiamDoc';
import ChiTietNhanSuModal from './ChiTietNhanSuModal';
import { fetchChamCongHomNayGomBoPhan } from '../../../lib/chamCongHomNay';
import '../../../styles/cham-cong-v2.css';

// "Tổng Quan Nhân Sự Hôm Nay" — mở từ ô "ĐANG LÀM VIỆC" trên Dashboard Giám
// đốc (BossOverviewV3). TÁI SỬ DỤNG đúng cấu trúc chi tiết của "Chấm công và
// lịch" bên cá nhân — TongQuanGiamDoc (nhóm theo bộ phận, bấm sâu 3 tầng) +
// ChiTietNhanSuModal (giữ nguyên tính năng đánh giá Sao +/- đã tích hợp) —
// không dựng lại giao diện riêng cho Dashboard.
//
// Tự fetch dữ liệu riêng qua fetchChamCongHomNayGomBoPhan(), KHÔNG đụng vào
// ShiftsScreen.jsx đang chạy ổn định (tránh rủi ro refactor màn cá nhân chỉ
// để phục vụ Dashboard).
export default function DirectorStaffOverviewSheet({ hoSo, onClose, onMoQuanLyCa }) {
  const [duLieu, setDuLieu] = useState(null); // { danhSachQuanLy, danhSachCa, gioHienTai }
  const [logsHomNay, setLogsHomNay] = useState([]);
  const [thuongTheoNguoi, setThuongTheoNguoi] = useState({});
  const [dangXem, setDangXem] = useState(null);
  const [loi, setLoi] = useState('');

  const taiThuong = useCallback(async () => {
    try {
      const hn = new Date();
      const dauThang = `${hn.getFullYear()}-${String(hn.getMonth() + 1).padStart(2, '0')}-01`;
      const { data, error } = await supabase
        .from('staff_rewards')
        .select('id,staff_id,title,amount,awarded_on,note,so_sao')
        .gte('awarded_on', dauThang)
        .order('awarded_on', { ascending: false });
      if (error) throw error;
      const theo = {};
      (data || []).forEach((t) => {
        if (!theo[t.staff_id]) theo[t.staff_id] = [];
        theo[t.staff_id].push(t);
      });
      setThuongTheoNguoi(theo);
    } catch {
      setThuongTheoNguoi({});
    }
  }, []);

  const taiLai = useCallback(async () => {
    try {
      const { danhSachQuanLy, danhSachCa, gioHienTai, logs } = await fetchChamCongHomNayGomBoPhan();
      setDuLieu({ danhSachQuanLy, danhSachCa, gioHienTai });
      setLogsHomNay(logs || []);
      setLoi('');
    } catch (e) {
      setLoi(e?.message || 'Không tải được dữ liệu chấm công hôm nay.');
    }
    await taiThuong();
  }, [taiThuong]);

  useEffect(() => { taiLai(); }, [taiLai]);

  return (
    <div
      className="cc2"
      style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, background: '#FAF6F0',
          borderRadius: '20px 20px 0 0', padding: 20,
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '92dvh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, minWidth: 0 }}>👥 Tổng Quan Nhân Sự Hôm Nay</h3>
          {onMoQuanLyCa && (
            <button onClick={onMoQuanLyCa} style={{
              flexShrink: 0, border: '1px solid #eadcca', background: '#fff7ed', color: '#c2410c',
              fontWeight: 800, fontSize: 12, borderRadius: 10, padding: '6px 10px', cursor: 'pointer',
            }}>
              ⏰ Sửa giờ ca
            </button>
          )}
          <button onClick={onClose} aria-label="Đóng" style={{ border: 0, background: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {loi && <div className="cc2-error">⚠️ {loi}</div>}

        {!duLieu ? (
          <div style={{ fontSize: 13, color: '#8C5A3C' }}>Đang tải…</div>
        ) : (
          <TongQuanGiamDoc
            danhSach={duLieu.danhSachQuanLy}
            gioHienTai={duLieu.gioHienTai}
            onXemNhanSu={setDangXem}
          />
        )}
      </div>

      {dangXem && (
        <div onClick={(e) => e.stopPropagation()}>
          <ChiTietNhanSuModal
            nhanSu={dangXem.hoSo}
            cham={dangXem.cham}
            logs={(logsHomNay || []).filter((l) => l.staff_id === dangXem.hoSo.id)}
            danhSachCa={duLieu?.danhSachCa}
            boPhan={dangXem.cham?.boPhan || null}
            thuong={thuongTheoNguoi?.[dangXem.hoSo.id] || []}
            coTheTangSao
            laChinhToi={dangXem.hoSo.id === hoSo?.id}
            nguoiXem={hoSo}
            onClose={() => setDangXem(null)}
            onXong={taiLai}
          />
        </div>
      )}
    </div>
  );
}
