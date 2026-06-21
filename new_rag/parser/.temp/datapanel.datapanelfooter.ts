
import { IDataPanelFooterProps } from './idatapanel';
import DataPanelAction from './datapanelaction';
import './datapanel.css';

const baseClass = 'Cui-DataPanel__Footer';

/**
 * DataPanelFooter renders a horizontal toolbar at the bottom of a DataPanel.
 * It maps each entry in the `actions` array to a DataPanelAction button and
 * aligns them according to the `justify` prop.
 *
 * It is not intended to be used standalone — it is managed by DataPanel,
 * which only renders the footer when the actions array is non-empty and the
 * panel is not collapsed.
 */
const DataPanelFooter: React.FC<IDataPanelFooterProps> = (props: IDataPanelFooterProps) => {
  const { actions, justify = 'flex-end' } = props;

  return (
    <div
      className={baseClass}
      style={{ justifyContent: justify }}
      role="toolbar"
      aria-label="Panel actions"
    >
      {actions.map(action => (
        <DataPanelAction key={action.id} {...action} />
      ))}
    </div>
  );
};

export default DataPanelFooter;
