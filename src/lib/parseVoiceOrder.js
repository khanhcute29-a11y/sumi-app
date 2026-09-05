// Parser giọng nói CHO "Tạo đơn" — KHÔNG dùng AI (Gemini) nữa, chạy hoàn
// toàn local, không phụ thuộc quota/mạng. Thay thế
// supabase.functions.invoke('parse-voice-order', ...).
//
// Trích xuất: customerName, customerPhone, address, items[{name,quantity,unit}].
// Chỉ trích xuất phần CÓ TÍN HIỆU RÕ (số điện thoại đúng định dạng, tên sau
// danh xưng, địa chỉ sau từ khoá dẫn) — không đoán khi không chắc, để trống
// cho người dùng tự điền/sửa trong form (form vẫn luôn bắt buộc xác nhận).

import { wordRegex } from './voiceRegexUtil.js';

const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ONES = {
  'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
  'năm': 5, 'lăm': 5, 'nhăm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9,
};

const UNIT_WORDS = ['cái', 'hộp', 'khay', 'thùng', 'cây', 'lố', 'bịch', 'phần', 'ổ', 'cốt'];

// Đọc số lượng ở ĐẦU đoạn (digit hoặc chữ số 0-99), trả {value, rest}.
function readLeadingQty(text) {
  const digitMatch = text.match(/^(\d+)\s*/);
  if (digitMatch) return { value: Number(digitMatch[1]), rest: text.slice(digitMatch[0].length) };

  const tokens = text.split(' ').filter(Boolean);
  let value = 0, i = 0, matched = false;
  while (i < tokens.length) {
    const w = tokens[i];
    if (w in ONES) {
      const next = tokens[i + 1];
      if (next === 'mươi' || next === 'chục') { value += ONES[w] * 10; i += 2; matched = true; continue; }
      value += ONES[w]; i += 1; matched = true; continue;
    }
    if (w === 'mười') {
      const next = tokens[i + 1];
      if (next in ONES && next !== 'không') { value = 10 + ONES[next]; i += 2; matched = true; continue; }
      value = 10; i += 1; matched = true; continue;
    }
    break;
  }
  if (!matched) return { value: null, rest: text };
  return { value, rest: tokens.slice(i).join(' ') };
}

// Khớp tên sản phẩm trong đoạn với danh mục CÓ THẬT (nếu có truyền vào) —
// khớp 2 chiều (tên khớp chứa trong đoạn, hoặc đoạn chứa trong tên), ưu
// tiên tên dài nhất khớp được để tránh khớp nhầm sản phẩm ngắn hơn.
function matchCatalogName(text, catalogNames) {
  if (!catalogNames?.length) return null;
  const normText = boDau(text);
  let best = null;
  for (const name of catalogNames) {
    const normName = boDau(name);
    if (!normName) continue;
    if (normText.includes(normName) || normName.includes(normText)) {
      if (!best || normName.length > boDau(best).length) best = name;
    }
  }
  return best;
}

const PHONE_RE = /(?<![\p{L}\p{N}])(0\d{9,10})(?![\p{L}\p{N}])/u;

// Alternation dài hơn ("giao tới địa chỉ") phải đứng TRƯỚC alternation ngắn
// ("giao tới") — nếu không, cụm dài dính chồng 2 cue-word liền nhau ("giao
// tới địa chỉ 20 Lê Lợi") sẽ chỉ nuốt "giao tới " rồi để sót nguyên chữ
// "địa chỉ" lẫn vào GIÁ TRỊ địa chỉ (thừa, dù không sai vị trí).
const ADDRESS_CUE_RE = /((?:giao (?:tới|đến|ở|tại)|ship (?:tới|đến))\s+địa chỉ(?:\s+là)?|địa chỉ là|địa chỉ|giao (?:tới|đến|ở|tại)|ship (?:tới|đến)|nhà (?:ở|tại))\s*/iu;
// Điểm DỪNG khi bóc Địa chỉ — vì giọng nói KHÔNG có dấu câu (STT không tự
// chấm phẩy), không thể dừng theo dấu "," như văn bản thường. Dấu hiệu đáng
// tin nhất báo "hết địa chỉ, bắt đầu nói tên khách" là gặp danh xưng
// (anh/chị/...). Không dừng theo SỐ vì địa chỉ luôn bắt đầu bằng số nhà.
// LỖI THẬT: \b thường (không qua wordRegex) lại gãy y hệt kiểu đã vá ở
// parseVoiceTaskAssign.js — "chị"/"cô"/"chú"/"ông" đều có nguyên âm có dấu
// ngay đầu hoặc cuối nên \b không nhận đúng biên từ. Dùng wordRegex (Unicode
// \p{L}) thay vì \b thường. Đặt thêm "đặt/mua/order/lấy" làm điểm dừng vì
// đây là cách nói THỰC TẾ rất phổ biến ("...giao tới địa chỉ 20 Lê Lợi ĐẶT 2
// bánh...") không có danh xưng theo sau địa chỉ.
const ADDRESS_STOP_RE = wordRegex(['cho anh', 'cho chị', 'cho em', 'cho cô', 'cho chú', 'cho bác', 'cho ông', 'cho bà',
  'anh', 'chị', 'em', 'cô', 'chú', 'bác', 'ông', 'bà', 'đặt', 'mua', 'order', 'lấy']);

