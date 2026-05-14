const badgeImports: string = `import { Badge } from '@common-ui';`;
export default badgeImports;

export const badgeDefaultDemo: string = `() => {
  return (
    <div style={{ padding: 40, display: 'flex', gap: 32, alignItems: 'center' }}>
      <Badge count={4}>
        <span style={{ fontSize: 28 }}>🔔</span>
      </Badge>
      <Badge count={0} showZero>
        <span style={{ fontSize: 28 }}>📧</span>
      </Badge>
      <Badge count={120} max={99}>
        <span style={{ fontSize: 28 }}>💬</span>
      </Badge>
    </div>
  );
}`;

export const badgeDotVariantDemo: string = `() => {
  return (
    <div style={{ padding: 40, display: 'flex', gap: 32, alignItems: 'center' }}>
      <Badge variant="dot" color="error">
        <span style={{ fontSize: 28 }}>🔔</span>
      </Badge>
      <Badge variant="dot" color="success">
        <span style={{ fontSize: 28 }}>📧</span>
      </Badge>
      <Badge variant="dot" color="primary">
        <span style={{ fontSize: 28 }}>💬</span>
      </Badge>
    </div>
  );
}`;

export const badgeColorsDemo: string = `() => {
  const colors = ['primary', 'secondary', 'error', 'warning', 'success', 'info'];
  return (
    <div style={{ padding: 40, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
      {colors.map(color => (
        <div key={color} style={{ textAlign: 'center' }}>
          <Badge count={3} color={color}>
            <span style={{ fontSize: 28 }}>★</span>
          </Badge>
          <p style={{ margin: '8px 0 0', fontSize: 12 }}>{color}</p>
        </div>
      ))}
    </div>
  );
}`;
