import { CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Red/yellow/green expiry-date tag for raw-material stock" viewport="700x110"
 */
export interface FifoTagProps {
  status?: 'fresh' | 'soon' | 'expired';
  date?: string;
  style?: CSSProperties;
}
export function FifoTag(props: FifoTagProps): JSX.Element;
