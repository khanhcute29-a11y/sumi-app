import React from 'react';
import { phutTrongNgay, gioPhut, caChuanCuaLog } from '../../../lib/chamCong';

// Những mảnh dùng chung của giao diện Chấm Công V2.
//
// NGUYÊN TẮC XUYÊN SUỐT: mọi con số giờ giấc ở đây đều ĐỌC từ dữ liệu database
// trả về, không có chỗ nào tự tính rồi gửi ngược lên. Số phút đi muộn do trigger
// `sumi_tu_tinh_di_muon` dưới database quyết. Trước 26/08 màn hình cũ tự tính và
// ghi cứng 0, khiến cả tiệm suốt thời gian dài không ai bị ghi nhận đi muộn.

/** Chữ cái đầu của tên, dùng khi không có ảnh đại diện. */
export function chuCaiDau(ten) {
  const t = String(ten || '?').trim().split(/\s+/);
  if (t.length === 1) return t[0].slice(0, 2).toUpperCase();
  return (t[t.length - 2][0] + t[t.length - 1][0]).toUpperCase();
}

/** "5p" · "1h20" — viết tắt, dùng ở nơi chật (chip nhỏ, mini-stat). */
export function doDaiPhut(phut) {
  const p = Math.abs(Math.round(phut || 0));
  if (p < 60) return `${p}p`;
  const g = Math.floor(p / 60);
  const du = p % 60;
  return du ? `${g}h${String(du).padStart(2, '0')}` : `${g}h`;
}

/** "5 phút" · "1 giờ 20 phút" — ghi đầy đủ, dùng cho dòng lịch sử để đọc
 *  cực rõ ràng, đúng yêu cầu không viết tắt trong nhãn muộn/sớm. */
export function doDaiPhutDay(phut) {
  const p = Math.abs(Math.round(phut || 0));
  if (p < 60) return `${p} phút`;
  const g = Math.floor(p / 60);
  const du = p % 60;
  return du ? `${g} giờ ${du} phút` : `${g} giờ`;
}

/** Giờ làm thực -> "7h 45" */
export function gioThanhChu(soGio) {
  if (soGio == null) return '0h 00';
  const tong = Math.max(0, Math.round(soGio * 60));
  return `${Math.floor(tong / 60)}h ${String(tong % 60).padStart(2, '0')}`;
}

/**
 * Nhãn chênh lệch cho MỘT dòng nhật ký.
 *
 * Với lần VÀO ca: ưu tiên tuyệt đối `late_minutes` mà database đã ghi — đó là
 * con số dùng để tính lương. Chỉ khi database chưa có (nhật ký cũ trước khi có
 * trigger) mới suy ra từ mốc để hiển thị cho đỡ trống.
 */
export function nhanChenhLech(log, ca) {
  if (!log || !ca) return null;
  const gio = gioPhut(log.checkin_time || log.created_at);
  if (!gio) return null;

  if (log.type === 'checkin') {
    const muonDB = typeof log.late_minutes === 'number' ? log.late_minutes : null;
    let lech = muonDB;
    if (lech == null || lech === 0) {
      let tinh = phutTrongNgay(gio) - phutTrongNgay(ca.moc);
      if (tinh > 720) tinh -= 1440;
      if (tinh < -720) tinh += 1440;
      lech = muonDB === 0 && tinh > 0 ? 0 : tinh;
    }
    // Từ ngữ khớp đúng yêu cầu: "Muộn X phút" (đỏ) · "Đúng giờ" (xanh) ·
    // "Sớm X phút" (xanh). Giờ cụ thể đã hiện ngay cạnh nhãn này rồi (thẻ
    // <time>), nên không lặp lại số giờ trong chữ.
    if (lech > 0) return { chu: `Muộn ${doDaiPhutDay(lech)}`, loai: 'bad' };
    if (lech < 0) return { chu: `Sớm ${doDaiPhutDay(lech)}`, loai: 'good' };
    return { chu: 'Đúng giờ', loai: 'good' };
  }

  if (log.type === 'checkout') {
    const batDau = phutTrongNgay(ca.batDau);
    let chuan = phutTrongNgay(ca.ketThuc);
    if (chuan <= batDau) chuan += 1440;
    let that = phutTrongNgay(gio);
    if (that < batDau) that += 1440;
    const lech = that - chuan;
    if (lech > 0) return { chu: `Tăng ca +${doDaiPhutDay(lech)}`, loai: 'warn' };
    if (lech < 0) return { chu: `Về sớm ${doDaiPhutDay(lech)}`, loai: 'bad' };
    return { chu: 'Đúng giờ tan ca', loai: 'good' };
  }

  return null;
}

/** Nhãn nhỏ màu xanh/đỏ đứng cạnh giờ. */
export function TheChenhLech({ nhan }) {
  if (!nhan) return null;
  const lop = nhan.loai === 'bad' ? 'cc2-kpi-bad'
    : nhan.loai === 'warn' ? 'cc2-kpi-warn' : 'cc2-kpi-good';
  return <span className={`cc2-kpi-tag ${lop}`}>{nhan.chu}</span>;
}

