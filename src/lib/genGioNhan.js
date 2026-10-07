// Đọc "giờ nhận bánh" mà Trợ lý Gen bóc từ tin nhắn khách (yêu cầu Giám đốc 07/10/2026).
//
// LỖI THẬT đã vá: trước đây chỉ hiểu 4 cụm "mai / hôm nay / chiều nay / tối nay",
// mọi cách viết khác ("15h", "sáng nay", "9h sáng 22/09", "thứ 7"...) đều bị đặt
// thành NGÀY MAI — nhân viên báo "đơn AI toàn lên sau 1 ngày". "7/10 lúc 15h" còn
// bị lấy nhầm số 7 của ngày làm giờ (7h sáng). Giờ tách phần NGÀY ra trước rồi mới
// tìm GIỜ trong phần còn lại.
//
// Hàm thuần, không gọi mạng. Tính theo giờ máy (điện thoại ở VN) — giống
// localDateStr() trong date.js và màn Tạo đơn.

// `\b` của JS không coi chữ có dấu (ư, ố...) là chữ cái, nên "thứ tư" sẽ không
// khớp — tự đặt ranh giới từ bằng \p{L} (cờ u). KHÔNG dùng lookbehind (?<!...):
// iPhone iOS dưới 16.4 không hiểu, cả màn Gen sẽ trắng.
const HET = '(?![\\p{L}\\d])';
const DAU = '(?:^|[^\\p{L}\\d])';
const tu = (mau) => new RegExp(DAU + '(?:' + mau + ')' + HET, 'u');

const THU = [
  [tu('chủ\\s*nhật|cn'), 0],
  [tu('thứ\\s*(?:hai|2)'), 1],
  [tu('thứ\\s*(?:ba|3)'), 2],
  [tu('thứ\\s*(?:tư|bốn|4)'), 3],
  [tu('thứ\\s*(?:năm|5)'), 4],
  [tu('thứ\\s*(?:sáu|6)'), 5],
  [tu('thứ\\s*(?:bảy|bẩy|7)'), 6],
];

const TEN_THU = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function ngayHopLe(y, m, d) {
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? x : null;
}

function congNgay(goc, so) {
  return new Date(goc.getFullYear(), goc.getMonth(), goc.getDate() + so);
}

// Ngày/tháng không ghi năm: lấy năm nay; nếu đã qua quá xa (vd cuối tháng 12
// nhận đơn "2/1") thì hiểu là năm sau.
function ngayKhongNam(d, m, homNay) {
  let x = ngayHopLe(homNay.getFullYear(), m, d);
  if (x && x < congNgay(homNay, -180)) x = ngayHopLe(homNay.getFullYear() + 1, m, d);
  return x;
}

/**
 * @returns {{ thoiDiem: Date, roNgay: boolean, roGio: boolean }}
 *   roNgay/roGio = false nghĩa là phải ĐOÁN (giao diện nhắc kiểm tra lại).
 */
export function docGioNhan(raw, now = new Date()) {
  let s = String(raw || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const homNay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let ngay = null;
  let gio = null;
  let phut = 0;

  // ---- 1. NGÀY ----
  // 1a. Dạng chuẩn 2026-10-07 hoặc 2026-10-07T15:30
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ](\d{1,2}):(\d{2}))?/);
  if (m) {
    ngay = ngayHopLe(+m[1], +m[2], +m[3]);
    if (m[4] != null) { gio = +m[4]; phut = +m[5]; }
    s = s.replace(m[0], ' ');
  }
  // 1b. 22/09, 22-9, 22.09.2026
  if (!ngay) {
    m = s.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/);
    if (m) {
      const nam = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
      ngay = nam ? ngayHopLe(nam, +m[2], +m[1]) : ngayKhongNam(+m[1], +m[2], homNay);
      // Không phải ngày hợp lệ (vd "15.30" là giờ) thì để nguyên cho bước tìm giờ.
      if (ngay) s = s.replace(m[0], ' ');
    }
  }
  // 1c. "ngày 22 tháng 9" / "ngày 22"
  if (!ngay) {
    m = s.match(/ngày\s*(\d{1,2})(?:\s*tháng\s*(\d{1,2}))?/);
    if (m) {
      if (m[2]) {
        ngay = ngayKhongNam(+m[1], +m[2], homNay);
      } else {
        ngay = ngayHopLe(homNay.getFullYear(), homNay.getMonth() + 1, +m[1]);
        if (ngay && ngay < homNay) ngay = ngayHopLe(homNay.getFullYear(), homNay.getMonth() + 2, +m[1])
          || ngayHopLe(homNay.getFullYear() + 1, 1, +m[1]);
      }
      s = s.replace(m[0], ' ');
    }
  }
  // 1d. Thứ trong tuần — gần nhất kể từ hôm nay (đúng hôm nay thì là hôm nay),
  //     "tuần sau" thì cộng thêm 7 ngày.
  if (!ngay) {
    for (const [re, thu] of THU) {
      m = s.match(re);
      if (m) {
        let cach = (thu - homNay.getDay() + 7) % 7;
        if (/tuần sau|tuần tới/.test(s)) cach += 7;
        ngay = congNgay(homNay, cach);
        s = s.replace(m[0], ' ');
        break;
      }
    }
  }
  // 1e. Ngày tương đối
  if (!ngay) {
    if (tu('ngày kia|mốt').test(s)) ngay = congNgay(homNay, 2);
    else if (tu('mai').test(s)) ngay = congNgay(homNay, 1);
    else if (tu('nay').test(s)) ngay = homNay;
  }
  const roNgay = !!ngay;

  // ---- 2. GIỜ (chỉ tìm trong phần còn lại, đã bỏ phần ngày) ----
  if (gio == null) {
    m = s.match(/(\d{1,2})\s*(?::|h|giờ|g|\.(?=\d{2}))\s*(\d{1,2})?/)
      || s.match(/(?:^|\D)(\d{1,2})(?!\d)/);
    if (m) {
      gio = +m[1];
      if (m[2] != null) phut = +m[2];
      else if (/rưỡi/.test(s)) phut = 30;
    }
  }
  if (gio != null) {
    if (/chiều|tối|đêm/.test(s) && gio >= 1 && gio < 12) gio += 12;
    else if (/trưa/.test(s) && gio >= 1 && gio <= 3) gio += 12;
    if (gio > 23 || phut > 59) { gio = null; phut = 0; }
  }
  const roGio = gio != null;
  if (!roGio) {
    // Không nói giờ: lấy giờ đầu buổi nếu có nhắc buổi, còn lại 8h sáng như trước.
    gio = /tối/.test(s) ? 18 : /chiều/.test(s) ? 15 : /trưa/.test(s) ? 11 : 8;
    phut = 0;
  }

  // ---- 3. Chỉ có giờ, không rõ ngày: giờ đó hôm nay còn kịp thì là hôm nay,
  //         đã qua thì sang mai (trước đây luôn luôn là mai).
  if (!ngay) {
    const homNayLuc = new Date(homNay.getFullYear(), homNay.getMonth(), homNay.getDate(), gio, phut);
    ngay = roGio && homNayLuc > now ? homNay : congNgay(homNay, 1);
  }

  const thoiDiem = new Date(ngay.getFullYear(), ngay.getMonth(), ngay.getDate(), gio, phut, 0);
  return { thoiDiem, roNgay, roGio };
}

// "15:00 · Thứ Ba 07/10/2026" — để nhân viên nhìn là biết đúng ngày trước khi bấm tạo.
export function hienGioNhan(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const th = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} · ${TEN_THU[d.getDay()]} ${dd}/${th}/${d.getFullYear()}`;
}
