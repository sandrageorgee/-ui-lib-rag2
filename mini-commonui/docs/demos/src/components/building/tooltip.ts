const tooltipImports: string = `import { Tooltip } from '@common-ui';`;
export default tooltipImports;

export const tooltipDefaultDemo: string = `() => {
  return (
    <div style={{ padding: 80, display: 'flex', gap: 32 }}>
      <Tooltip content="Save your changes" placement="top">
        <button>Save</button>
      </Tooltip>
      <Tooltip content="Discard all changes" placement="bottom">
        <button>Cancel</button>
      </Tooltip>
    </div>
  );
}`;

export const tooltipPlacementsDemo: string = `() => {
  const placements = ['top', 'bottom', 'left', 'right'];
  return (
    <div style={{ padding: 80, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 40, width: 320 }}>
      {placements.map(p => (
        <Tooltip key={p} content={\`Placement: \${p}\`} placement={p}>
          <button style={{ width: '100%' }}>{p}</button>
        </Tooltip>
      ))}
    </div>
  );
}`;

export const tooltipDelayDemo: string = `() => {
  return (
    <div style={{ padding: 80, display: 'flex', gap: 32 }}>
      <Tooltip content="Appears immediately" placement="top" enterDelay={0}>
        <button>No delay</button>
      </Tooltip>
      <Tooltip content="Appears after 800 ms" placement="top" enterDelay={800}>
        <button>Long delay</button>
      </Tooltip>
      <Tooltip content="This tooltip is disabled" placement="top" disabled>
        <button>Disabled</button>
      </Tooltip>
    </div>
  );
}`;
