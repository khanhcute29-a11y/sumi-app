import React from 'react';

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Wrap({ size = 20, children, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, ...style }} aria-hidden="true" {...base}>
      {children}
    </svg>
  );
}

function Eyes({ x1, x2, y, r = 0.9 }) {
  return (
    <g fill="currentColor" stroke="none">
      <circle cx={x1} cy={y} r={r} />
      <circle cx={x2} cy={y} r={r} />
    </g>
  );
}

export function IconDashboard(props) {
  return (
    <Wrap {...props}>
      <rect x="3" y="12" width="4" height="8" />
      <rect x="10" y="6.5" width="4" height="13.5" />
      <rect x="17" y="10" width="4" height="10" />
      <Eyes x1="10.8" x2="13.2" y="4.4" r="0.85" />
    </Wrap>
  );
}

export function IconOrders(props) {
  return (
    <Wrap {...props}>
      <rect x="5" y="10" width="14" height="10" rx="1" />
      <path d="M5 10 L12 5 L19 10" />
      <Eyes x1="10.2" x2="13.8" y="7.6" />
    </Wrap>
  );
}

export function IconKitchen(props) {
  return (
    <Wrap {...props}>
      <path d="M12 3 C8 8 8 11.5 10.5 14.5 C9.3 11.5 12 10 12 10 C12 10 14.7 11.5 13.5 14.5 C16 11.5 16 8 12 3 Z" />
      <Eyes x1="10.3" x2="13.7" y="9.6" r="0.8" />
    </Wrap>
  );
}

export function IconWarehouse(props) {
  return (
    <Wrap {...props}>
      <rect x="4" y="8" width="16" height="12" rx="1" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <Eyes x1="10" x2="14" y="11" />
    </Wrap>
  );
}

export function IconCashbook(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="13" r="7" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none">đ</text>
      <Eyes x1="9.3" x2="14.7" y="8.5" r="0.8" />
    </Wrap>
  );
}

export function IconShipping(props) {
  return (
    <Wrap {...props}>
      <rect x="3" y="11" width="10" height="7" rx="1" />
      <path d="M13 13 L18 13 L20.5 16 L20.5 18 L13 18" />
      <circle cx="7" cy="19.3" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="19.3" r="1.6" fill="currentColor" stroke="none" />
      <Eyes x1="15.3" x2="17.5" y="14.7" r="0.65" />
    </Wrap>
  );
}

export function IconProducts(props) {
  return (
    <Wrap {...props}>
      <path d="M6 12 L7 20 L17 20 L18 12 Z" />
      <path d="M6 12 Q12 6 18 12 Z" />
      <Eyes x1="10.3" x2="13.7" y="10.3" r="0.75" />
    </Wrap>
  );
}

export function IconShifts(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="13" r="7" />
      <line x1="12" y1="13" x2="12" y2="9" />
      <line x1="12" y1="13" x2="15" y2="13" />
      <Eyes x1="8.2" x2="15.8" y="13" r="0.75" />
    </Wrap>
  );
}

export function IconReports(props) {
  return (
    <Wrap {...props}>
      <polyline points="4,18 9,12 13,15 19,7" />
      <path d="M15,7 L19,7 L19,11" />
      <Eyes x1="9.2" x2="11" y="10" r="0.7" />
    </Wrap>
  );
}

export function IconCustomers(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21 C5 15 8.5 13 12 13 C15.5 13 19 15 19 21" />
    </Wrap>
  );
}

export function IconStaff(props) {
  return (
    <Wrap {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M4 21 C4 16.3 6.2 14.3 9 14.3 C11.8 14.3 14 16.3 14 21" />
      <circle cx="16.5" cy="9" r="2.8" />
      <path d="M12.3 21 C12.3 16.8 14.2 15.3 16.5 15.3 C18.8 15.3 20.7 16.8 20.7 21" />
    </Wrap>
  );
}

export function IconSettings(props) {
  const teeth = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  return (
    <Wrap {...props}>
      <g>
        {teeth.map((deg) => (
          <line key={deg} x1="12" y1="4.2" x2="12" y2="6.4" transform={`rotate(${deg} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="6" />
      <Eyes x1="10" x2="14" y="11" r="0.85" />
    </Wrap>
  );
}

export function IconStationHot(props) { return <IconKitchen {...props} />; }

export function IconStationCold(props) {
  return (
    <Wrap {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="7" y1="7" x2="17" y2="17" />
      <line x1="17" y1="7" x2="7" y2="17" />
      <Eyes x1="9.6" x2="14.4" y="9.2" r="0.7" />
    </Wrap>
  );
}

export function IconStationWorkshop(props) {
  return (
    <Wrap {...props}>
      <rect x="4" y="12" width="16" height="8" rx="1" />
      <rect x="7" y="6" width="3" height="6" />
      <Eyes x1="10" x2="14" y="15.4" r="0.8" />
    </Wrap>
  );
}

export function IconStationSparkle(props) {
  return (
    <Wrap {...props}>
      <path d="M12 4 L14 10 L20 12 L14 14 L12 20 L10 14 L4 12 L10 10 Z" />
      <Eyes x1="10.6" x2="13.4" y="11" r="0.65" />
    </Wrap>
  );
}
