import { ReactNode, CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Metric card for reports and cashbook P&L" viewport="700x140"
 */
export interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  tone?: 'neutral' | 'success' | 'danger';
  icon?: ReactNode;
  style?: CSSProperties;
}
export function StatCard(props: StatCardProps): JSX.Element;
