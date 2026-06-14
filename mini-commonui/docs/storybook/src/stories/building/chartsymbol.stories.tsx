import type { Meta, StoryObj } from '@storybook/react';
import { ChartSymbol } from '@common-ui';

const meta = {
  component: ChartSymbol,
  title: 'Common UI/Building/ChartSymbol',
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    size: 40,
    color: '#3d9ccc',
    rotate: 0,
  },
} satisfies Meta<typeof ChartSymbol>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Circle: Story = {
  args: { symbolType: 'circle' },
};

export const Rect: Story = {
  args: { symbolType: 'rect', color: '#e55c6c' },
};

export const Triangle: Story = {
  args: { symbolType: 'triangle', color: '#4caf50' },
};

export const Diamond: Story = {
  args: { symbolType: 'diamond', color: '#ff9800' },
};

export const Arrow: Story = {
  args: { symbolType: 'arrow', color: '#9c27b0', rotate: 45 },
};

export const Pin: Story = {
  args: { symbolType: 'pin', color: '#ff5722' },
};
