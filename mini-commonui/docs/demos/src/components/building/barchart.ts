const barchartImports: string = `import { BarChart } from '@common-ui';`;
export default barchartImports;

export const barchartDefaultDemo: string = `() => {
  const data = [
    { label: 'Jan', yValue: 120 },
    { label: 'Feb', yValue: 85 },
    { label: 'Mar', yValue: 200 },
    { label: 'Apr', yValue: 150 },
    { label: 'May', yValue: 170 },
  ];
  return (
    <div style={{ width: 600, height: 300, padding: 20 }}>
      <BarChart
        id="default-bar"
        data={data}
        title="Monthly Sales"
        showToolTip
        showAnimation
        yAxisProps={{ label: 'Units', showGuidelines: true }}
        xAxisProps={{ label: 'Month' }}
      />
    </div>
  );
}`;

export const barchartThresholdDemo: string = `() => {
  const data = [
    { label: 'Q1', yValue: 80 },
    { label: 'Q2', yValue: 160 },
    { label: 'Q3', yValue: 130 },
    { label: 'Q4', yValue: 95 },
  ];
  return (
    <div style={{ width: 600, height: 300, padding: 20 }}>
      <BarChart
        id="threshold-bar"
        data={data}
        title="Quarterly Revenue"
        showToolTip
        thresholdProps={{
          threshold: 120,
          aboveThresholdColor: 'rgba(255, 38, 64, 1)',
          thresholdLineColor: '#E55C6C',
          formatter: 'Target: {value}',
        }}
        yAxisProps={{ label: 'Revenue ($K)', showGuidelines: true }}
      />
    </div>
  );
}`;

export const barchartZoomDemo: string = `() => {
  const data = Array.from({ length: 20 }, (_, i) => ({
    label: \`W\${i + 1}\`,
    yValue: Math.floor(Math.random() * 200) + 50,
  }));
  return (
    <div style={{ width: 600, height: 300, padding: 20 }}>
      <BarChart
        id="zoom-bar"
        data={data}
        title="Weekly Data (Scroll to Zoom)"
        showToolTip
        allowZoom
        zoomProps={{ disableYaxisZoom: true, start: 0, end: 50 }}
        yAxisProps={{ showGuidelines: true }}
      />
    </div>
  );
}`;

export const barchartAnnotationsDemo: string = `() => {
  const data = [
    { label: 'Mon', yValue: 45,  annotation: '+5%' },
    { label: 'Tue', yValue: 90,  annotation: '+12%' },
    { label: 'Wed', yValue: 60,  annotation: '-8%' },
    { label: 'Thu', yValue: 110, annotation: '+22%' },
    { label: 'Fri', yValue: 75,  annotation: '+3%' },
  ];
  return (
    <div style={{ width: 600, height: 300, padding: 20 }}>
      <BarChart
        id="annotations-bar"
        data={data}
        title="Daily Performance"
        showToolTip
        showAnimation
        yAxisProps={{ label: 'Score', showGuidelines: true }}
      />
    </div>
  );
}`;
