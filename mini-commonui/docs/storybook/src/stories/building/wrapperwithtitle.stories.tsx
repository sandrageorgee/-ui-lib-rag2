import type { Meta, StoryObj } from '@storybook/react';
import { WrapperWithTitle } from '@common-ui';

const meta = {
  component: WrapperWithTitle,
  title: 'Common UI/Building/WrapperWithTitle',
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    title: 'Section Title',
    className: 'demo-wrapper',
    id: 'demo-wrapper',
    children: 'Content goes here.',
  },
} satisfies Meta<typeof WrapperWithTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCustomTitle: Story = {
  args: {
    title: 'User Profile',
    children: 'Name: Jane Doe',
  },
};

export const WithCustomId: Story = {
  args: {
    title: 'Custom ID',
    id: 'my-section',
    children: 'Root id is "my-section".',
  },
};

export const WithRichContent: Story = {
  args: {
    title: 'Details',
    children: (
      <ul>
        <li>Item one</li>
        <li>Item two</li>
        <li>Item three</li>
      </ul>
    ),
  },
};
