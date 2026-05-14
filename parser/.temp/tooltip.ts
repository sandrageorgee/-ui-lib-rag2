
import { ITooltipProps } from './itooltip';
import './tooltip.css';

const baseClass = 'Cui-Tooltip';

const Tooltip: React.FC<ITooltipProps> = ({
  content,
  children,
  placement = 'top',
  enterDelay = 300,
  leaveDelay = 0,
  disabled = false,
  arrow = true,
  className = '',
}: ITooltipProps) => {
  const [visible, setVisible] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handleMouseEnter = () => {
    if (disabled) return;
    clearTimers();
    enterTimer.current = setTimeout(() => setVisible(true), enterDelay);
  };

  const handleMouseLeave = () => {
    clearTimers();
    leaveTimer.current = setTimeout(() => setVisible(false), leaveDelay);
  };

  const handleFocus = () => { if (!disabled) setVisible(true); };
  const handleBlur  = () => setVisible(false);

  // Derive the base placement direction (top, bottom, left, right) for CSS class
  const baseDirection = placement.split('-')[0];

  return (
    <span
      className={`${baseClass}__wrapper`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={[
            `${baseClass}__popper`,
            `${baseClass}__popper--${baseDirection}`,
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {content}
          {arrow && <span className={`${baseClass}__arrow`} aria-hidden="true" />}
        </span>
      )}
    </span>
  );
};

export default Tooltip;
