// Bóc tách "Số tiền" + "Nội dung" từ câu nói tự do kiểu Thu Chi, ví dụ:
//   "Chi năm trăm cành mua nguyên liệu"  -> { amount: 500000,   label: 'mua nguyên liệu' }
//   "Thu 2 triệu tiền cọc bánh"          -> { amount: 2000000,  label: 'tiền cọc bánh' }
// Số tiền luôn được coi là nằm NGAY ĐẦU câu (sau khi bỏ từ "thu"/"chi" nếu có)
// — không quét cả câu — để tránh nhầm số lượng nguyên liệu ("một bao bột")
// thành số tiền.

const DIGIT_WORDS = {
  'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3, 'bốn': 4, 'tư': 4,
  'năm': 5, 'lăm': 5, 'nhăm': 5, 'sáu': 6, 'bảy': 7, 'bẩy': 7, 'tám': 8, 'chín': 9,
};
const SKIP_WORDS = new Set(['linh', 'lẻ', 'và']);
const SCALE_WORDS = { 'tỷ': 1e9, 'tỉ': 1e9, 'triệu': 1e6, 'tr': 1e6, 'củ': 1e6, 'chai': 1e6, 'nghìn': 1e3, 'ngàn': 1e3, 'cành': 1e3, 'k': 1e3 };

function normalize(text) {
  return (text || '').trim().replace(/\s+/g, ' ');
}

// Đọc 1 nhóm số nhỏ (0-999) từ đầu mảng token, trả về {value, consumed}.
function readSmallNumber(tokens, start) {
  let value = 0;
  let hundredsDigit = null;
  let i = start;
  let consumed = 0;
  while (i < tokens.length) {
    const w = tokens[i];
    if (w in DIGIT_WORDS) {
      const d = DIGIT_WORDS[w];
      const next = tokens[i + 1];
      if (next === 'trăm') { hundredsDigit = d; value = d * 100; i += 2; consumed += 2; continue; }
      if (next === 'mươi' || next === 'chục') { value += d * 10; i += 2; consumed += 2; continue; }
      value += d; i += 1; consumed += 1; continue;
    }
    if (SKIP_WORDS.has(w)) { i += 1; consumed += 1; continue; }
    break;
  }
  return { value, consumed };
}

export function parseThuChiVoice(rawText) {
  const original = normalize(rawText);
  if (!original) return { amount: null, label: '' };

  const lower = original.toLowerCase();
  const withoutVerb = lower.replace(/^(thu|chi)\s+/, '');
  const offset = lower.length - withoutVerb.length; // vị trí bắt đầu phần còn lại trong chuỗi gốc

  // 1) Số tiền viết bằng chữ số, có thể kèm đơn vị (500.000 / 2,000,000 / 500k / 2 triệu)
  const digitMatch = withoutVerb.match(/^(\d[\d.,]*)(?:\s*(k|nghìn|ngàn|triệu|tr|củ|chai|tỷ|tỉ))?\s*/i);
  if (digitMatch) {
    const num = Number(digitMatch[1].replace(/[.,]/g, ''));
    const unit = digitMatch[2] ? SCALE_WORDS[digitMatch[2].toLowerCase()] : 1;
    if (!Number.isNaN(num) && num > 0) {
      const amount = num * unit;
      const label = original.slice(offset + digitMatch[0].length).trim();
      return { amount, label };
    }
  }

  // 2) Số tiền đọc bằng chữ (năm trăm cành / hai triệu / một trăm nghìn...)
  const tokens = withoutVerb.split(' ').filter(Boolean);
  let total = 0;
  let idx = 0;
  let matchedAnyChunk = false;
  while (idx < tokens.length) {
    const { value, consumed } = readSmallNumber(tokens, idx);
    const scaleWord = tokens[idx + consumed];
    if (scaleWord && scaleWord in SCALE_WORDS) {
      const chunkValue = (consumed > 0 ? value : 1) * SCALE_WORDS[scaleWord];
      total += chunkValue;
      idx += consumed + 1;
      matchedAnyChunk = true;
      continue;
    }
    break;
  }

  if (matchedAnyChunk) {
    const restTokens = tokens.slice(idx);
    const label = restTokens.join(' ').trim();
    return { amount: total, label };
  }

  // Không nhận diện được số tiền — trả nguyên câu (đã bỏ thu/chi) làm nội dung.
  return { amount: null, label: original.slice(offset).trim() };
}
