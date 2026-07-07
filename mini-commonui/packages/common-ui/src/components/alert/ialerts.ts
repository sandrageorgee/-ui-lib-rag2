import { ReactNode } from "react";

/**
 * Severity levels for the Alert component.
 */
export type AlertSeverity = "info" | "success" | "warning" | "error";

/**
 * Interface for the Alert component.
 * Displays a short, important message to attract the user's attention.
 */
export interface IAlertProps {
  /**
   * Identifier for the alert element.
   */
  id: string;

  /**
   * The severity of the alert, which controls its colour and default icon.
   * @default "info"
   */
  severity?: AlertSeverity;

  /**
   * The main message text displayed inside the alert.
   */
  message: string;

  /**
   * Optional title displayed above the message in bold.
   */
  title?: string;

  /**
   * When true, a close button is rendered in the top-right corner.
   * @default false
   */
  closeable?: boolean;

  /**
   * Callback fired when the close button is clicked.
   */
  onClose?: () => void;

  /**
   * Custom icon to override the default severity icon.
   */
  icon?: ReactNode;

  /**
   * Whether the alert is currently visible.
   * @default true
   */
  show?: boolean;

  /**
   * Additional CSS class names applied to the root element.
   */
  className?: string;

  /**
   * Inline styles applied to the root element.
   */
  style?: React.CSSProperties;
}
