import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@common-ui';
import { fn } from '@storybook/test';

const meta = {
  component: Button,
  title: 'Common UI/Building/Button',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    label: 'Primary Button',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    label: 'Secondary Button',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    label: 'Ghost Button',
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    label: 'Danger Button',
  },
};

export const Loading: Story = {
  args: {
    variant: 'primary',
    label: 'Loading...',
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    variant: 'primary',
    label: 'Disabled',
    disabled: true,
  },
};
