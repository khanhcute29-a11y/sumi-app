import { ReactNode, CSSProperties } from 'react';
/**
 * @startingPoint section="Components" subtitle="Order ticket card for the Omnichannel Inbox kanban" viewport="700x220"
 */
export interface KanbanCardProps {
  customer: string;
  phone?: string;
  item?: string;
  note?: string;
  channel?: string;
  badges?: ReactNode[];
  thumbnail?: string;
  onClick?: () => void;
  style?: CSSProperties;
}
export function KanbanCard(props: KanbanCardProps): JSX.Element;
