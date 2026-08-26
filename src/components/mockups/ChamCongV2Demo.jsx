import React, { useEffect, useState } from 'react';
import ChamCongV2 from '../shifts/v2/ChamCongV2';
import { chuanHoaCa, gomChamCongNgay, tomTatThang } from '../../lib/chamCong';

// Xem thử giao diện Chấm Công V2 mà KHÔNG cần đăng nhập.
//   http://localhost:5173/?mockup=cham-cong-v2
//
// Dùng dữ liệu giả, chỉ để duyệt bố cục và màu sắc trên máy thật.
// Nút bấm ở đây không ghi gì xuống database.
//
// ⚠️ Giờ ca dưới đây chép đúng bảng `sumi_quy_dinh_ca` đang chạy thật
// (Bakery 05:15 / 13:30, Xưởng & Vận tải 06:00 — mốc sớm 10 phút).
// KHÔNG phải giờ trong mockup HTML (05:30 / 06:00–14:00) — hai bộ giờ đó khác
// nhau và giờ thật mới là giờ dùng để tính lương.

const HOM_NAY = new Date().toISOString().slice(0, 10);

const CA_GIA = chuanHoaCa([
  { bo_phan: 'bakery', ma_ca: 'sang', ten_ca: 'Ca Sáng', gio_bat_dau: '05:15:00', so_gio_chuan: 9, phut_den_som_toi_thieu: 10 },
  { bo_phan: 'bakery', ma_ca: 'chieu', ten_ca: 'Ca Chiều', gio_bat_dau: '13:30:00', so_gio_chuan: 9, phut_den_som_toi_thieu: 10 },
  { bo_phan: 'xuong41', ma_ca: 'chinh', ten_ca: 'Ca Xưởng 41', gio_bat_dau: '06:00:00', so_gio_chuan: 9, phut_den_som_toi_thieu: 10 },
  { bo_phan: 'xuong42', ma_ca: 'chinh', ten_ca: 'Ca Xưởng 42', gio_bat_dau: '06:00:00', so_gio_chuan: 9, phut_den_som_toi_thieu: 10 },
  { bo_phan: 'van_tai', ma_ca: 'chinh', ten_ca: 'Ca Vận Tải', gio_bat_dau: '06:00:00', so_gio_chuan: 9, phut_den_som_toi_thieu: 10 },
]);

const NGUOI = [
  { id: 'u1', full_name: 'Hoàng Diễm', station: 'lanh', role: 'baker_cold' },
  { id: 'u2', full_name: 'Kim Tiến', station: 'lanh', role: 'baker_cold' },
  { id: 'u3', full_name: 'Nguyễn An', station: 'lanh', role: 'kitchen_lead_cold' },
  { id: 'u4', full_name: 'Trần Mai', station: 'nong', role: 'baker_hot' },
  { id: 'u5', full_name: 'Phạm Hùng', station: 'nong', role: 'kitchen_lead_hot' },
  { id: 'u6', full_name: 'Võ Thu Hà', station: null, role: 'cashier' },
  { id: 'u7', full_name: 'Đỗ Bích Ngọc', station: null, role: 'sale' },
  { id: 'u8', full_name: 'Lý Minh Khoa', station: 'xuong41', role: 'baker_macaron' },
  { id: 'u9', full_name: 'Lê Quang', station: 'xuong42', role: 'kho_xuong42' },
  { id: 'u10', full_name: 'Bùi Văn Tài', station: null, role: 'shipper' },
  { id: 'u11', full_name: 'Ngô Kim Chi', station: null, role: 'shipper_school' },
  { id: 'u12', full_name: 'Lê Thị Nga', station: null, role: 'accountant' },
];

const BO_PHAN = {
  u1: 'bakery', u2: 'bakery', u3: 'bakery', u4: 'bakery', u5: 'bakery',
  u6: 'bakery', u7: 'bakery',
  u8: 'xuong41', u9: 'xuong42',
  u10: 'van_tai', u11: 'van_tai',
  u12: null,          // kế toán: không theo ca cố định
};

// `expected_start` + `late_minutes` giả lập ĐÚNG như trigger database sẽ ghi.
function log(id, ten, loai, gio, extra = {}) {
  return {
    id: `${id}-${loai}-${gio}`,
    staff_id: id, staff_name: ten, work_date: HOM_NAY, type: loai,
    checkin_time: `${HOM_NAY}T${gio}:00+07:00`,
    branch: 'Vĩnh Phú 42', expected_start: '05:15:00',
    ...extra,
  };
}

