// Parser giọng nói CHO "+ Giao việc mới" — KHÔNG dùng AI (Gemini) nữa, chạy
// hoàn toàn local nên không bao giờ dính quota/mạng chậm. Thay thế
// supabase.functions.invoke('parse-voice-task', ...).
//
// Khác AI ở chỗ KHÔNG tách "Tên việc" / "Mô tả" thông minh — gộp hết phần
// còn lại (sau khi đã cắt tên người/giờ/mã đơn) vào TÊN VIỆC, để Mô tả
// trống cho người dùng tự bổ sung nếu cần. Quyết định có chủ đích: thà để
// trống còn hơn tách sai (theo yêu cầu chủ tiệm 05/09/2026).

import { extractDeadline, detectReminderPhrase, resolveReminder } from './parseVoiceDateTime.js';
import { wordRegex } from './voiceRegexUtil.js';

const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ORDER_CODE_RE = /SUMI[-\s]?(\d{8})[-\s]?(\d{3})/i;

function cutRange(text, start, end) {
  if (start < 0 || end < 0) return text;
  return (text.slice(0, start) + ' ' + text.slice(end)).replace(/\s{2,}/g, ' ');
}

// Tìm nhân viên được nhắc tới trong câu, khớp với danh sách tên THẬT — ưu
// tiên tên dài trước để "Hồ Hoàng Diễm" không bị nuốt bởi tên ngắn "Diễm"
// của người khác trùng 1 phần.
function extractAssignees(text, staffNames) {
  const working = { text, matched: [] };
  const sorted = [...(staffNames || [])].filter(Boolean).sort((a, b) => b.length - a.length);
  const normWorking = () => boDau(working.text);

  for (const name of sorted) {
    const normName = boDau(name).trim();
    if (!normName) continue;
    const idx = normWorking().indexOf(normName);
    if (idx === -1) continue;
    // Cắt đúng đoạn ký tự tương ứng khỏi câu GỐC (không phải bản đã bỏ dấu) —
    // vì độ dài chuỗi bỏ dấu luôn bằng chuỗi gốc (chỉ đổi ký tự, không đổi độ
    // dài) nên cắt theo index/length từ bản chuẩn hoá là an toàn.
    working.text = cutRange(working.text, idx, idx + normName.length);
    working.matched.push(name);
  }
  return working;
}

// Regex có cờ 'g' KHÔNG trả về .index khi dùng String.match() (trả mảng các
// chuỗi khớp, không phải match object) — dùng regex KHÔNG cờ 'g', neo bằng ^,
// riêng cho việc cắt phần mở đầu câu.
const LEADING_GIAO_RE = /^(?:giao cho|giao)(?![\p{L}\p{N}])\s*/iu;
const FILLER_WORDS_RE = wordRegex(['nhớ', 'giúp', 'nhé', 'là', 'cho', 'và']);
const DAY_WORDS_RE = wordRegex(['ngày mai', 'ngày kia', 'hôm nay', 'mai', 'nay']);
const HAN_CHOT_RE = wordRegex(['hạn chót là', 'hạn chót']);

function cleanTitle(text) {
  let t = text.replace(LEADING_GIAO_RE, '');
  t = t.replace(FILLER_WORDS_RE, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (!t) return text.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function parseVoiceTaskAssign(rawText, { now, staffNames = [] } = {}) {
  const empty = { title: '', description: null, deadline: null, reminderAt: null, orderCode: null, assigneeNames: [] };
  const text = String(rawText || '').trim().replace(/\s+/g, ' ');
  if (!text) return empty;

  const nowIso = now || new Date().toISOString();
  let working = text;

  // 1) Mã đơn — dễ và chắc chắn nhất, cắt trước để không lẫn số vào chỗ khác.
  let orderCode = null;
  const codeMatch = working.match(ORDER_CODE_RE);
  if (codeMatch) {
    orderCode = `SUMI-${codeMatch[1]}-${codeMatch[2]}`;
    working = cutRange(working, codeMatch.index, codeMatch.index + codeMatch[0].length);
  }

  // 2) Tên người được giao — khớp với danh sách nhân viên CÓ THẬT.
  const { text: afterNames, matched: assigneeNames } = extractAssignees(working, staffNames);
  working = afterNames;

  // 3) Nhắc chuông — DÒ TRƯỚC trên câu gốc và CẮT KHỎI `working` trước khi dò
  // Hạn chót. Bắt buộc phải làm trước: nếu là kiểu tuyệt đối ("nhắc lúc 4 giờ
  // chiều"), cụm giờ đó sẽ bị hiểu NHẦM thành luôn cả Hạn chót nếu không cắt
  // trước — 2 việc khác nhau (nhắc & hạn chót) vô tình chung 1 giờ trong câu.
  const reminderPhrase = detectReminderPhrase(text);
  if (reminderPhrase) {
    const matchedPhrase = text.slice(reminderPhrase.matchStart, reminderPhrase.matchEnd);
    if (matchedPhrase) working = working.split(matchedPhrase).join(' ');
  }

  // 4) Hạn chót — cắt cụm giờ ra khỏi câu sau khi lấy được giá trị.
  const deadline = extractDeadline(working, nowIso);
  if (deadline.iso) working = cutRange(working, deadline.matchStart, deadline.matchEnd);
  // Cắt luôn các từ ngày/buổi rời rạc còn sót lại sau khi đã cắt cụm giờ số.
  working = working.replace(DAY_WORDS_RE, ' ').replace(/\s{2,}/g, ' ');
  working = working.replace(HAN_CHOT_RE, ' ').replace(/\s{2,}/g, ' ').trim();

  // 5) Giờ mới tính được giá trị Nhắc chuông thật (kiểu tương đối cần Hạn chót vừa có ở bước 4).
  const reminder = resolveReminder(reminderPhrase, text, nowIso, deadline.iso);

  const title = cleanTitle(working);

  return {
    title,
    description: null,
    deadline: deadline.iso,
    reminderAt: reminder.iso,
    orderCode,
    assigneeNames,
  };
}
