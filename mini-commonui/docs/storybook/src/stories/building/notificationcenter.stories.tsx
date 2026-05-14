/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/react';
import { useRef } from 'react';
import { NotificationCenter } from '@common-ui';
import type { INotificationCenterRef } from '@common-ui';

const meta = {
  component: NotificationCenter,
  title: 'Common UI/Building/NotificationCenter',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A fixed-position notification stack driven entirely by a **ref**. ' +
          'Consumers call `ref.current.push()`, `dismiss()`, or `dismissAll()` — ' +
          'no state management required in the parent.',
      },
    },
  },
  args: {
    position: 'top-right',
    maxVisible: 5,
  },
} satisfies Meta<typeof NotificationCenter>;

export default meta;
type Story = StoryObj<typeof meta>;

let _counter = 0;
const nextId = () => `notif-${++_counter}`;

/** Push notifications of every severity and let them auto-dismiss. */
export const Default: Story = {
  decorators: [
    (Story, ctx) => {
      const ncRef = useRef<INotificationCenterRef>(null);
      const severities = ['info', 'success', 'warning', 'error'] as const;

      return (
        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {severities.map(s => (
              <button
                key={s}
                onClick={() =>
                  ncRef.current?.push({
                    id: nextId(),
                    severity: s,
                    message: `This is a ${s} notification.`,
                    duration: 4000,
                  })
                }
              >
                Push {s}
              </button>
            ))}
            <button onClick={() => ncRef.current?.dismissAll()}>Dismiss all</button>
            <button onClick={() => alert(`Count: ${ncRef.current?.getCount()}`)}>
              Get count
            </button>
          </div>
          <Story args={{ ...ctx.args, ref: ncRef }} />
        </div>
      );
    },
  ],
};

/** Notifications with a title + message. */
export const WithTitles: Story = {
  name: 'With Titles',
  decorators: [
    (Story, ctx) => {
      const ncRef = useRef<INotificationCenterRef>(null);
      const samples = [
        { severity: 'success' as const, title: 'File saved', message: 'config.json was saved successfully.' },
        { severity: 'warning' as const, title: 'Low memory', message: 'Available heap is below 10%.' },
        { severity: 'error'   as const, title: 'Build failed', message: 'TypeScript compilation error on line 42.' },
      ];

      return (
        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {samples.map(s => (
              <button
                key={s.severity}
                onClick={() =>
                  ncRef.current?.push({ id: nextId(), ...s, duration: 0 })
                }
              >
                Push {s.severity}
              </button>
            ))}
            <button onClick={() => ncRef.current?.dismissAll()}>Clear all</button>
          </div>
          <Story args={{ ...ctx.args, ref: ncRef }} />
        </div>
      );
    },
  ],
};

/** Demonstrates the maxVisible cap — older notifications are dropped. */
export const MaxVisible: Story = {
  name: 'Max Visible (3)',
  args: { maxVisible: 3 },
  decorators: [
    (Story, ctx) => {
      const ncRef = useRef<INotificationCenterRef>(null);
      return (
        <div style={{ padding: 24 }}>
          <button
            onClick={() =>
              ncRef.current?.push({
                id: nextId(),
                severity: 'info',
                message: `Notification #${_counter + 1} — only 3 are shown at once.`,
                duration: 0,
              })
            }
          >
            Push notification
          </button>
          <Story args={{ ...ctx.args, ref: ncRef }} />
        </div>
      );
    },
  ],
};

/** NotificationCenter anchored to the bottom-left corner. */
export const BottomLeft: Story = {
  name: 'Position: Bottom Left',
  args: { position: 'bottom-left' },
  decorators: [
    (Story, ctx) => {
      const ncRef = useRef<INotificationCenterRef>(null);
      return (
        <div style={{ padding: 24, minHeight: 300 }}>
          <button
            onClick={() =>
              ncRef.current?.push({
                id: nextId(),
                severity: 'success',
                message: 'Anchored bottom-left.',
                duration: 3000,
              })
            }
          >
            Push
          </button>
          <Story args={{ ...ctx.args, ref: ncRef }} />
        </div>
      );
    },
  ],
};
