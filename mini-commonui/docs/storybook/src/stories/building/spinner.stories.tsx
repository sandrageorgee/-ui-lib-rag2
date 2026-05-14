import type { Meta, StoryObj } from '@storybook/react';
import { Spinner } from '@common-ui';

const meta = {
  component: Spinner,
  title: 'Common UI/Building/Spinner',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: 'small' },
};

export const Large: Story = {
  args: { size: 'large' },
};

export const Secondary: Story = {
  args: { color: 'secondary', size: 'medium' },
};

export const Inherit: Story = {
  name: 'Inherit Color',
  decorators: [
    (Story) => (
      <div style={{ color: '#9c27b0' }}>
        <Story />
      </div>
    ),
  ],
  args: { color: 'inherit' },
};
