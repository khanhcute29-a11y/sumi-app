// Bóc tách cụm GIỜ + NGÀY tiếng Việt nói tự nhiên, dùng cho Hạn chót/Nhắc
// chuông khi Giao việc — thay cho việc phải gọi AI (Gemini) chỉ để suy ra
// "8 giờ sáng mai" là ngày giờ tuyệt đối nào.
//
// Chỉ nhận diện các cách nói phổ biến thực tế ở tiệm bánh. Không nhận diện
// được thì trả về null — THÀ ĐỂ TRỐNG để người dùng tự điền tay, còn hơn
// đoán sai giờ (bài học từ lúc dùng AI: "10 ổ bánh" từng bị hiểu nhầm
// thành "10 giờ").

const ONES = {
  'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
  'năm': 5, 'lăm': 5, 'nhăm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9,
};

// Đọc số giờ 0-23 viết bằng chữ, bắt đầu từ tokens[start]. Trả {value, consumed} hoặc null.
function readHourWords(tokens, start) {
  const w0 = tokens[start];
  if (w0 === 'mười') {
    const w1 = tokens[start + 1];
    if (w1 in ONES && w1 !== 'không') return { value: 10 + ONES[w1], consumed: 2 };
    return { value: 10, consumed: 1 };
  }
  if (w0 === 'hai' && tokens[start + 1] === 'mươi') {
    const w2 = tokens[start + 2];
    if (w2 in ONES && w2 !== 'không') return { value: 20 + ONES[w2], consumed: 3 };
    return { value: 20, consumed: 2 };
  }
  if (w0 in ONES) return { value: ONES[w0], consumed: 1 };
  return null;
}

const PERIOD_WORDS = ['sáng', 'trưa', 'chiều', 'tối', 'đêm'];

function applyPeriod(hour, period) {
  if (!period) return hour; // không nói buổi -> giữ nguyên (đã có thể là giờ 24h như "17 giờ")
  if (period === 'sáng') return hour === 12 ? 0 : hour;
  if (period === 'trưa') return hour === 12 ? 12 : (hour < 12 ? hour + 12 : hour);
  if (period === 'chiều') return hour === 12 ? 12 : (hour < 12 ? hour + 12 : hour);
  if (period === 'tối' || period === 'đêm') return hour === 12 ? 0 : (hour < 12 ? hour + 12 : hour);
  return hour;
}

// Tìm cụm giờ đầu tiên trong text, trả {hour, minute, matchStart, matchEnd, matchedText} hoặc null.
// Hỗ trợ: "8 giờ sáng", "tám giờ sáng", "17 giờ", "5h30 chiều", "8:30", "8 giờ rưỡi sáng".
function findTimeOfDay(text) {
  // Dạng số: "17h30", "8:30", "5h", "17 giờ 30", "8 giờ30".
  // LỖI THẬT đã vá: viết "[h:]" đơn giản khớp NHẦM chữ 'h' đầu của từ tiếng
  // Việt đứng sau (vd "18 hạn chót" bị đọc thành "18h" + nuốt mất chữ 'h'
  // của "hạn", để lại "ạn chót" — vì "18" rồi khoảng trắng rồi 'h' khớp y
  // hệt mẫu "Xh"). Bắt buộc 'h' phải KHÔNG có chữ cái theo ngay sau mới coi
  // là ký hiệu giờ; nếu không, chỉ chấp nhận dạng đủ chữ "giờ" hoặc dấu ":".
  const digitRe = /(?<![\p{L}\p{N}])(\d{1,2})(?:\s*:\s*(\d{1,2})|\s*h(?![\p{L}])\s*(\d{1,2})?|\s*giờ\s*(\d{1,2})?)\s*(sáng|trưa|chiều|tối|đêm)?/iu;
  const digitMatch = text.match(digitRe);
  if (digitMatch) {
    let hour = Number(digitMatch[1]);
    const minute = Number(digitMatch[2] ?? digitMatch[3] ?? digitMatch[4] ?? 0);
    const period = digitMatch[5] ? digitMatch[5].toLowerCase() : null;
    hour = applyPeriod(hour, period);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute, matchStart: digitMatch.index, matchEnd: digitMatch.index + digitMatch[0].length };
    }
  }

  // Dạng chữ: "<số chữ> giờ [rưỡi] [buổi]"
  const tokens = text.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const read = readHourWords(tokens, i);
    if (!read) continue;
    let j = i + read.consumed;
    if (tokens[j] !== 'giờ') continue; // bắt buộc có chữ "giờ" theo sau để tránh nhầm số khác (số lượng, mã đơn...)
    j += 1;
    let minute = 0;
    if (tokens[j] === 'rưỡi') { minute = 30; j += 1; }
    let period = null;
    if (PERIOD_WORDS.includes(tokens[j])) { period = tokens[j]; j += 1; }
    const hour = applyPeriod(read.value, period);
    if (hour < 0 || hour > 23) continue;
    // Tính vị trí ký tự tương ứng để cắt cụm này ra khỏi câu (dùng lại cho tên việc).
    const before = tokens.slice(0, i).join(' ');
    const matchedTokens = tokens.slice(i, j).join(' ');
    const matchStart = before ? text.indexOf(matchedTokens, before.length) : text.indexOf(matchedTokens);
    return {
      hour, minute,
      matchStart: matchStart >= 0 ? matchStart : 0,
      matchEnd: matchStart >= 0 ? matchStart + matchedTokens.length : 0,
    };
  }
  return null;
}

