import { ReactNode, CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Status chip for orders, kitchen tickets and stock" viewport="700x120"
 */
export interface BadgeProps {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'primary';
  icon?: ReactNode;
  style?: CSSProperties;
}
export function Badge(props: BadgeProps): JSX.Element;
