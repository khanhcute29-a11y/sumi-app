import { CSSProperties } from 'react';
export interface ToastProps {
  tone?: 'success' | 'danger' | 'warning' | 'info';
  title?: string;
  message?: string;
  onClose?: () => void;
  style?: CSSProperties;
}
export function Toast(props: ToastProps): JSX.Element;
