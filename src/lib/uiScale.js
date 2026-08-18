const KEY = 'sumi-ui-scale';
const SCALE_MAP = { small: 0.9, normal: 1, large: 1.15 };

export function getUiScale() {
  return localStorage.getItem(KEY) || 'normal';
}

export function applyUiScale(scale) {
  // CSS `zoom` has known rendering bugs on mobile Safari when combined with
  // horizontal-scroll flex rows (clipped/overlapping content) — skip it on
  // mobile viewports, where native pinch-zoom already covers this need.
  const isMobileViewport = window.innerWidth < 860;
  document.documentElement.style.zoom = isMobileViewport ? 1 : (SCALE_MAP[scale] || 1);
}

export function setUiScale(scale) {
  localStorage.setItem(KEY, scale);
  applyUiScale(scale);
}
