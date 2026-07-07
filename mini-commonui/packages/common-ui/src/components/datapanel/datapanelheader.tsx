import React from 'react';
import { IDataPanelHeaderProps } from './idatapanel';
import './datapanel.css';

const baseClass = 'Cui-DataPanel__Header';

/**
 * DataPanelHeader renders the coloured title bar of a DataPanel.
 * It displays a title, an optional subtitle, a leading icon, and right-side
 * controls (collapse toggle and close button). It is not intended to be used
 * standalone — it is managed by the DataPanel parent component.
 */
const DataPanelHeader: React.FC<IDataPanelHeaderProps> = (props: IDataPanelHeaderProps) => {
  const {
    id,
    title,
    subtitle,
    icon,
    collapsible,
    collapsed,
    onToggleCollapse,
    onClose,
    rightContent,
  } = props;

  return (
    <div id={id} className={`${baseClass}-root`}>
      {/* Left section: icon + title stack */}
      <div className={`${baseClass}__left`}>
        {icon && (
          <span className={`${baseClass}__icon`} aria-hidden="true">
            {icon}
          </span>
        )}
        <div className={`${baseClass}__titles`}>
          <span id={`${id}-title`} className={`${baseClass}__title`}>
            {title}
          </span>
          {subtitle && (
            <span className={`${baseClass}__subtitle`}>{subtitle}</span>
          )}
        </div>
      </div>

      {/* Right section: slot content + collapse + close */}
      <div className={`${baseClass}__right`}>
        {rightContent}

        {collapsible && onToggleCollapse && (
          <button
            className={`${baseClass}__collapseBtn`}
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            onClick={onToggleCollapse}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}

        {onClose && (
          <button
            className={`${baseClass}__closeBtn`}
            type="button"
            aria-label="Close panel"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default DataPanelHeader;
