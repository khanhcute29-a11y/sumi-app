import { CSSProperties } from 'react';
export interface TabItem { key: string; label: string; }
/**
 * @startingPoint section="Components" subtitle="Underline tabs — Sổ Quỹ THU/CHI/CÔNG NỢ/P&L, kitchen stations" viewport="700x80"
 */
export interface TabsProps {
  tabs: TabItem[];
  active?: string;
  onChange?: (key: string) => void;
  style?: CSSProperties;
}
export function Tabs(props: TabsProps): JSX.Element;
