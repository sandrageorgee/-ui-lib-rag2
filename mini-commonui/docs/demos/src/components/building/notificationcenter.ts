const notificationCenterImports: string = `import { NotificationCenter } from '@common-ui';
import type { INotificationCenterRef } from '@common-ui';`;
export default notificationCenterImports;

export const notificationCenterDefaultDemo: string = `() => {
  const ncRef = useRef(null);

  return (
    <div style={{ padding: 40 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => ncRef.current?.push({ id: Date.now().toString(), severity: 'info',    message: 'Info notification.',    duration: 4000 })}>Info</button>
        <button onClick={() => ncRef.current?.push({ id: Date.now().toString(), severity: 'success', message: 'Success notification.', duration: 4000 })}>Success</button>
        <button onClick={() => ncRef.current?.push({ id: Date.now().toString(), severity: 'warning', message: 'Warning notification.', duration: 4000 })}>Warning</button>
        <button onClick={() => ncRef.current?.push({ id: Date.now().toString(), severity: 'error',   message: 'Error notification.',   duration: 4000 })}>Error</button>
        <button onClick={() => ncRef.current?.dismissAll()}>Dismiss all</button>
      </div>
      <NotificationCenter ref={ncRef} position="top-right" />
    </div>
  );
}`;

export const notificationCenterPersistentDemo: string = `() => {
  const ncRef = useRef(null);
  let counter = 0;

  const push = (severity, title, message) => {
    ncRef.current?.push({ id: \`n-\${++counter}\`, severity, title, message, duration: 0 });
  };

  return (
    <div style={{ padding: 40 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => push('success', 'File saved',   'config.json was saved successfully.')}>Save success</button>
        <button onClick={() => push('warning', 'Low memory',   'Available heap is below 10%.')}>Memory warning</button>
        <button onClick={() => push('error',   'Build failed', 'TypeScript compilation error on line 42.')}>Build error</button>
        <button onClick={() => ncRef.current?.dismissAll()} style={{ marginLeft: 16 }}>Clear all</button>
        <button onClick={() => alert('Count: ' + ncRef.current?.getCount())}>Get count</button>
      </div>
      <NotificationCenter ref={ncRef} position="top-right" maxVisible={3} />
    </div>
  );
}`;

export const notificationCenterImperativeDismissDemo: string = `() => {
  const ncRef = useRef(null);
  const savedIdRef = useRef(null);

  const startSave = () => {
    const id = 'save-progress';
    savedIdRef.current = id;
    ncRef.current?.push({ id, severity: 'info', title: 'Saving…', message: 'Your changes are being saved.' });

    setTimeout(() => {
      ncRef.current?.dismiss(id);
      ncRef.current?.push({ id: 'save-done', severity: 'success', message: 'Changes saved successfully!', duration: 3000 });
    }, 2000);
  };

  return (
    <div style={{ padding: 40 }}>
      <button onClick={startSave}>Save changes</button>
      <NotificationCenter ref={ncRef} position="top-right" />
    </div>
  );
}`;
