import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import NhanVienV2 from './NhanVienV2';
import QuanLyV2 from './QuanLyV2';
import TongQuanGiamDoc from './TongQuanGiamDoc';
import DeXuatChoDuyet from './DeXuatChoDuyet';
import ChiTietNhanSuModal from './ChiTietNhanSuModal';
import { theoCaCoDinh } from './luongNhanSu';
import '../../../styles/cham-cong-v2.css';

// Cửa ngõ của giao diện Chấm Công V2: chọn góc nhìn theo vai trò, nạp dữ liệu
// thưởng sao, và GIỮ hộp chi tiết nhân sự.
//
// Hộp chi tiết nằm ở đây chứ không nằm trong từng màn hình con, vì có nhiều
// đường dẫn tới nó: ô tổng quan của Giám đốc, mục "Theo bộ phận", và danh sách
// đội của Quản lý. Nhiều nơi cùng mở một hộp thì chỉ nên có MỘT hộp.
//
// ⚠️ THÀNH PHẦN NÀY KHÔNG TỰ GỌI API CHẤM CÔNG.
// Việc vào ca / tan ca vẫn do `ShiftsScreen` giữ nguyên như cũ
// (addShiftCheckin, addShiftCheckout) — đây chỉ là lớp hiển thị. Đổi giao diện
// mà đổi luôn đường ghi dữ liệu là cách nhanh nhất để mất dấu vết kiểm toán và
// lọt qua trigger tính đi muộn.

export default function ChamCongV2({
  hoSo,
  laQuanLy, laGiamDoc,
  danhSachQuanLy, toiTrongDanhSach, chamCuaToi,
  danhSachCa, boPhanTheoNguoi, boPhanCuaToi,
  logsHomNay, tomTat, gioHienTai,
  onCheckin, onCheckout, onTaiLai,
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

  // Số hiện trên đầu trang Giám đốc. Mẫu số chỉ tính người THEO CA CỐ ĐỊNH —
  // giám đốc và kế toán không phải chấm công nên không nằm trong đó, và người
  // đã có đơn xin nghỉ cũng không bị tính là vắng.
  const { soDaVao, soPhaiCoMat } = useMemo(() => {
    let vao = 0; let phai = 0;
    (danhSachQuanLy || []).forEach(({ hoSo: h, cham }) => {
      if (!theoCaCoDinh(h)) return;
      if (cham?.xinNghi && !cham?.vaoISO) return;
      phai += 1;
      if (cham?.vaoISO) vao += 1;
    });
    return { soDaVao: vao, soPhaiCoMat: phai };
  }, [danhSachQuanLy]);

  const hopChiTiet = dangXem ? (
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
  ) : null;

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
        deXuatGia={deXuatGia}
      />
    );
  }

  // ── Giám đốc ──────────────────────────────────────────────────────────
  //
  // KHÔNG kèm màn hình Quản lý ở dưới nữa. Giám đốc bấm vào một luồng là thấy
  // đủ cả quản lý lẫn thợ trong luồng đó, nên danh sách đội ở dưới chỉ lặp lại
  // đúng những người vừa xem — thừa một màn hình cuộn dài trên điện thoại.
  if (laGiamDoc) {
    const ngay = `${String(gioHienTai.getDate()).padStart(2, '0')}/${String(gioHienTai.getMonth() + 1).padStart(2, '0')}/${gioHienTai.getFullYear()}`;
    return (
      <div className="cc2">
        <header className="cc2-hero navy">
          <div className="cc2-hero-top">
            <div className="cc2-identity">
              <div className="cc2-avatar">👑</div>
              <div style={{ minWidth: 0 }}>
                <div className="cc2-eyebrow">GIÁM ĐỐC · TOÀN SUMI</div>
                <div className="cc2-name">Chấm công toàn hệ thống</div>
              </div>
            </div>
          </div>
          <div className="cc2-clock">
            <div>
              <strong>{soDaVao}/{soPhaiCoMat}</strong>
              <br />
              <span>nhân sự đã vào ca</span>
            </div>
            <div className="cc2-date-chip">{ngay}</div>
          </div>
        </header>

        <main style={{ padding: '0 2px' }}>
          <TongQuanGiamDoc
            danhSach={danhSachQuanLy}
            gioHienTai={gioHienTai}
            onXemNhanSu={setDangXem}
          />
          <DeXuatChoDuyet
            hoSo={hoSo}
            capCuaToi={2}
            duLieuGia={deXuatGia}
            onDaXuLy={taiLai}
          />
        </main>

        {hopChiTiet}
      </div>
    );
  }

  // ── Quản lý khâu ──────────────────────────────────────────────────────
  return (
    <div className="cc2">
      <QuanLyV2
        hoSo={hoSo}
        danhSach={danhSachQuanLy}
        toi={toiTrongDanhSach}
        laGiamDoc={false}
        gioHienTai={gioHienTai}
        onCheckin={onCheckin}
        onCheckout={onCheckout}
        onXemNhanSu={setDangXem}
      />

      <main style={{ padding: '0 2px' }}>
        <DeXuatChoDuyet
          hoSo={hoSo}
          capCuaToi={1}
          duLieuGia={deXuatGia}
          onDaXuLy={taiLai}
        />
      </main>

      {hopChiTiet}
    </div>
  );
}
