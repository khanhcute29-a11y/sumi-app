// Bóc tách giọng nói theo NGỮ CẢNH form đang đứng — dùng chung 1 mic
// (VoiceMicButton) cho mọi module, mỗi module tự chọn context phù hợp và tự
// quyết định dùng field nào trong kết quả trả về.
//
// context có sẵn:
//   'finance'   — Thu Chi / Ghi khoản chi / Tạm ứng: { amount, label }
//   'task'      — Giao việc: { title, description }
//   'warehouse' — Nhập kho thành phẩm: { qty, product, size }
//
// Số tiền/số lượng luôn được coi là nằm ở ĐẦU câu nói (ngay sau động từ như
// "chi"/"thu"/"nhập" nếu có) — không quét cả câu — để không nhầm số lượng
// nhắc tới trong nội dung ("một bao bột") thành số cần điền.

import { parseThuChiVoice } from './parseVoiceAmount.js';

const DIGIT_WORDS = {
  'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
  'năm': 5, 'lăm': 5, 'nhăm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9,
};

function normalize(text) {
  return (text || '').trim().replace(/\s+/g, ' ');
}

// Đọc số lượng ĐƠN GIẢN ở đầu câu — chỉ 0-999, không có nghìn/triệu (số
// lượng sản phẩm không cần quy mô lớn như tiền). Trả {value, consumedText}.
function readLeadingCount(text) {
  const digitMatch = text.match(/^(\d+)\s*/);
  if (digitMatch) return { value: Number(digitMatch[1]), rest: text.slice(digitMatch[0].length) };

  const tokens = text.split(' ').filter(Boolean);
  let value = 0, i = 0, matched = false;
  while (i < tokens.length) {
    const w = tokens[i];
    if (w in DIGIT_WORDS) {
      const next = tokens[i + 1];
      if (next === 'trăm') { value = DIGIT_WORDS[w] * 100; i += 2; matched = true; continue; }
      if (next === 'mươi' || next === 'chục') { value += DIGIT_WORDS[w] * 10; i += 2; matched = true; continue; }
      value += DIGIT_WORDS[w]; i += 1; matched = true; continue;
    }
    if (w === 'linh' || w === 'lẻ') { i += 1; continue; }
    break;
  }
  if (!matched) return { value: null, rest: text };
  return { value, rest: tokens.slice(i).join(' ') };
}

function parseTaskVoice(rawText) {
  const text = normalize(rawText);
  if (!text) return { title: '', description: '' };
  // Cắt tại dấu câu đầu tiên -> phần trước là Tên công việc, phần sau là Mô tả.
  const m = text.match(/^(.*?)[.,;]\s*(.+)$/);
  if (m) return { title: m[1].trim(), description: m[2].trim() };
  return { title: text, description: '' };
}

const SIZE_UNIT_RE = /\b(\d+(?:[.,]\d+)?\s?(?:cm|mm|g|kg|ml|l|inch))\b/i;

function parseWarehouseVoice(rawText) {
  const text = normalize(rawText);
  if (!text) return { qty: null, product: '', size: '' };

  const withoutVerb = text.toLowerCase().replace(/^(nhập|nhập kho)\s+/, '');
  const offset = text.length - withoutVerb.length;
  const { value: qty, rest } = readLeadingCount(withoutVerb);

  // Ô "size" — tìm cụm kiểu "size 18cm" hoặc số kèm đơn vị (18cm/220g) nằm
  // bất kỳ đâu trong phần còn lại, tách riêng khỏi tên sản phẩm.
  let size = '';
  let productPart = qty !== null ? text.slice(offset + (withoutVerb.length - rest.length)).trim() : text.slice(offset).trim();

  const sizeCueMatch = productPart.match(/\bsize\s+([^\s,]+(?:\s?(?:cm|mm|g|kg|ml|l|inch))?)/i);
  if (sizeCueMatch) {
    size = sizeCueMatch[1].trim();
    productPart = (productPart.slice(0, sizeCueMatch.index) + productPart.slice(sizeCueMatch.index + sizeCueMatch[0].length)).trim();
  } else {
    const bare = productPart.match(SIZE_UNIT_RE);
    if (bare) {
      size = bare[1].replace(/\s+/g, '');
      productPart = (productPart.slice(0, bare.index) + productPart.slice(bare.index + bare[0].length)).trim();
    }
  }

  return { qty, product: productPart.replace(/\s{2,}/g, ' ').trim(), size };
}

export function parseVoiceByContext(context, text) {
  switch (context) {
    case 'finance':
      return parseThuChiVoice(text);
    case 'task':
      return parseTaskVoice(text);
    case 'warehouse':
      return parseWarehouseVoice(text);
    default:
      return { raw: normalize(text) };
  }
}
