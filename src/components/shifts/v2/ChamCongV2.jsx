import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import NhanVienV2 from './NhanVienV2';
import QuanLyV2 from './QuanLyV2';
import TongQuanGiamDoc from './TongQuanGiamDoc';
import DeXuatChoDuyet from './DeXuatChoDuyet';
import ChiTietNhanSuModal from './ChiTietNhanSuModal';
import { theoCaCoDinh } from './luongNhanSu';
import { doDaiPhut, gomPhien } from './dungChung';
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
  onCheckin, onCheckout, onThemCa, onTaiLai,
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
        onThemCa={onThemCa}
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
    // Trước đây Giám đốc/Kế toán bị coi là "không phải chấm công" nên nhánh
    // này CHƯA BAO GIỜ có ô tự chấm công của chính mình — chỉ có màn tổng
    // quan toàn hệ thống (xem người khác). Theo yêu cầu mới: mọi vai trò đều
    // phải chấm công được. Thêm đúng khối "CHẤM CÔNG CỦA TÔI" — dùng lại
    // nguyên cấu trúc/class đã có ở QuanLyV2.jsx (bếp trưởng/quản lý khâu) để
    // đồng bộ giao diện, gọi thẳng onCheckin/onCheckout có sẵn — không thêm
    // đường ghi dữ liệu nào mới.
    const cuaToi = chamCuaToi;
    const caToi = cuaToi?.ca || null;
    const devToi = cuaToi?.chenhLech || null;
    // Trạng thái nút bấm PHẢI theo PHIÊN (gomPhien), không phải theo
    // "đã từng vào ca / đã từng ra ca hôm nay" (cuaToi?.vaoISO/raISO chỉ gộp
    // lần vào ĐẦU và lần ra CUỐI, đúng cho 1 ca duy nhất). TRƯỚC ĐÂY nhánh
    // Giám đốc dùng cuaToi?.raISO để khoá cứng nút "✓ ĐÃ XONG CA" — hễ tan ca
    // 1 lần trong ngày là kẹt luôn, không "Bắt đầu ca mới" lại được như Nhân
    // viên (NhanVienV2.jsx đã dùng gomPhien từ trước) — vá theo đúng yêu cầu
    // đồng bộ luồng thao tác cho mọi cấp bậc.
    const logsCuaToi = (logsHomNay || []).filter((l) => l.staff_id === hoSo?.id);
    const phienToi = gomPhien(logsCuaToi);
    const phienHienTaiToi = phienToi[phienToi.length - 1] || null;
    const dangTrongCaToi = !!(phienHienTaiToi && !phienHienTaiToi.ra);
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
          <div className="cc2-section-title"><span>CHẤM CÔNG CỦA TÔI</span></div>
          <section className="cc2-lead-own">
            <div className="cc2-lead-own-top">
              <div style={{ minWidth: 0 }}>
                <small className="cc2-eyebrow" style={{ color: 'var(--cc2-navy)' }}>
                  {(caToi?.ten || 'KHÔNG THEO CA CỐ ĐỊNH').toUpperCase()}
                </small>
                <br />
                <b>{caToi ? `${caToi.ten} · ${caToi.batDau}–${caToi.ketThuc}` : 'Giờ linh hoạt'}</b>
              </div>
              <span className="cc2-status">
                {dangTrongCaToi ? '● Đang trong ca' : phienHienTaiToi ? '● Đã tan ca' : '● Chưa vào ca'}
              </span>
            </div>

            <div className="cc2-lead-own-times">
              <div className="cc2-lead-own-time">
                <small>Giờ vào</small>
                <strong>
                  {cuaToi?.vao || '--:--'}
                  {devToi && cuaToi?.vaoISO && (
                    <span className={`cc2-kpi-tag ${devToi.loaiVao === 'late' ? 'cc2-kpi-bad' : 'cc2-kpi-good'}`}
                      style={{ fontSize: 9 }}>
                      {devToi.loaiVao === 'late' ? `TRỄ ${doDaiPhut(devToi.lechVao)}` : devToi.loaiVao === 'early' ? `SỚM ${doDaiPhut(devToi.lechVao)}` : 'ĐÚNG MỐC'}
                    </span>
                  )}
                </strong>
              </div>
              <div className="cc2-lead-own-time">
                <small>Giờ ra</small>
                <strong>{cuaToi?.ra || '--:--'}</strong>
              </div>
            </div>

            <div className="cc2-lead-own-action">
              <button onClick={() => setDangXem({ hoSo, cham: cuaToi })}>🕘 XEM LỊCH SỬ</button>
              {!phienHienTaiToi && (
                <button className="primary-small" onClick={onCheckin}>▶ BẮT ĐẦU CA</button>
              )}
              {dangTrongCaToi && (
                <button className="primary-small" onClick={onCheckout}>🏁 KẾT THÚC CA</button>
              )}
              {phienHienTaiToi && !dangTrongCaToi && (
                <button className="primary-small" onClick={onCheckin}>➕ CHẤM CA MỚI</button>
              )}
            </div>
            {/* Bổ sung ca quên chấm — AI CŨNG bấm được, không riêng nhân
                viên thường, không giới hạn theo trạng thái ca hiện tại. */}
            {onThemCa && (
              <button onClick={onThemCa} style={{
                marginTop: 8, width: '100%', minHeight: 40, borderRadius: 12,
                border: '2px dashed var(--cc2-line, #d7c3aa)', background: 'transparent',
                color: 'var(--cc2-cocoa, #8c5a3c)', fontWeight: 800, fontSize: 13, cursor: 'pointer',
              }}>
                ＋ Bổ sung ca đã làm (quên chấm)
              </button>
            )}
          </section>

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
        logsHomNay={logsHomNay}
        onCheckin={onCheckin}
        onCheckout={onCheckout}
        onThemCa={onThemCa}
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