// Tìm cụm NGÀY (hôm nay/mai/ngày kia) gần vị trí anchorIndex (vị trí cụm giờ) —
// quét cả câu vì người nói có thể nói "mai" trước hoặc sau cụm giờ.
// Cẩn thận KHÔNG nhầm tên người "chị Mai" thành "ngày mai" (bài học thực tế).
function findDayOffset(text) {
  const t = ` ${text.toLowerCase()} `;
  if (/\bngày kia\b/.test(t)) return 2;
  if (/\bngày mai\b/.test(t)) return 1;
  const honorificBeforeMai = /(anh|chị|em|cô|chú|bác|ông|bà)\s+mai\b/;
  if (/\bmai\b/.test(t) && !honorificBeforeMai.test(t)) return 1;
  if (/\bhôm nay\b|\bnay\b/.test(t)) return 0;
  return 0; // mặc định hôm nay nếu không nói rõ ngày
}

// nowIso: ISO string giờ hiện tại (giờ Việt Nam, có timezone).
// Trả về ISO string tuyệt đối, LUÔN Ở TƯƠNG LAI so với nowIso (nếu giờ suy
// ra rơi vào quá khứ của HÔM NAY mà không có từ ngày rõ ràng, tự đẩy sang
// ngày mai) — cùng nguyên tắc đã áp dụng khi còn dùng AI.
export function extractDeadline(text, nowIso) {
  const time = findTimeOfDay(text);
  if (!time) return { iso: null, matchStart: -1, matchEnd: -1 };

  const now = new Date(nowIso);
  let dayOffset = findDayOffset(text);

  const target = new Date(now);
  target.setDate(target.getDate() + dayOffset);
  target.setHours(time.hour, time.minute, 0, 0);

  // Không có từ ngày rõ ràng (mặc định hôm nay) mà giờ đã qua -> hiểu là ngày mai.
  if (dayOffset === 0 && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  // Nuốt luôn từ dẫn ("trước"/"lúc"/"vào lúc") ngay trước cụm giờ vào vùng cắt,
  // để không sót từ vô nghĩa (vd "Xử lý đơn TRƯỚC") lại trong Tên việc.
  let matchStart = time.matchStart;
  const before = text.slice(0, matchStart);
  const leadTrigger = before.match(/(trước|vào lúc|lúc)\s*$/iu);
  if (leadTrigger) matchStart -= leadTrigger[0].length;

  return { iso: target.toISOString(), matchStart, matchEnd: time.matchEnd };
}

// Dò xem câu có nhắc tới việc NHẮC CHUÔNG không, và nó là kiểu TƯƠNG ĐỐI
// ("nhắc trước N phút/tiếng" — cần biết Hạn chót mới tính ra giờ tuyệt đối)
// hay TUYỆT ĐỐI ("nhắc lúc/vào lúc <giờ>" — có giờ riêng, không phụ thuộc
// Hạn chót). Tách riêng bước "dò" và "tính giá trị" (resolveReminder) để
// gọi nơi khác có thể CẮT cụm nhắc-chuông này ra khỏi câu TRƯỚC KHI dò Hạn
// chót — tránh trường hợp giờ trong "nhắc lúc 4 giờ chiều" bị hiểu NHẦM
// thành luôn cả Hạn chót (2 việc khác nhau nói cùng 1 giờ trong câu).
export function detectReminderPhrase(text) {
  const t = text.toLowerCase();

  const relRe = /nhắc\s*(?:trước)?\s*(\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(phút|tiếng|giờ)/;
  const relMatch = t.match(relRe);
  if (relMatch) {
    const n = relMatch[1] in ONES ? ONES[relMatch[1]] : (relMatch[1] === 'mười' ? 10 : Number(relMatch[1]));
    const unitMs = relMatch[2] === 'phút' ? 60000 : 3600000;
    if (!Number.isNaN(n)) {
      return { kind: 'relative', n, unitMs, matchStart: relMatch.index, matchEnd: relMatch.index + relMatch[0].length };
    }
  }

  const nhacIdx = t.indexOf('nhắc');
  if (nhacIdx >= 0) {
    const after = text.slice(nhacIdx);
    const time = findTimeOfDay(after);
    if (time) {
      // Cắt từ chính chữ "nhắc" tới hết cụm giờ (không chỉ riêng cụm giờ) để
      // không sót "nhắc lúc"/"nhắc vào lúc" lại trong Tên việc.
      return {
        kind: 'absolute', hour: time.hour, minute: time.minute,
        matchStart: nhacIdx, matchEnd: nhacIdx + time.matchEnd,
      };
    }
  }

  return null;
}

// Tính giờ NHẮC CHUÔNG tuyệt đối từ kết quả detectReminderPhrase(). `text`
// dùng để dò từ ngày (mai/hôm nay) cho trường hợp tuyệt đối.
export function resolveReminder(detected, text, nowIso, deadlineIso) {
  if (!detected) return { iso: null, matchStart: -1, matchEnd: -1 };

  if (detected.kind === 'relative') {
    if (!deadlineIso) return { iso: null, matchStart: detected.matchStart, matchEnd: detected.matchEnd };
    const ms = new Date(deadlineIso).getTime() - detected.n * detected.unitMs;
    return { iso: new Date(ms).toISOString(), matchStart: detected.matchStart, matchEnd: detected.matchEnd };
  }

  const dayOffset = findDayOffset(text);
  const now = new Date(nowIso);
  const target = new Date(now);
  target.setDate(target.getDate() + dayOffset);
  target.setHours(detected.hour, detected.minute, 0, 0);
  if (dayOffset === 0 && target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return { iso: target.toISOString(), matchStart: detected.matchStart, matchEnd: detected.matchEnd };
}
