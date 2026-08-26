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
  { id: 'u1', full_name: 'Hoàng Diễm', station: 'lanh', role: 'bakery' },
  { id: 'u2', full_name: 'Kim Tiến', station: 'lanh', role: 'bakery' },
  { id: 'u3', full_name: 'Nguyễn An', station: 'lanh', role: 'bakery' },
  { id: 'u4', full_name: 'Trần Mai', station: 'lanh', role: 'bakery' },
  { id: 'u5', full_name: 'Lê Quang', station: 'xuong42', role: 'kho_xuong42' },
];

const BO_PHAN = { u1: 'bakery', u2: 'bakery', u3: 'bakery', u4: 'bakery', u5: 'xuong42' };

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
  // Đến sớm 10 phút so với mốc 05:05
  log('u1', 'Hoàng Diễm', 'checkin', '04:55', { late_minutes: 0, gps_lat: 10.9121, gps_lng: 106.7354, gps_accuracy_m: 6 }),
  // Đúng mốc
  log('u2', 'Kim Tiến', 'checkin', '05:03', { late_minutes: 0, gps_lat: 10.9122, gps_lng: 106.7351, gps_accuracy_m: 9 }),
  // Đi muộn 28 phút — số này do database tính, màn hình chỉ đọc
  log('u3', 'Nguyễn An', 'checkin', '05:33', { late_minutes: 28, reason: 'Kẹt xe cầu Vĩnh Phú', gps_lat: 10.9119, gps_lng: 106.7362, gps_accuracy_m: 14 }),
  // u4 chưa chấm gì cả
  // Xưởng 42 vào đúng giờ rồi ra ca
  log('u5', 'Lê Quang', 'checkin', '05:48', { late_minutes: 0, expected_start: '06:00:00' }),
  log('u5', 'Lê Quang', 'checkout', '15:05', { expected_start: '06:00:00' }),
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
          onTaiLai={async () => {}}
        />
      </div>
    </div>
  );
}
