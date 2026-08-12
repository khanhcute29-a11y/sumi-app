import { CSSProperties } from 'react';
export interface CheckboxProps {
  label?: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  style?: CSSProperties;
}
export function Checkbox(props: CheckboxProps): JSX.Element;
