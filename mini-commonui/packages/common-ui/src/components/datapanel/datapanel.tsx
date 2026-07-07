import React, { useState } from 'react';
import { IDataPanelProps } from './idatapanel';
import DataPanelHeader from './datapanelheader';
import DataPanelBody from './datapanelbody';
import DataPanelFooter from './datapanelfooter';
import './datapanel.css';

const baseClass = 'Cui-DataPanel';

/**
 * DataPanel is a composed panel component that manages a collapsible
 * header, a scrollable body, and an optional footer toolbar.
 *
 * It orchestrates three sub-components:
 *  - DataPanelHeader  — title bar with optional collapse/close controls
 *  - DataPanelBody    — content area with loading and empty states
 *  - DataPanelFooter  — action button row rendered only when actions are provided
 */
const DataPanel: React.FC<IDataPanelProps> = (props: IDataPanelProps) => {
  const {
    id,
    title,
    subtitle,
    show = true,
    collapsible = false,
    defaultCollapsed = false,
    icon,
    onClose,
    children,
    actions = [],
    emptyMessage,
    loading = false,
    footerJustify = 'flex-end',
    className = '',
    style,
  } = props;

  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!show) return null;

  const handleToggleCollapse = () => setCollapsed(prev => !prev);

  return (
    <div
      id={id}
      className={`${baseClass} ${className}`.trim()}
      style={style}
      role="region"
      aria-labelledby={`${id}-title`}
    >
      <DataPanelHeader
        id={`${id}-header`}
        title={title}
        subtitle={subtitle}
        icon={icon}
        collapsible={collapsible}
        collapsed={collapsed}
        onToggleCollapse={collapsible ? handleToggleCollapse : undefined}
        onClose={onClose}
      />

      <DataPanelBody
        loading={loading}
        emptyMessage={emptyMessage}
        collapsed={collapsed}
      >
        {children}
      </DataPanelBody>

      {actions.length > 0 && !collapsed && (
        <DataPanelFooter actions={actions} justify={footerJustify} />
      )}
    </div>
  );
};

export default DataPanel;
