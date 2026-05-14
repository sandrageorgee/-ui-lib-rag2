
import { IDataPanelActionProps } from './idatapanel';
import './datapanel.css';

const baseClass = 'Cui-DataPanel__Action';

/**
 * DataPanelAction is a styled button used inside DataPanelFooter.
 * It supports three visual variants (primary, secondary, ghost),
 * optional start/end icon nodes, and a disabled state.
 *
 * It follows the same pattern as DialogButton in the Dialog component:
 * a thin wrapper around a native button with BEM class names.
 */
const DataPanelAction: React.FC<IDataPanelActionProps> = (props: IDataPanelActionProps) => {
  const {
    id,
    label,
    variant = 'secondary',
    disabled = false,
    startIcon,
    endIcon,
    onClick,
  } = props;

  return (
    <button
      id={id}
      type="button"
      className={`${baseClass} ${baseClass}--${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {startIcon && (
        <span className={`${baseClass}__startIcon`} aria-hidden="true">
          {startIcon}
        </span>
      )}
      <span className={`${baseClass}__label`}>{label}</span>
      {endIcon && (
        <span className={`${baseClass}__endIcon`} aria-hidden="true">
          {endIcon}
        </span>
      )}
    </button>
  );
};

export default DataPanelAction;
