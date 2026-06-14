const chartsymbolImports: string = `import { ChartSymbol } from '@common-ui';`;
export default chartsymbolImports;

export const chartsymbolDefaultDemo: string = `() => (
  <div style={{ display: 'flex', gap: 16, padding: 40, alignItems: 'center' }}>
    <ChartSymbol symbolType="circle"    size={40} color="#3d9ccc" />
    <ChartSymbol symbolType="rect"      size={40} color="#e55c6c" />
    <ChartSymbol symbolType="triangle"  size={40} color="#4caf50" />
    <ChartSymbol symbolType="diamond"   size={40} color="#ff9800" />
    <ChartSymbol symbolType="roundRect" size={40} color="#9c27b0" />
    <ChartSymbol symbolType="arrow"     size={40} color="#00bcd4" />
    <ChartSymbol symbolType="pin"       size={40} color="#ff5722" />
  </div>
)`;

export const chartsymbolRotateDemo: string = `() => (
  <div style={{ display: 'flex', gap: 16, padding: 40, alignItems: 'center' }}>
    <ChartSymbol symbolType="arrow" size={40} color="#3d9ccc" rotate={0}   />
    <ChartSymbol symbolType="arrow" size={40} color="#3d9ccc" rotate={45}  />
    <ChartSymbol symbolType="arrow" size={40} color="#3d9ccc" rotate={90}  />
    <ChartSymbol symbolType="arrow" size={40} color="#3d9ccc" rotate={180} />
  </div>
)`;

export const chartsymbolSizesDemo: string = `() => (
  <div style={{ display: 'flex', gap: 16, padding: 40, alignItems: 'center' }}>
    <ChartSymbol symbolType="circle" size={16} color="#3d9ccc" />
    <ChartSymbol symbolType="circle" size={32} color="#3d9ccc" />
    <ChartSymbol symbolType="circle" size={48} color="#3d9ccc" />
    <ChartSymbol symbolType="circle" size={64} color="#3d9ccc" />
  </div>
)`;
