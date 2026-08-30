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

// ---- Bộ icon UI chung (không mắt ếch — line icon thuần cho các glyph thông dụng) ----

export function IconClose(props) {
  return (
    <Wrap {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </Wrap>
  );
}

export function IconWarning(props) {
  return (
    <Wrap {...props}>
      <path d="M12 4 L21 19 L3 19 Z" strokeLinejoin="round" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="16.6" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="1.6" />
    </Wrap>
  );
}

export function IconCheck(props) {
  return (
    <Wrap {...props}>
      <polyline points="5,13 10,18 19,6" />
    </Wrap>
  );
}

export function IconCheckCircle(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="12" r="8" />
      <polyline points="8,12.5 11,15.5 16,9" />
    </Wrap>
  );
}

export function IconBan(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="12" r="8" />
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
    </Wrap>
  );
}

export function IconTruck(props) {
  return (
    <Wrap {...props}>
      <rect x="3" y="10" width="10" height="7" rx="1" />
      <path d="M13 12 L18 12 L20.5 15 L20.5 17 L13 17" />
      <circle cx="7" cy="18.3" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="18.3" r="1.5" fill="currentColor" stroke="none" />
    </Wrap>
  );
}

export function IconCamera(props) {
  return (
    <Wrap {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7 L9.5 4.5 L14.5 4.5 L16 7" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Wrap>
  );
}

export function IconImage(props) {
  return (
    <Wrap {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4 17 L9 12 L13 16 L16 13 L20 17" />
    </Wrap>
  );
}

export function IconBell(props) {
  return (
    <Wrap {...props}>
      <path d="M6 10 C6 6.5 8.5 4 12 4 C15.5 4 18 6.5 18 10 C18 14 19.5 15.5 19.5 15.5 L4.5 15.5 C4.5 15.5 6 14 6 10 Z" />
      <path d="M10 18.5 C10 19.6 10.9 20.5 12 20.5 C13.1 20.5 14 19.6 14 18.5" />
    </Wrap>
  );
}

export function IconSearch(props) {
  return (
    <Wrap {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.3" y1="15.3" x2="20.5" y2="20.5" />
    </Wrap>
  );
}

export function IconChat(props) {
  return (
    <Wrap {...props}>
      <path d="M4 5 L20 5 L20 16 L9 16 L5 19.5 L5 16 L4 16 Z" strokeLinejoin="round" />
    </Wrap>
  );
}

export function IconStar(props) {
  return (
    <Wrap {...props}>
      <path d="M12 4 L14.5 9.5 L20.5 10.2 L16 14.2 L17.3 20 L12 16.9 L6.7 20 L8 14.2 L3.5 10.2 L9.5 9.5 Z" strokeLinejoin="round" />
    </Wrap>
  );
}

export function IconClock(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="12" r="8" />
      <line x1="12" y1="12" x2="12" y2="7.5" />
      <line x1="12" y1="12" x2="15.2" y2="13.5" />
    </Wrap>
  );
}

export function IconReceipt(props) {
  return (
    <Wrap {...props}>
      <path d="M6 3 L18 3 L18 21 L15.5 19.5 L13 21 L10.5 19.5 L8 21 L5.5 19.5 L6 21 Z" strokeLinejoin="round" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </Wrap>
  );
}

export function IconMapPin(props) {
  return (
    <Wrap {...props}>
      <path d="M12 21 C12 21 5 14.5 5 9.5 C5 5.9 8.1 3 12 3 C15.9 3 19 5.9 19 9.5 C19 14.5 12 21 12 21 Z" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.3" />
    </Wrap>
  );
}

export function IconMoney(props) {
  return (
    <Wrap {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <line x1="5.5" y1="9" x2="5.5" y2="9.01" />
      <line x1="18.5" y1="15" x2="18.5" y2="15.01" />
    </Wrap>
  );
}

export function IconPaperclip(props) {
  return (
    <Wrap {...props}>
      <path d="M17 7 L9 15 C7.9 16.1 7.9 17.9 9 19 C10.1 20.1 11.9 20.1 13 19 L20 12 C21.7 10.3 21.7 7.7 20 6 C18.3 4.3 15.7 4.3 14 6 L6.5 13.5" />
    </Wrap>
  );
}

export function IconAdd(props) {
  return (
    <Wrap {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Wrap>
  );
}

export function IconQuestion(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5 C9.5 7.8 10.6 6.8 12 6.8 C13.4 6.8 14.5 7.8 14.5 9.2 C14.5 11 12 11 12 13.2" />
      <line x1="12" y1="16" x2="12" y2="16.01" />
    </Wrap>
  );
}

export function IconEye(props) {
  return (
    <Wrap {...props}>
      <path d="M2.5 12 C4.5 7.5 8 5 12 5 C16 5 19.5 7.5 21.5 12 C19.5 16.5 16 19 12 19 C8 19 4.5 16.5 2.5 12 Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </Wrap>
  );
}

export function IconTrash(props) {
  return (
    <Wrap {...props}>
      <path d="M4 7 L20 7" />
      <path d="M9 7 L9 4.5 L15 4.5 L15 7" />
      <path d="M6 7 L7 20.5 L17 20.5 L18 7" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </Wrap>
  );
}

export function IconMic(props) {
  return (
    <Wrap {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11 C5.5 15 8.4 17.5 12 17.5 C15.6 17.5 18.5 15 18.5 11" />
      <line x1="12" y1="17.5" x2="12" y2="21" />
    </Wrap>
  );
}

export function IconPhone(props) {
  return (
    <Wrap {...props}>
      <path d="M5.5 4 L9 4 L10.5 8 L8 9.8 C8.9 12 10 13.1 12.2 14 L14 11.5 L18 13 L18 16.5 C18 17.9 16.8 19 15.4 18.9 C9.7 18.5 5.5 14.3 5.1 8.6 C5 7.2 4.1 4.9 5.5 4 Z" strokeLinejoin="round" />
    </Wrap>
  );
}

export function IconChevronDown(props) {
  return (
    <Wrap {...props}>
      <polyline points="6,9 12,15 18,9" />
    </Wrap>
  );
}

export function IconRuler(props) {
  return (
    <Wrap {...props}>
      <rect x="3" y="8" width="18" height="8" rx="1.5" transform="rotate(-8 12 12)" />
      <line x1="7" y1="9.5" x2="7.6" y2="12" />
      <line x1="11" y1="9" x2="11.6" y2="11.5" />
      <line x1="15" y1="8.5" x2="15.6" y2="11" />
    </Wrap>
  );
}

export function IconTrendDown(props) {
  return (
    <Wrap {...props}>
      <polyline points="4,7 10,13 13,10 20,17" />
      <polyline points="14,17 20,17 20,11" />
    </Wrap>
  );
}

export function IconEdit(props) {
  return (
    <Wrap {...props}>
      <path d="M4 20 L4.6 16.4 L15.5 5.5 C16.3 4.7 17.6 4.7 18.4 5.5 C19.2 6.3 19.2 7.6 18.4 8.4 L7.5 19.3 Z" strokeLinejoin="round" />
      <line x1="13.5" y1="7.5" x2="16.5" y2="10.5" />
    </Wrap>
  );
}

export function IconClipboard(props) {
  return (
    <Wrap {...props}>
      <rect x="5" y="4.5" width="14" height="17" rx="1.5" />
      <rect x="9" y="3" width="6" height="3" rx="1" fill="currentColor" stroke="none" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </Wrap>
  );
}

export function IconDownload(props) {
  return (
    <Wrap {...props}>
      <line x1="12" y1="4" x2="12" y2="14" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="5" y1="19" x2="19" y2="19" />
    </Wrap>
  );
}

export function IconHome(props) {
  return (
    <Wrap {...props}>
      <path d="M4 11 L12 4 L20 11" />
      <path d="M6 10 L6 20 L18 20 L18 10" />
      <line x1="10" y1="20" x2="10" y2="14.5" />
      <line x1="14" y1="20" x2="14" y2="14.5" />
      <line x1="10" y1="14.5" x2="14" y2="14.5" />
    </Wrap>
  );
}

export function IconMenu(props) {
  return (
    <Wrap {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </Wrap>
  );
}

export function IconMegaphone(props) {
  return (
    <Wrap {...props}>
      <path d="M3 9 L8 9 L17 4 L17 18 L8 13 L3 13 Z" strokeLinejoin="round" />
      <path d="M6 13 L6 17.5 C6 18.6 6.9 19.5 8 19.5 C8.7 19.5 9 19 9 18.3 L9 13" />
    </Wrap>
  );
}

export function IconUser(props) {
  return (
    <Wrap {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 21 C4.5 15.8 7.6 13.3 12 13.3 C16.4 13.3 19.5 15.8 19.5 21" />
    </Wrap>
  );
}
