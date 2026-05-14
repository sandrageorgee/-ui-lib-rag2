import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from '@common-ui';

const meta = {
  component: Tooltip,
  title: 'Common UI/Building/Tooltip',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    content: 'This is a helpful tooltip.',
    children: <button type="button">Hover me</button>,
    placement: 'top',
    enterDelay: 300,
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PlacementBottom: Story = {
  name: 'Placement: Bottom',
  args: { placement: 'bottom' },
};

export const PlacementRight: Story = {
  name: 'Placement: Right',
  args: { placement: 'right' },
};

export const NoArrow: Story = {
  name: 'No Arrow',
  args: { arrow: false },
};

export const Disabled: Story = {
  name: 'Disabled Tooltip',
  args: { disabled: true },
};

export const RichContent: Story = {
  name: 'Rich Content',
  args: {
    content: (
      <span>
        <strong>Pro tip:</strong> Use keyboard shortcuts for faster navigation.
      </span>
    ),
    enterDelay: 100,
  },
};
