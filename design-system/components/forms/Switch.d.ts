import { CSSProperties } from 'react';
export interface SwitchProps {
  label?: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  style?: CSSProperties;
}
export function Switch(props: SwitchProps): JSX.Element;
