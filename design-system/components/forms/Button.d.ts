import { ReactNode, CSSProperties } from 'react';

/**
 * @startingPoint section="Components" subtitle="Primary, secondary, ghost and danger button variants" viewport="700x160"
 */
export interface ButtonProps {
  children: ReactNode;
  /** Visual style. primary = Buttery Yellow fill, used for the main action per screen. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Optional leading icon/emoji node. */
  icon?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}
export function Button(props: ButtonProps): JSX.Element;
