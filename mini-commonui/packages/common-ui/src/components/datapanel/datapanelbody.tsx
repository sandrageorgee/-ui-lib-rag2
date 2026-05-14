import React from 'react';
import { IDataPanelBodyProps } from './idatapanel';
import './datapanel.css';

const baseClass = 'Cui-DataPanel__Body';

/**
 * DataPanelBody renders the scrollable content area of a DataPanel.
 *
 * Priority order:
 *  1. When `collapsed` is true  — renders nothing (body hidden).
 *  2. When `loading` is true    — renders a centred loading spinner.
 *  3. When `children` is set    — renders the children as-is.
 *  4. When `emptyMessage` given — renders an empty-state paragraph.
 *  5. Otherwise                  — renders an empty container.
 *
 * It is not intended to be used standalone — it is managed by DataPanel.
 */
const DataPanelBody: React.FC<IDataPanelBodyProps> = (props: IDataPanelBodyProps) => {
  const {
    children,
    loading = false,
    emptyMessage,
    collapsed = false,
    className = '',
    style,
  } = props;

  if (collapsed) return null;

  return (
    <div
      className={`${baseClass} ${className}`.trim()}
      style={style}
      role="group"
      aria-busy={loading}
    >
      {loading ? (
        <div className={`${baseClass}__loading`} role="status" aria-label="Loading content">
          <span className={`${baseClass}__spinner`} />
        </div>
      ) : children ? (
        children
      ) : emptyMessage ? (
        <p className={`${baseClass}__empty`}>{emptyMessage}</p>
      ) : null}
    </div>
  );
};

export default DataPanelBody;
