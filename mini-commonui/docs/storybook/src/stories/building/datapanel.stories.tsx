/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DataPanel } from '@common-ui';
import { fn } from '@storybook/test';

const meta = {
  component: DataPanel,
  title: 'Common UI/Building/DataPanel',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    id: 'demo-panel',
    title: 'Device Information',
    onClose: fn(),
  },
} satisfies Meta<typeof DataPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Basic panel — title bar + body content, no footer. */
export const Default: Story = {
  args: {
    subtitle: 'Read-only summary',
    children: (
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <dt>Model</dt>         <dd>SIMATIC S7-1500</dd>
        <dt>Firmware</dt>      <dd>v3.1.2</dd>
        <dt>IP Address</dt>    <dd>192.168.0.10</dd>
        <dt>Status</dt>        <dd style={{ color: '#388e3c' }}>Online</dd>
      </dl>
    ),
  },
};

/** Panel with primary + secondary footer actions. */
export const WithFooterActions: Story = {
  name: 'With Footer Actions',
  args: {
    subtitle: 'Editable configuration',
    children: (
      <p style={{ margin: 0 }}>
        Make your changes to the device configuration below, then click Save to apply.
      </p>
    ),
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'ghost' },
      { id: 'reset',  label: 'Reset',  variant: 'secondary' },
      { id: 'save',   label: 'Save',   variant: 'primary' },
    ],
    footerJustify: 'flex-end',
  },
};

/** Panel in loading state — body replaced with a spinner. */
export const Loading: Story = {
  args: {
    subtitle: 'Fetching data…',
    loading: true,
    children: null,
  },
};

/** Panel with empty-state message when no data is available. */
export const EmptyState: Story = {
  name: 'Empty State',
  args: {
    subtitle: 'No records found',
    emptyMessage: 'There are no items to display for the selected filter.',
    children: null,
  },
};

/** Collapsible panel — user can toggle the body open/closed. */
export const Collapsible: Story = {
  name: 'Collapsible (interactive)',
  decorators: [
    (Story) => {
      const [key, setKey] = useState(0);
      return (
        <div style={{ width: 480 }}>
          <Story key={key} />
          <button
            style={{ marginTop: 12, fontSize: 12 }}
            onClick={() => setKey(k => k + 1)}
          >
            Reset
          </button>
        </div>
      );
    },
  ],
  args: {
    collapsible: true,
    defaultCollapsed: false,
    children: (
      <p style={{ margin: 0 }}>
        Click the ▼ button in the header to collapse this panel. Click ▶ to expand it again.
      </p>
    ),
    actions: [
      { id: 'apply', label: 'Apply', variant: 'primary' },
    ],
  },
};

/** Panel with close button — simulates a dismissable side panel. */
export const WithCloseButton: Story = {
  name: 'With Close Button',
  decorators: [
    (Story) => {
      const [visible, setVisible] = useState(true);
      return (
        <div style={{ width: 480 }}>
          {!visible && (
            <button onClick={() => setVisible(true)}>Show Panel</button>
          )}
          <Story args={{ show: visible, onClose: () => setVisible(false) }} />
        </div>
      );
    },
  ],
  args: {
    subtitle: 'Click ✕ to dismiss',
    children: <p style={{ margin: 0 }}>This panel can be closed by clicking the × button in the header.</p>,
  },
};
