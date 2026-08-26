import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import NhanVienV2 from './NhanVienV2';
import QuanLyV2 from './QuanLyV2';
import TongQuanGiamDoc from './TongQuanGiamDoc';
import DeXuatChoDuyet from './DeXuatChoDuyet';
import ChiTietNhanSuModal from './ChiTietNhanSuModal';
import '../../../styles/cham-cong-v2.css';

// Cửa ngõ của giao diện Chấm Công V2: chọn góc nhìn theo vai trò, nạp dữ liệu
// thưởng sao, và GIỮ hộp chi tiết nhân sự.
//
// Hộp chi tiết nằm ở đây chứ không nằm trong từng màn hình con, vì có tới ba
// đường dẫn tới nó: danh sách đội của Quản lý, ô tổng quan của Giám đốc, và
// mục "Theo bộ phận". Ba nơi cùng mở một hộp thì chỉ nên có MỘT hộp.
//
// ⚠️ THÀNH PHẦN NÀY KHÔNG TỰ GỌI API CHẤM CÔNG.
// Việc vào ca / tan ca / xin nghỉ vẫn do `ShiftsScreen` giữ nguyên như cũ
// (addShiftCheckin, addShiftCheckout, addLeaveRequest, createApprovalRequest)
// — đây chỉ là lớp hiển thị. Đổi giao diện mà đổi luôn đường ghi dữ liệu là
// cách nhanh nhất để mất dấu vết kiểm toán và lọt qua trigger tính đi muộn.

export default function ChamCongV2({
  hoSo,
  laQuanLy, laGiamDoc,
  danhSachQuanLy, toiTrongDanhSach, chamCuaToi,
  danhSachCa, boPhanTheoNguoi, boPhanCuaToi,
  logsHomNay, tomTat, gioHienTai,
  onCheckin, onCheckout, onXinNghi, onTaiLai,
  deXuatGia = null,   // chỉ trang xem thử truyền vào; app thật luôn null
}) {
  const [thuongTheoNguoi, setThuongTheoNguoi] = useState({});
  const [dangXem, setDangXem] = useState(null);

  // Thưởng sao. Bảng `staff_rewards` do đồng đội tạo (migration 202608260150) —
  // có thể chưa được chạy trên máy chủ này. Trường hợp đó coi như chưa ai có
  // thưởng, KHÔNG làm hỏng cả màn hình chấm công.
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

  useEffect(() => { taiThuong(); }, [taiThuong]);

  const taiLai = useCallback(async () => {
    await Promise.all([onTaiLai?.(), taiThuong()]);
  }, [onTaiLai, taiThuong]);

  // ── Nhân viên thường ──────────────────────────────────────────────────
  if (!laQuanLy) {
    return (
      <NhanVienV2
        hoSo={hoSo}
        cham={chamCuaToi}
        danhSachCa={danhSachCa}
        boPhan={boPhanCuaToi}
        logsHomNay={(logsHomNay || []).filter((l) => l.staff_id === hoSo?.id)}
        tomTat={tomTat}
        thuong={thuongTheoNguoi[hoSo?.id] || []}
        gioHienTai={gioHienTai}
        onCheckin={onCheckin}
        onCheckout={onCheckout}
        onXinNghi={onXinNghi}
      />
    );
  }

  // ── Quản lý & Giám đốc ────────────────────────────────────────────────
  return (
    <div className="cc2">
      {/* Giám đốc nhìn bức tranh toàn tiệm TRƯỚC, rồi mới xuống từng người —
          đúng thứ tự của mockup. Quản lý khâu thì ngược lại: ca của mình và
          đội mình trước, vì họ cũng phải tự chấm công như mọi người. */}
      {laGiamDoc && (
        <main style={{ padding: '0 2px', marginBottom: 6 }}>
          <TongQuanGiamDoc
            danhSach={danhSachQuanLy}
            gioHienTai={gioHienTai}
            onXemNhanSu={setDangXem}
          />
          <DeXuatChoDuyet hoSo={hoSo} coQuyenDuyet={laGiamDoc} duLieuGia={deXuatGia} />
        </main>
      )}

      <QuanLyV2
        hoSo={hoSo}
        danhSach={danhSachQuanLy}
        toi={toiTrongDanhSach}
        laGiamDoc={laGiamDoc}
        gioHienTai={gioHienTai}
        onCheckin={onCheckin}
        onCheckout={onCheckout}
        onXemNhanSu={setDangXem}
      />

      {dangXem && (
        <ChiTietNhanSuModal
          nhanSu={dangXem.hoSo}
          cham={dangXem.cham}
          logs={(logsHomNay || []).filter((l) => l.staff_id === dangXem.hoSo.id)}
          danhSachCa={danhSachCa}
          boPhan={boPhanTheoNguoi?.[dangXem.hoSo.id] || null}
          thuong={thuongTheoNguoi?.[dangXem.hoSo.id] || []}
          coTheTangSao
          laChinhToi={dangXem.hoSo.id === hoSo?.id}
          onClose={() => setDangXem(null)}
          onXong={taiLai}
        />
      )}
    </div>
  );
}
