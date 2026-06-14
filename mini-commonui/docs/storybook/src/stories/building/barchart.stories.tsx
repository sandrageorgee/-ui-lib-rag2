import type { Meta, StoryObj } from '@storybook/react';
import { BarChart } from '@common-ui';

const sampleData = [
  { label: 'Jan', yValue: 120 },
  { label: 'Feb', yValue: 85 },
  { label: 'Mar', yValue: 200 },
  { label: 'Apr', yValue: 150 },
  { label: 'May', yValue: 170 },
];

const meta = {
  component: BarChart,
  title: 'Common UI/Building/BarChart',
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    id: 'demo-barchart',
    data: sampleData,
    showToolTip: true,
    showAnimation: true,
  },
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Monthly Sales',
    yAxisProps: { label: 'Units', showGuidelines: true },
    xAxisProps: { label: 'Month' },
  },
};

export const WithThreshold: Story = {
  args: {
    title: 'With Threshold Line',
    thresholdProps: {
      threshold: 130,
      aboveThresholdColor: 'rgba(255, 38, 64, 1)',
      thresholdLineColor: '#E55C6C',
    },
    yAxisProps: { showGuidelines: true },
  },
};

export const WithZoom: Story = {
  args: {
    title: 'Zoomable Chart',
    allowZoom: true,
    zoomProps: { disableYaxisZoom: true, start: 0, end: 80 },
  },
};

export const WithLegend: Story = {
  args: {
    title: 'Chart With Legend',
    legend: { position: 'top', orientation: 'horizontal' },
    yAxisProps: { showGuidelines: true },
  },
};

export const CustomBarWidth: Story = {
  args: {
    title: 'Custom Bar Width',
    barProps: { width: '40%', showBarAboveGuidelines: true },
    yAxisProps: { showGuidelines: true },
  },
};
