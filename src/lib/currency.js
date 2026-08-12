export function formatVnd(value) {
  const n = Number(value);
  if (!value || !n) return '';
  return `${n.toLocaleString('vi-VN')} đồng`;
}

export function parseDigits(text) {
  return text.replace(/[^\d]/g, '');
}
