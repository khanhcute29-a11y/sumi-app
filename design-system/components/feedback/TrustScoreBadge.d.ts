import { CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Customer trust rating that gates COD for new customers" viewport="700x110"
 */
export interface TrustScoreBadgeProps {
  /** 0-5 star rating. */
  score?: number;
  /** When true, shows the COD-locked state for unfamiliar customers. */
  locked?: boolean;
  style?: CSSProperties;
}
export function TrustScoreBadge(props: TrustScoreBadgeProps): JSX.Element;
