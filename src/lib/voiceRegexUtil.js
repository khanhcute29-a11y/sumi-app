// Biên từ (word boundary) an toàn cho tiếng Việt có dấu.
//
// LỖI THẬT đã vá: \b của JS chỉ hiểu \w = [A-Za-z0-9_] (thuần ASCII) — coi
// mọi nguyên âm có dấu ("ớ", "à", "ệ"...) là KÝ TỰ KHÔNG PHẢI CHỮ. Hậu quả:
//   - \bnhớ\b KHÔNG BAO GIỜ khớp "nhớ" dù đứng riêng một mình, vì \b sau "ớ"
//     đòi hỏi 1 bên là \w — nhưng "ớ" đã bị coi là \W nên cả 2 bên là \W,
//     không tạo thành biên.
//   - \blà\b lại khớp NHẦM vào giữa chữ "làm" (l|àm), vì \b chỉ cần bên
//     trái/phải của vị trí đang xét là \w/\W khác nhau — 'l'(\w) và 'à'(\W
//     theo JS) tạo ra 1 biên giả ngay giữa từ.
// Dùng \p{L}/\p{N} (chữ cái + chữ số THEO UNICODE THẬT) qua lookaround thay
// cho \b để biên từ đúng với toàn bộ ký tự có dấu tiếng Việt.
export function wordRegex(words, flags = 'gi') {
  const alt = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, `${flags}u`);
}
