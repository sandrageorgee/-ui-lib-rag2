const togglebuttonImports: string = `import { ToggleButton } from '@common-ui';`;
export default togglebuttonImports;

export const togglebuttonDefaultDemo: string = `() => {
  const [on, setOn] = React.useState(false);
  return (
    <div style={{ padding: 40 }}>
      <ToggleButton
        id="demo-toggle"
        value={on}
        label="Enable notifications"
        onChange={setOn}
      />
      <p style={{ marginTop: 12 }}>State: {on ? 'ON' : 'OFF'}</p>
    </div>
  );
}`;

export const togglebuttonLabelPlacementDemo: string = `() => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 40 }}>
    <ToggleButton value={true}  label="Label on the end (default)" labelPlacement="end" />
    <ToggleButton value={false} label="Label on the start"         labelPlacement="start" />
  </div>
)`;

export const togglebuttonDisabledDemo: string = `() => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 40 }}>
    <ToggleButton value={true}  label="Disabled ON"  disabled />
    <ToggleButton value={false} label="Disabled OFF" disabled />
  </div>
)`;

export const togglebuttonNoLabelDemo: string = `() => {
  const [on, setOn] = React.useState(false);
  return (
    <div style={{ padding: 40 }}>
      <ToggleButton value={on} showLabel={false} onChange={setOn} />
    </div>
  );
}`;
