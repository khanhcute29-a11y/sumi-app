const KEY = 'sumi-ui-scale';
const SCALE_MAP = { small: 0.9, normal: 1, large: 1.15 };

export function getUiScale() {
  return localStorage.getItem(KEY) || 'normal';
}

export function applyUiScale(scale) {
  document.documentElement.style.zoom = SCALE_MAP[scale] || 1;
}

export function setUiScale(scale) {
  localStorage.setItem(KEY, scale);
  applyUiScale(scale);
}
