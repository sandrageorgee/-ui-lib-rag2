const alertsImports: string = `import { Alert } from '@common-ui';`;
export default alertsImports;

export const alertsDefaultDemo: string = `() => {
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert id="info-alert" severity="info" message="This is an informational alert." />
      <Alert id="success-alert" severity="success" message="Your changes were saved successfully." />
      <Alert id="warning-alert" severity="warning" message="Disk usage is above 80%." />
      <Alert id="error-alert" severity="error" message="Connection to the server was lost." />
    </div>
  );
}`;

export const alertsWithTitleDemo: string = `() => {
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert
        id="warning-titled"
        severity="warning"
        title="Low disk space"
        message="Your storage is almost full. Consider removing unused files."
      />
      <Alert
        id="error-titled"
        severity="error"
        title="Authentication failed"
        message="Invalid credentials. Please check your username and password."
      />
    </div>
  );
}`;

export const alertsCloseableDemo: string = `() => {
  const [alerts, setAlerts] = useState([
    { id: 'a1', severity: 'info',    message: 'Click × to dismiss this alert.' },
    { id: 'a2', severity: 'success', message: 'Operation completed. Dismiss when ready.' },
  ]);

  const handleClose = (id) => setAlerts(prev => prev.filter(a => a.id !== id));

  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {alerts.map(a => (
        <Alert
          key={a.id}
          id={a.id}
          severity={a.severity}
          message={a.message}
          closeable
          onClose={() => handleClose(a.id)}
        />
      ))}
      {alerts.length === 0 && <p>All alerts dismissed.</p>}
    </div>
  );
}`;