const LOGS = [
  // Bếp lạnh
  log('u1', 'Hoàng Diễm', 'checkin', '04:55', { late_minutes: 0, gps_lat: 10.9121, gps_lng: 106.7354, gps_accuracy_m: 6 }),
  log('u2', 'Kim Tiến', 'checkin', '05:03', { late_minutes: 0, gps_lat: 10.9122, gps_lng: 106.7351, gps_accuracy_m: 9 }),
  log('u3', 'Nguyễn An', 'checkin', '05:33', { late_minutes: 28, reason: 'Kẹt xe cầu Vĩnh Phú', gps_lat: 10.9119, gps_lng: 106.7362, gps_accuracy_m: 14 }),
  // Bếp nóng — u4 chưa chấm gì cả
  log('u5', 'Phạm Hùng', 'checkin', '05:01', { late_minutes: 0 }),
  // Thu ngân đi muộn 9 phút
  log('u6', 'Võ Thu Hà', 'checkin', '05:14', { late_minutes: 9 }),
  // Bán hàng — đã làm xong ca
  log('u7', 'Đỗ Bích Ngọc', 'checkin', '05:00', { late_minutes: 0 }),
  log('u7', 'Đỗ Bích Ngọc', 'checkout', '14:20', {}),
  // Xưởng 41 (mốc 05:50)
  log('u8', 'Lý Minh Khoa', 'checkin', '05:45', { late_minutes: 0, expected_start: '06:00:00' }),
  // Xưởng 42 — vào rồi ra
  log('u9', 'Lê Quang', 'checkin', '05:48', { late_minutes: 0, expected_start: '06:00:00' }),
  log('u9', 'Lê Quang', 'checkout', '15:05', { expected_start: '06:00:00' }),
  // Vận tải — u10 muộn, u11 xin nghỉ
  log('u10', 'Bùi Văn Tài', 'checkin', '06:12', { late_minutes: 22, expected_start: '06:00:00' }),
  log('u11', 'Ngô Kim Chi', 'leave_request', '05:30', { reason: 'Con ốm, xin nghỉ cả ngày' }),
];

