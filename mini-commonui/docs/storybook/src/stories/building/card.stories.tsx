import type { Meta, StoryObj } from '@storybook/react';
import { Card } from '@common-ui';
import { fn } from '@storybook/test';

const meta = {
  component: Card,
  title: 'Common UI/Building/Card',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    onClickHelperFunction: fn(),
    hasHelperIcon: false,
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <p style={{ margin: 0 }}>This is a basic card with some content inside.</p>,
  },
};

export const WithHelperIcon: Story = {
  name: 'With Helper Icon',
  args: {
    hasHelperIcon: true,
    helperIcon: '?',
    children: (
      <p style={{ margin: 0 }}>
        Hover over the bottom-right corner to see the helper icon.
      </p>
    ),
  },
};

export const CustomStyle: Story = {
  name: 'Custom Style',
  args: {
    style: { maxWidth: 320, minHeight: 120 },
    children: <p style={{ margin: 0 }}>Card with a constrained width and min-height.</p>,
  },
};
