import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '@common-ui';

const meta = {
  component: Badge,
  title: 'Common UI/Building/Badge',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    children: <span style={{ fontSize: 28 }}>🔔</span>,
    count: 4,
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HighCount: Story = {
  name: 'Exceeds Max',
  args: { count: 120, max: 99 },
};

export const DotVariant: Story = {
  name: 'Dot Variant',
  args: { variant: 'dot', color: 'error' },
};

export const ShowZero: Story = {
  name: 'Show Zero',
  args: { count: 0, showZero: true },
};

export const SuccessColor: Story = {
  name: 'Success Color',
  args: { count: 3, color: 'success' },
};