// Đề xuất giả — trang xem thử không đăng nhập nên không đọc được database thật.
const DE_XUAT_GIA = [
  // Đang chờ cấp 1
  {
    id: 'dx1', type: 'leave_request', status: 'pending',
    requester_id: 'u11', requester_name: 'Ngô Kim Chi', requester_role: 'Shipper trường học',
    leave_date: HOM_NAY, leave_scope: 'ca_ngay', leave_kind: 'om_dau',
    reason: 'Gửi anh Quân, con em bị ốm phải đưa đi khám nên em xin phép nghỉ cả ngày hôm nay ạ. Em cảm ơn!',
    cap1_status: 'pending',
    created_at: new Date(Date.now() - 42 * 60000).toISOString(),
  },
  // Cấp 1 đã duyệt, đang chờ Giám đốc
  {
    id: 'dx2', type: 'shift_recheck', status: 'pending',
    requester_id: 'u3', requester_name: 'Nguyễn An', requester_role: 'Bếp trưởng bếp lạnh',
    reason: 'Kẹt xe cầu Vĩnh Phú, xin xem lại 28 phút đi muộn sáng nay giúp em ạ.',
    cap1_status: 'approved', cap1_name: 'Phạm Thị Mai Phương',
    cap1_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    cap1_note: 'Có xác nhận của tổ trưởng',
    cap2_status: 'pending',
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  // Đã duyệt xong cả hai cấp
  {
    id: 'dx3', type: 'leave_request', status: 'approved',
    requester_id: 'u1', requester_name: 'Hoàng Diễm', requester_role: 'Thợ bếp lạnh',
    leave_date: '2026-08-20', leave_scope: 'nua_ca_sau', leave_kind: 'phep_nam',
    reason: 'Gửi anh Quân & chị Phượng, gia đình em có việc nên em xin phép nghỉ làm chiều nay để về quê ạ. Em cảm ơn!',
    cap1_status: 'approved', cap1_name: 'Phạm Thị Mai Phương',
    cap1_at: '2026-08-19T09:12:00+07:00',
    cap2_status: 'approved', cap2_name: 'Đinh Minh Quân',
    cap2_at: '2026-08-19T14:03:00+07:00',
    created_at: '2026-08-19T08:40:00+07:00',
  },
  // Bị từ chối ngay ở cấp 1
  {
    id: 'dx4', type: 'task_exemption', status: 'rejected',
    requester_id: 'u1', requester_name: 'Hoàng Diễm', requester_role: 'Thợ bếp lạnh',
    reason: 'Máy đánh kem hỏng, xin miễn việc chuẩn bị cốt bánh chiều nay.',
    cap1_status: 'rejected', cap1_name: 'Phạm Thị Mai Phương',
    cap1_at: '2026-08-24T10:20:00+07:00',
    cap1_note: 'Đã có máy dự phòng ở bếp nóng, em qua mượn nhé.',
    created_at: '2026-08-24T09:55:00+07:00',
  },
  {
    id: 'dx5', type: 'order_edit', status: 'pending',
    requester_id: 'u6', requester_name: 'Võ Thu Hà', requester_role: 'Thu ngân',
    order_code: 'SUMI-20260826-014',
    reason: 'Khách đổi từ size 18 sang size 22, xin sửa lại đơn giúp em.',
    cap1_status: 'pending',
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
  },
];

const THU = [
  { key: 'nhanvien', nhan: '👩‍🍳 Nhân viên' },
  { key: 'quanly', nhan: '🧑‍💼 Quản lý' },
  { key: 'giamdoc', nhan: '👑 Giám đốc' },
];

export default function ChamCongV2Demo() {
  const [vai, setVai] = useState('nhanvien');
  const [gio, setGio] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setGio(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const chamNgay = gomChamCongNgay(LOGS, CA_GIA, BO_PHAN);
  const rong = (id, ten) => ({
    staffId: id, ten, vaoISO: null, raISO: null, vao: null, ra: null,
    ca: CA_GIA.find((c) => c.boPhan === BO_PHAN[id]) || null,
    coCaChuan: true, chenhLech: null, trangThai: 'upcoming', ghiChu: '', xinNghi: false, soGio: null,
  });

  const danhSach = NGUOI.map((h) => ({ hoSo: h, cham: chamNgay.get(h.id) || rong(h.id, h.full_name) }));

  const laGiamDoc = vai === 'giamdoc';
  const laQuanLy = vai !== 'nhanvien';
  const toi = laQuanLy ? NGUOI[0] : NGUOI[0];
  const chamCuaToi = chamNgay.get(toi.id) || rong(toi.id, toi.full_name);

  return (
    <div style={{ minHeight: '100dvh', background: '#e9e3da', padding: '0 0 40px' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 50, display: 'grid',
        gridTemplateColumns: 'repeat(3,1fr)', gap: 5, padding: 10, background: '#26170f',
      }}>
        {THU.map((t) => (
          <button key={t.key} onClick={() => setVai(t.key)} style={{
            minHeight: 48, borderRadius: 12, cursor: 'pointer', fontWeight: 850, fontSize: 13,
            border: '1px solid rgba(255,255,255,.16)',
            background: vai === t.key ? '#fff' : 'rgba(255,255,255,.07)',
            color: vai === t.key ? '#2C1D11' : '#fff',
          }}>{t.nhan}</button>
        ))}
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: 12, background: '#FDFBF7', minHeight: '80dvh' }}>
        <ChamCongV2
          hoSo={{ id: toi.id, full_name: toi.full_name }}
          laQuanLy={laQuanLy}
          laGiamDoc={laGiamDoc}
          danhSachQuanLy={danhSach}
          toiTrongDanhSach={danhSach.find((x) => x.hoSo.id === toi.id)}
          chamCuaToi={chamCuaToi}
          danhSachCa={CA_GIA}
          boPhanTheoNguoi={BO_PHAN}
          boPhanCuaToi={BO_PHAN[toi.id]}
          logsHomNay={LOGS}
          tomTat={tomTatThang(LOGS, toi.id, CA_GIA, BO_PHAN[toi.id])}
          gioHienTai={gio}
          onCheckin={() => alert('Bản xem thử: nút này không ghi dữ liệu.')}
          onCheckout={() => alert('Bản xem thử: nút này không ghi dữ liệu.')}
          onXinNghi={() => alert('Bản xem thử: nút này không ghi dữ liệu.')}
          deXuatGia={DE_XUAT_GIA}
          onTaiLai={async () => {}}
        />
      </div>
    </div>
  );
}
