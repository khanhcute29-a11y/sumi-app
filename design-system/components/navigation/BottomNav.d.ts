import { CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Mobile bottom bar — 4 core icons + Thêm overflow" viewport="700x90"
 */
export interface BottomNavProps {
  active?: 'orders' | 'kds' | 'warehouse' | 'cashbook';
  onSelect?: (key: string) => void;
  onMore?: () => void;
  style?: CSSProperties;
}
export function BottomNav(props: BottomNavProps): JSX.Element;
