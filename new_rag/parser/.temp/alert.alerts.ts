
import { IAlertProps } from './ialerts';
import '../alerts.css';

const baseClass = 'Cui-Alert';

const DEFAULT_ICONS: Record<NonNullable<IAlertProps['severity']>, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
};

const Alert: React.FC<IAlertProps> = (props: IAlertProps) => {
  const {
    id,
    severity = 'info',
    message,
    title,
    closeable = false,
    onClose,
    icon,
    show = true,
    className = '',
    style,
  } = props;

  if (!show) return null;

  const displayIcon = icon ?? DEFAULT_ICONS[severity];

  return (
    <div
      id={id}
      className={`${baseClass} ${baseClass}--${severity} ${className}`.trim()}
      style={style}
      role="alert"
      aria-live="polite"
    >
      <span className={`${baseClass}__icon`} aria-hidden="true">
        {displayIcon}
      </span>

      <div className={`${baseClass}__content`}>
        {title && <span className={`${baseClass}__title`}>{title}</span>}
        <p className={`${baseClass}__message`}>{message}</p>
      </div>

      {closeable && (
        <button
          className={`${baseClass}__closeBtn`}
          aria-label="Close alert"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default Alert;
