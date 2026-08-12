import { CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Desktop left navigation — 6 core modules" viewport="700x420"
 */
export interface SidebarProps {
  active?: 'orders' | 'kds' | 'warehouse' | 'cashbook' | 'shipping' | 'reports';
  onSelect?: (key: string) => void;
  brand?: string;
  style?: CSSProperties;
}
export function Sidebar(props: SidebarProps): JSX.Element;
