import type { Meta, StoryObj } from '@storybook/react';
import { ToggleButton } from '@common-ui';
import { fn } from '@storybook/test';

const meta = {
  component: ToggleButton,
  title: 'Common UI/Building/ToggleButton',
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    id: 'demo-toggle',
    label: 'Toggle label',
    value: false,
    showLabel: true,
    disabled: false,
    labelPlacement: 'end',
    onChange: fn(),
  },
} satisfies Meta<typeof ToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CheckedOn: Story = {
  args: { value: true, label: 'Enabled' },
};

export const LabelStart: Story = {
  args: { labelPlacement: 'start', label: 'Label before toggle' },
};

export const Disabled: Story = {
  args: { disabled: true, label: 'Cannot toggle' },
};

export const NoLabel: Story = {
  args: { showLabel: false },
};
