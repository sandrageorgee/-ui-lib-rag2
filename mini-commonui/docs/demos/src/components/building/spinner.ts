const spinnerImports: string = `import { Spinner } from '@common-ui';`;
export default spinnerImports;

export const spinnerDefaultDemo: string = `() => {
  return (
    <div style={{ padding: 100 }}>
      <Spinner />
    </div>
  );
}`;

export const spinnerSizesDemo: string = `() => {
  return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <Spinner size="small" />
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>small</p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <Spinner size="medium" />
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>medium</p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <Spinner size="large" />
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>large</p>
      </div>
    </div>
  );
}`;

export const spinnerColorsDemo: string = `() => {
  return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 32 }}>
      <Spinner color="primary" label="Primary" />
      <Spinner color="secondary" label="Secondary" />
      <div style={{ color: '#9c27b0' }}>
        <Spinner color="inherit" label="Inherit" />
      </div>
    </div>
  );
}`;
