const buttonImports: string = `import { Button } from '@common-ui';`;
export default buttonImports;

export const buttonDefaultDemo: string = `() => (
  <div style={{ display: 'flex', gap: 12, padding: 40 }}>
    <Button label="Primary" variant="primary" />
    <Button label="Secondary" variant="secondary" />
    <Button label="Ghost" variant="ghost" />
    <Button label="Danger" variant="danger" />
  </div>
)`;

export const buttonSizesDemo: string = `() => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 40 }}>
    <Button label="Small" size="sm" />
    <Button label="Medium" size="md" />
    <Button label="Large" size="lg" />
  </div>
)`;

export const buttonLoadingDemo: string = `() => {
  const [loading, setLoading] = React.useState(false);

  const handleClick = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div style={{ padding: 40 }}>
      <Button
        label={loading ? 'Saving...' : 'Save'}
        loading={loading}
        onClick={handleClick}
      />
    </div>
  );
}`;

export const buttonDisabledDemo: string = `() => (
  <div style={{ display: 'flex', gap: 12, padding: 40 }}>
    <Button label="Disabled Primary" variant="primary" disabled />
    <Button label="Disabled Secondary" variant="secondary" disabled />
  </div>
)`;
