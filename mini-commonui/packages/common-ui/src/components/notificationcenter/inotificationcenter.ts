import React from 'react';

/**
 * A single notification entry managed by NotificationCenter.
 */
export interface INotification {
  /** Unique identifier for this notification */
  id: string;
  /** The main notification message */
  message: string;
  /** Optional heading displayed above the message */
  title?: string;
  /** Visual severity — controls colour and icon */
  severity?: 'info' | 'success' | 'warning' | 'error';
  /**
   * Auto-dismiss delay in milliseconds.
   * @default 0 (persists until manually dismissed)
   */
  duration?: number;
}

/**
 * Methods exposed on the NotificationCenter ref.
 * Consumers call these imperatively instead of managing state themselves.
 */
export interface INotificationCenterRef {
  /** Add a notification to the stack */
  push: (notification: INotification) => void;
  /** Remove a specific notification by its id */
  dismiss: (id: string) => void;
  /** Remove every notification at once */
  dismissAll: () => void;
  /** Return the current number of visible notifications */
  getCount: () => number;
}

export interface INotificationCenterProps {
  /**
   * Maximum number of notifications rendered simultaneously.
   * Oldest entries are dropped when the limit is exceeded.
   * @default 5
   */
  maxVisible?: number;
  /**
   * Fixed screen position of the notification stack.
   * @default "top-right"
   */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  /** Additional CSS class applied to the container */
  className?: string;
  /** Inline styles applied to the container */
  style?: React.CSSProperties;
}
