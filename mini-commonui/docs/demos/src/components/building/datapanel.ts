const datapanelImports: string = `import { DataPanel } from '@common-ui';`;
export default datapanelImports;

export const datapanelDefaultDemo: string = `() => {
  return (
    <div style={{ padding: 40, width: 520 }}>
      <DataPanel id="info-panel" title="Device Information" subtitle="Read-only summary">
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
          <dt>Model</dt>         <dd>SIMATIC S7-1500</dd>
          <dt>Firmware</dt>      <dd>v3.1.2</dd>
          <dt>IP Address</dt>    <dd>192.168.0.10</dd>
          <dt>Status</dt>        <dd style={{ color: '#388e3c' }}>Online</dd>
        </dl>
      </DataPanel>
    </div>
  );
}`;

export const datapanelWithActionsDemo: string = `() => {
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ padding: 40, width: 520 }}>
      <DataPanel
        id="edit-panel"
        title="Network Configuration"
        subtitle="Editable settings"
        actions={[
          { id: 'cancel', label: 'Cancel',  variant: 'ghost',     onClick: () => setSaved(false) },
          { id: 'save',   label: 'Save',    variant: 'primary',   onClick: () => setSaved(true)  },
        ]}
        footerJustify="flex-end"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            IP Address
            <input defaultValue="192.168.0.10" style={{ display: 'block', marginTop: 4, width: '100%' }} />
          </label>
          <label>
            Subnet Mask
            <input defaultValue="255.255.255.0" style={{ display: 'block', marginTop: 4, width: '100%' }} />
          </label>
        </div>
        {saved && <p style={{ color: '#388e3c', margin: '12px 0 0' }}>✓ Settings saved.</p>}
      </DataPanel>
    </div>
  );
}`;

export const datapanelLoadingDemo: string = `() => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setData({ cpu: '12%', memory: '3.2 GB', uptime: '14 days' });
      setLoading(false);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ padding: 40, width: 520 }}>
      <DataPanel id="loading-panel" title="System Metrics" subtitle="Live data" loading={loading}>
        {data && (
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            <dt>CPU Usage</dt>    <dd>{data.cpu}</dd>
            <dt>Memory</dt>       <dd>{data.memory}</dd>
            <dt>Uptime</dt>       <dd>{data.uptime}</dd>
          </dl>
        )}
      </DataPanel>
    </div>
  );
}`;

export const datapanelCollapsibleDemo: string = `() => {
  return (
    <div style={{ padding: 40, width: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DataPanel
        id="collapsible-panel-1"
        title="Section A"
        subtitle="Click ▼ to collapse"
        collapsible
      >
        <p style={{ margin: 0 }}>Content for section A. This panel can be collapsed by the user.</p>
      </DataPanel>
      <DataPanel
        id="collapsible-panel-2"
        title="Section B"
        subtitle="Starts collapsed"
        collapsible
        defaultCollapsed
      >
        <p style={{ margin: 0 }}>Content for section B — only visible when expanded.</p>
      </DataPanel>
    </div>
  );
}`;

export const datapanelEmptyStateDemo: string = `() => {
  return (
    <div style={{ padding: 40, width: 520 }}>
      <DataPanel
        id="empty-panel"
        title="Recent Events"
        subtitle="No data"
        emptyMessage="No events recorded in the selected time range."
      />
    </div>
  );
}`;
