import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  INotification,
  INotificationCenterProps,
  INotificationCenterRef,
} from './inotificationcenter';
import './notificationcenter.css';

// Parser anchors: force the schema generator to track these interfaces.
// Names intentionally do not match the stage6 filter (no "Props", no ^I[A-Z])
// so only the real interfaces end up in the output.
type _p = INotificationCenterProps;
type _r = INotificationCenterRef;
type _n = INotification;

/**
 * NotificationCenter
 *
 * A fixed-position notification stack controlled entirely through a ref.
 * Parent components never need to manage notification state themselves —
 * they simply call `ref.current.push(...)`, `dismiss(id)`, or `dismissAll()`.
 *
 * @example
 * const ncRef = useRef<INotificationCenterRef>(null);
 *
 * const handleSave = async () => {
 *   await save();
 *   ncRef.current?.push({ id: 'save-ok', severity: 'success', message: 'Saved!', duration: 3000 });
 * };
 *
 * return (
 *   <>
 *     <button onClick={handleSave}>Save</button>
 *     <NotificationCenter ref={ncRef} position="top-right" />
 *   </>
 * );
 */
const NotificationCenter = forwardRef<INotificationCenterRef, INotificationCenterProps>(
  ({ maxVisible = 5, position = 'top-right', className, style }, ref) => {
    const [notifications, setNotifications] = useState<INotification[]>([]);

    // Track auto-dismiss timers so they can be cleared on unmount or dismissAll
    const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    // Keep a stable ref to the notification array so getCount() is never stale
    const notificationsRef = useRef<INotification[]>([]);
    notificationsRef.current = notifications;

    const dismiss = useCallback((id: string) => {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const push = useCallback(
      (notification: INotification) => {
        setNotifications(prev => {
          // Replace if the same id is pushed again; otherwise prepend
          const without = prev.filter(n => n.id !== notification.id);
          return [notification, ...without].slice(0, maxVisible);
        });

        if (notification.duration && notification.duration > 0) {
          // Clear any existing timer for this id before setting a new one
          clearTimeout(timersRef.current[notification.id]);
          timersRef.current[notification.id] = setTimeout(() => {
            dismiss(notification.id);
          }, notification.duration);
        }
      },
      [maxVisible, dismiss],
    );

    const dismissAll = useCallback(() => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      setNotifications([]);
    }, []);

    // Expose imperative API to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        push,
        dismiss,
        dismissAll,
        getCount: () => notificationsRef.current.length,
      }),
      [push, dismiss, dismissAll],
    );

    // Clean up all timers when the component unmounts
    useEffect(() => {
      const timers = timersRef.current;
      return () => {
        Object.values(timers).forEach(clearTimeout);
      };
    }, []);

    const positionClass = `Cui-NotificationCenter--${position}`;
    const rootClass = ['Cui-NotificationCenter', positionClass, className]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={rootClass}
        style={style}
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {notifications.map(n => (
          <div
            key={n.id}
            className={`Cui-NotificationCenter__item Cui-NotificationCenter__item--${n.severity ?? 'info'}`}
            role="alert"
          >
            {n.title && (
              <strong className="Cui-NotificationCenter__item-title">{n.title}</strong>
            )}
            <span className="Cui-NotificationCenter__item-message">{n.message}</span>
            <button
              type="button"
              className="Cui-NotificationCenter__item-close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(n.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  },
);

NotificationCenter.displayName = 'NotificationCenter';
export default NotificationCenter;
export type { INotificationCenterProps, INotificationCenterRef, INotification };
