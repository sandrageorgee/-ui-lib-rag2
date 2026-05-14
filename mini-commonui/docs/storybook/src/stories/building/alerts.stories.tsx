import type { Meta, StoryObj } from '@storybook/react';
import { Alert } from '@common-ui';
import { fn } from '@storybook/test';

const meta = {
  component: Alert,
  title: 'Common UI/Building/Alert',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    id: 'demo-alert',
    message: 'This is an informational alert message.',
    onClose: fn(),
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: { severity: 'info' },
};

export const Success: Story = {
  args: {
    severity: 'success',
    message: 'The operation completed successfully.',
  },
};

export const Warning: Story = {
  args: {
    severity: 'warning',
    title: 'Low disk space',
    message: 'Your storage is almost full. Consider removing unused files.',
  },
};

export const Error: Story = {
  args: {
    severity: 'error',
    title: 'Connection failed',
    message: 'Could not reach the server. Please check your network settings.',
  },
};

export const Closeable: Story = {
  name: 'Closeable',
  args: {
    severity: 'info',
    closeable: true,
    title: 'Dismissable alert',
    message: 'Click the ✕ button to dismiss this alert.',
  },
};
