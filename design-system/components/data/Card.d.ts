import { ReactNode, CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Base surface card — white, soft shadow, 16px radius" viewport="700x140"
 */
export interface CardProps {
  children: ReactNode;
  padding?: number | string;
  style?: CSSProperties;
}
export function Card(props: CardProps): JSX.Element;