const HONORIFIC_RE = /(anh|chị|em|cô|chú|bác|ông|bà)\s+([a-zà-ỹđ]+(?:\s+[a-zà-ỹđ]+){0,3})/iu;
// So khớp bằng bản ĐÃ BỎ DẤU (boDau) nên set này cũng phải viết ở dạng đã bỏ
// dấu — trước đây viết nguyên dấu ('số', 'địa'...) nên không bao giờ khớp,
// khiến tên khách nuốt luôn cả "số điện thoại"/"mua"/"đặt" phía sau.
const NAME_STOP_WORDS = new Set(['giao', 'dia', 'chi', 'o', 'tai', 'ship', 'sdt', 'so', 'dien', 'thoai', 'mua', 'dat', 'order']);

function extractCustomerName(text) {
  const m = text.match(HONORIFIC_RE);
  if (!m) return { name: null, matchStart: -1, matchEnd: -1 };
  // Cắt bớt các từ đuôi là cue-word khác lỡ dính vào (vd "chị Lan địa chỉ...").
  const rawWords = m[2].split(/\s+/);
  const nameWords = [];
  for (const w of rawWords) {
    if (NAME_STOP_WORDS.has(boDau(w))) break;
    nameWords.push(w);
  }
  if (!nameWords.length) return { name: null, matchStart: -1, matchEnd: -1 };
  const honorific = m[1];
  const name = `${honorific} ${nameWords.join(' ')}`;
  const matchStart = m.index;
  const matchEnd = m.index + honorific.length + 1 + nameWords.join(' ').length;
  return { name, matchStart, matchEnd };
}

function extractAddress(text) {
  const m = text.match(ADDRESS_CUE_RE);
  if (!m) return { address: null, matchStart: -1, matchEnd: -1 };
  const after = text.slice(m.index + m[0].length);
  // Ưu tiên dừng ở dấu câu nếu THẬT SỰ có (gõ tay có thể có dấu phẩy), không
  // thì dừng ở danh xưng (xem ADDRESS_STOP_RE) — không bao giờ dừng theo số.
  const punctStop = after.search(/[,.;]| và /iu);
  const honorificStop = after.search(ADDRESS_STOP_RE);
  const candidates = [punctStop, honorificStop].filter((i) => i >= 0);
  const stop = candidates.length ? Math.min(...candidates) : -1;
  const address = (stop >= 0 ? after.slice(0, stop) : after).trim();
  if (!address) return { address: null, matchStart: -1, matchEnd: -1 };
  return { address, matchStart: m.index, matchEnd: m.index + m[0].length + address.length };
}

function cutRange(text, start, end) {
  if (start < 0 || end < 0) return text;
  return (text.slice(0, start) + ' ' + text.slice(end)).replace(/\s{2,}/g, ' ');
}

const UNIT_RE = wordRegex(UNIT_WORDS);
const ORDER_TRIGGER_RE = /^(?:cho\s+(?:tôi|em|mình)\s+(?:đặt|order)|đặt|order|mua|lấy)\s*/iu;
// Dọn từ nối/kích hoạt còn sót lại sau khi cắt tên/SĐT/địa chỉ (xem chú
// thích ở parseVoiceOrder) — không dọn "cho" một mình vì "cho" còn là từ
// thường trong tên sản phẩm/câu bình thường, chỉ dọn cụm rõ ràng là rác.
const LEFTOVER_FILLER_RE = wordRegex(['số điện thoại', 'điện thoại', 'đặt', 'order', 'mua', 'lấy', 'giao tới', 'giao đến', 'giao', 'tới', 'cho']);

