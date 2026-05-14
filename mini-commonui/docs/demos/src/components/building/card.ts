const cardImports: string = `import { Card } from '@common-ui';`;
export default cardImports;

export const cardDefaultDemo: string = `() => {
  return (
    <div style={{ padding: 40, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <Card>
        <h3 style={{ margin: '0 0 8px' }}>Basic Card</h3>
        <p style={{ margin: 0 }}>This is the default card with no extra props.</p>
      </Card>
    </div>
  );
}`;

export const cardWithHelperIconDemo: string = `() => {
  return (
    <div style={{ padding: 40, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <Card
        hasHelperIcon
        helperIcon="?"
        onClickHelperFunction={() => alert('Helper icon clicked!')}
        style={{ maxWidth: 320 }}
      >
        <h3 style={{ margin: '0 0 8px' }}>Card with Helper Icon</h3>
        <p style={{ margin: 0 }}>
          A small helper icon appears at the bottom-right corner of this card.
          Click it to trigger an action.
        </p>
      </Card>
    </div>
  );
}`;
