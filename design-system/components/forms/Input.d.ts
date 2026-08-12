import { CSSProperties, ChangeEventHandler } from 'react';
export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  error?: string;
  helpText?: string;
  type?: string;
  style?: CSSProperties;
}
export function Input(props: InputProps): JSX.Element;