// Tách các sản phẩm trong 1 đoạn "và/," — mỗi đoạn là 1 item. `catalogNames`
// (nếu có) là danh sách tên sản phẩm THẬT để khớp đúng tên trong hệ thống.
function extractItems(text, catalogNames) {
  const chunks = text.split(/\s*(?:,|;| và )\s*/iu).map((c) => c.trim()).filter(Boolean);
  const items = [];
  for (const chunk of chunks) {
    let c = chunk.replace(ORDER_TRIGGER_RE, '').trim();
    if (!c) continue;
    const { value: qty, rest } = readLeadingQty(c);
    let productText = rest.trim();
    let unit = 'cái';
    const unitMatch = productText.match(UNIT_RE);
    if (unitMatch) {
      unit = unitMatch[0].toLowerCase();
      productText = cutRange(productText, unitMatch.index, unitMatch.index + unitMatch[0].length).trim();
    }
    if (!productText) continue;
    const catalogName = matchCatalogName(productText, catalogNames);
    items.push({
      name: catalogName || productText.charAt(0).toUpperCase() + productText.slice(1),
      quantity: qty || 1,
      unit,
    });
  }
  return items;
}

export function parseVoiceOrder(rawText, { catalogNames = [], schoolNames = [] } = {}) {
  const empty = { customerName: null, customerPhone: null, address: null, items: [], note: null };
  let text = String(rawText || '').trim().replace(/\s+/g, ' ');
  if (!text) return empty;

  // 0) Đơn TRƯỜNG HỌC: khớp theo danh sách trường CÓ THẬT trước tiên, vì tên
  // trường không có danh xưng (anh/chị/...) như tên khách thường nên
  // extractCustomerName bên dưới không bắt được — giống hệt cách khớp tên
  // nhân viên có thật ở parseVoiceTaskAssign.js.
  let schoolName = null;
  if (schoolNames.length) {
    const sorted = [...schoolNames].filter(Boolean).sort((a, b) => b.length - a.length);
    const normText = () => boDau(text);
    for (const name of sorted) {
      const normName = boDau(name).trim();
      if (!normName) continue;
      const idx = normText().indexOf(normName);
      if (idx === -1) continue;
      schoolName = name;
      text = cutRange(text, idx, idx + normName.length);
      break;
    }
  }

  // 1) SĐT — dễ và chắc chắn nhất, cắt trước.
  let customerPhone = null;
  const phoneMatch = text.match(PHONE_RE);
  if (phoneMatch) {
    customerPhone = phoneMatch[1];
    text = cutRange(text, phoneMatch.index, phoneMatch.index + phoneMatch[0].length);
  }

  // 2) Địa chỉ — cắt trước tên khách để cue-word "giao tới ..." không bị
  // nuốt nhầm vào tên khách nếu tình cờ đứng gần nhau.
  const { address, matchStart: addrStart, matchEnd: addrEnd } = extractAddress(text);
  if (address) text = cutRange(text, addrStart, addrEnd);

  // 3) Tên khách — theo danh xưng (anh/chị/cô/chú...). Bỏ qua nếu đã khớp
  // được tên trường ở bước 0 (2 khái niệm không cùng lúc xảy ra).
  const { name: honorificName, matchStart: nameStart, matchEnd: nameEnd } = schoolName
    ? { name: null, matchStart: -1, matchEnd: -1 }
    : extractCustomerName(text);
  if (honorificName) text = cutRange(text, nameStart, nameEnd);
  const customerName = schoolName || honorificName;

  // LỖI THẬT đã vá: HONORIFIC_RE có thể "đi qua" các từ dừng (số/điện/thoại/
  // đặt...) để quyết định tên khách dừng ở đâu, nhưng chỉ cắt đúng phần TÊN
  // đã cắt gọn — các từ dừng đó (vd "số điện thoại đặt") vẫn còn sót lại
  // NGAY TRƯỚC số lượng sản phẩm, khiến readLeadingQty không đọc được số vì
  // nó không đứng ở đầu đoạn nữa (vd "2 bánh..." bị chặn bởi "số điện thoại
  // đặt 2 bánh..."). Dọn sạch các từ nối/kích hoạt còn sót trước khi tách sản phẩm.
  text = text.replace(LEFTOVER_FILLER_RE, ' ').replace(/\s{2,}/g, ' ').trim();

  // 4) Phần còn lại là danh sách sản phẩm.
  const items = extractItems(text, catalogNames);

  return { customerName, customerPhone, address, items, note: null };
}
