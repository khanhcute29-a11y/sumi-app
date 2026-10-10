// Kiểm tra "Bổ sung ca đã làm (quên chấm)" trước khi ghi (yêu cầu Giám đốc 10/10/2026).
//
// LỖI THẬT đã gặp: nhân viên quên chấm ra hôm thứ Năm (vào 06:04, về 23:00).
// Hôm sau mở "Bổ sung ca" để thêm giờ ra, nhưng form để NGÀY MẶC ĐỊNH LÀ HÔM NAY
// và luôn tạo 1 CẶP VÀO/RA MỚI — nên ca 06:04→23:00 bị ghi sang thứ Sáu, chồng
// lên lần vào ca thật 04:35 của thứ Sáu. Kết quả: thứ Năm "chưa chấm ra", thứ Sáu
// 04:35 cũng thành "chưa chấm ra", công 17 tiếng đổ sai ngày.
//
// Hàm thuần, không gọi mạng. Ghép cặp vào/ra ĐÚNG cách database đang làm
// (get_staff_attendance_detail / get_staff_kpi_v2): xếp theo checkin_time,
// không chia theo work_date — để điều form chặn khớp với điều màn KPI hiển thị.

const NAM_PHUT = 5 * 60 * 1000;
const TEN_THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function ms(t) {
  const x = new Date(t).getTime();
  return Number.isNaN(x) ? null : x;
}

export function hienGioNgay(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const th = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} ${TEN_THU[d.getDay()]} ${dd}/${th}`;
}

function suKienDaXep(logs) {
  return (logs || [])
    .filter((l) => (l.type === 'checkin' || l.type === 'checkout') && ms(l.checkin_time) != null)
    .sort((a, b) => ms(a.checkin_time) - ms(b.checkin_time));
}

/**
 * Các lần VÀO CA bị quên chấm ra: sau nó là một lần vào ca khác (chứ không phải
 * giờ ra), hoặc là lần cuối cùng nhưng thuộc ngày trước hôm nay.
 * Lần vào ca hôm nay đang làm dở KHÔNG tính (đó là ca đang chạy, không phải quên).
 * @returns {Array<{log, gioRaMuonNhat: number|null}>} gioRaMuonNhat = mốc lần chấm kế
 *   tiếp — giờ ra bổ sung phải trước mốc này.
 */
export function timLanVaoQuenChamRa(logs, homNay) {
  const ds = suKienDaXep(logs);
  const ket = [];
  ds.forEach((l, i) => {
    if (l.type !== 'checkin') return;
    const sau = ds[i + 1];
    if (sau && sau.type === 'checkout') return;
    if (!sau && l.work_date >= homNay) return;
    ket.push({ log: l, gioRaMuonNhat: sau ? ms(sau.checkin_time) : null });
  });
  return ket.reverse(); // mới nhất trước
}

/** Kiểm tra giờ ra muốn thêm cho một lần vào ca bị quên chấm ra. Trả câu lỗi hoặc null. */
export function kiemTraGioRa({ lanVao, gioRa, now = new Date() }) {
  const vao = ms(lanVao?.log?.checkin_time);
  const ra = ms(gioRa);
  if (vao == null || ra == null) return 'Vui lòng chọn ngày và giờ ra.';
  if (ra <= vao) return `Giờ ra phải sau giờ vào (${hienGioNgay(vao)}).`;
  if (ra > ms(now) + NAM_PHUT) return 'Giờ ra này chưa tới. Chỉ bổ sung giờ ra của ca đã làm xong.';
  if (lanVao.gioRaMuonNhat != null && ra >= lanVao.gioRaMuonNhat) {
    return `Giờ ra phải trước lần chấm công kế tiếp (${hienGioNgay(lanVao.gioRaMuonNhat)}).`;
  }
  return null;
}

/**
 * Kiểm tra một CA MỚI bổ sung (vào + ra) không chồng lên ca đã có — kể cả ca
 * đang làm dở hoặc lần vào bị quên chấm ra. Trả câu lỗi hoặc null.
 */
export function kiemTraCaMoi({ logs, gioVao, gioRa, now = new Date() }) {
  const vao = ms(gioVao);
  const ra = ms(gioRa);
  const bayGio = ms(now);
  if (vao == null || ra == null) return 'Vui lòng chọn ngày và giờ.';
  if (ra <= vao) return 'Giờ kết thúc phải sau giờ bắt đầu.';
  if (ra > bayGio + NAM_PHUT) return 'Giờ kết thúc chưa tới. Chỉ bổ sung ca đã làm xong — ca đang làm thì bấm "Kết thúc ca".';

  const ds = suKienDaXep(logs);
  for (let i = 0; i < ds.length; i += 1) {
    const l = ds[i];
    if (l.type !== 'checkin') continue;
    const batDau = ms(l.checkin_time);
    const sau = ds[i + 1];
    const ketThuc = sau ? ms(sau.checkin_time) : bayGio;
    if (vao < ketThuc && ra > batDau) {
      if (!sau) {
        return `Trùng với ca bắt đầu lúc ${hienGioNgay(batDau)} chưa kết thúc. Đang làm thì bấm "Kết thúc ca"; đã về mà quên chấm thì chọn "Thêm giờ ra cho ca quên chấm".`;
      }
      return sau.type !== 'checkout'
        ? `Trùng với lần vào ca lúc ${hienGioNgay(batDau)} chưa chấm ra. Nếu bạn quên chấm ra, hãy chọn "Thêm giờ ra cho ca quên chấm" ở trên.`
        : `Trùng với ca đã chấm ${hienGioNgay(batDau)} → ${hienGioNgay(ketThuc)}.`;
    }
  }
  return null;
}

/** Tên ca mặc định: ca của lần vào gần nhất, thay vì luôn là ca đầu danh sách. */
export function caGanNhat(logs) {
  const vao = suKienDaXep(logs).filter((l) => l.type === 'checkin' && l.shift_label);
  return vao.length ? vao[vao.length - 1].shift_label : null;
}