/**
 * Một dòng lịch sử chấm công.
 *
 * Toạ độ GPS chỉ hiện khi database THẬT SỰ có. Trước bản vá 26/08 không dòng nào
 * có toạ độ (màn hình gửi lên nhưng hàm ghi không đọc trường đó), nên phần lớn
 * nhật ký cũ sẽ không có dòng vị trí — đúng với sự thật, không bịa ra.
 */
export function DongLichSu({ log, ca, tenNguoi }) {
  const raCa = log.type === 'checkout';
  const xinNghi = log.type === 'leave_request';
  const gio = log.checkin_time || log.created_at;
  const nhan = nhanChenhLech(log, ca);
  const boSung = String(log.reason || '').startsWith('[BỔ SUNG]');

  const coGps = log.gps_lat != null && log.gps_lng != null;

  return (
    <article className="cc2-record">
      <div className={`cc2-record-kind${raCa ? ' out' : ''}`}>
        {xinNghi ? '🏖' : raCa ? '■' : '▶'}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="cc2-record-title">
          <b>{xinNghi ? 'Xin nghỉ' : raCa ? 'Ra ca' : 'Vào ca'}</b>
          <time>{gio ? new Date(gio).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}</time>
          <TheChenhLech nhan={nhan} />
          {boSung && <span className="cc2-kpi-tag cc2-kpi-warn">Bổ sung tay</span>}
        </div>
        <span className="cc2-record-detail">
          {tenNguoi ? <>👤 {tenNguoi}{log.branch ? ` · ${log.branch}` : ''}<br /></> : null}
          {coGps ? (
            <>📍 {Number(log.gps_lat).toFixed(5)}, {Number(log.gps_lng).toFixed(5)}
              {log.gps_accuracy_m ? ` · sai số ${Math.round(log.gps_accuracy_m)}m` : ''}<br /></>
          ) : (
            <>📍 Không có vị trí<br /></>
          )}
          {log.reason ? <>📝 {log.reason}</> : null}
        </span>
      </div>
      {log.photo_url
        ? <img className="cc2-proof-thumb" src={log.photo_url} alt="Ảnh chấm công" loading="lazy" />
        : <div className="cc2-proof-thumb" aria-hidden="true">📷</div>}
    </article>
  );
}

/** "THỨ 3, 26/08/2026" — tiêu đề nhóm ngày, đúng cách ảnh mẫu chia. */
function tieuDeNgay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Không rõ ngày';
  const thu = ['CHỦ NHẬT', 'THỨ 2', 'THỨ 3', 'THỨ 4', 'THỨ 5', 'THỨ 6', 'THỨ 7'][d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${thu}, ${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Danh sách lịch sử, GOM THEO NGÀY.
 *
 * Trước đây đổ thẳng một mạch, xem lịch sử vài ngày là không biết dòng nào của
 * hôm nào. Nay mỗi ngày một tiêu đề, mới nhất lên trên — giống cách ảnh mẫu
 * anh Nghĩa gửi chia màn hình "Hoạt động".
 */
export function LichSuCham({
  logs, danhSachCa, boPhanTheoNguoi = {}, tenTheoId = {}, hienTen = false,
  gomTheoNgay = true, rong = 'Chưa có lần chấm công nào.',
}) {
  const ds = [...(logs || [])].sort(
    (a, b) => new Date(b.checkin_time || b.created_at || 0) - new Date(a.checkin_time || a.created_at || 0),
  );
  if (!ds.length) return <div className="cc2-empty">{rong}</div>;

  const dong = (l) => (
    <DongLichSu
      key={l.id}
      log={l}
      ca={caChuanCuaLog(l, danhSachCa, boPhanTheoNguoi[l.staff_id] || null)}
      tenNguoi={hienTen ? (tenTheoId[l.staff_id] || l.staff_name) : null}
    />
  );

  if (!gomTheoNgay) return <div className="cc2-history">{ds.map(dong)}</div>;

  // Gom theo `work_date` nếu có — đó là ngày công thật, không phải ngày của
  // đồng hồ. Ca đêm chấm ra lúc 00:30 vẫn thuộc ngày công hôm trước.
  const nhom = [];
  ds.forEach((l) => {
    const khoa = l.work_date || String(l.checkin_time || l.created_at || '').slice(0, 10);
    let g = nhom.find((x) => x.khoa === khoa);
    if (!g) { g = { khoa, ds: [] }; nhom.push(g); }
    g.ds.push(l);
  });

  return (
    <div className="cc2-lichsu-nhom">
      {nhom.map((g) => (
        <section key={g.khoa}>
          <div className="cc2-ngay-nhan">{tieuDeNgay(g.khoa)}</div>
          <div className="cc2-history">{g.ds.map(dong)}</div>
        </section>
      ))}
    </div>
  );
}
