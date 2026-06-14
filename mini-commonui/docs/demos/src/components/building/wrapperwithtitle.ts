const wrapperwithtitleImports: string = `import { WrapperWithTitle } from '@common-ui';`;
export default wrapperwithtitleImports;

export const wrapperwithtitleDefaultDemo: string = `() => (
  <WrapperWithTitle title="Section Title" className="my-section" id="section-1">
    <p>This content is wrapped inside a titled container.</p>
  </WrapperWithTitle>
)`;

export const wrapperwithtitleNestedDemo: string = `() => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
    <WrapperWithTitle title="User Info" className="user-section">
      <p>Name: John Doe</p>
      <p>Email: john@example.com</p>
    </WrapperWithTitle>
    <WrapperWithTitle title="Settings" className="settings-section">
      <p>Theme: Dark</p>
      <p>Language: English</p>
    </WrapperWithTitle>
  </div>
)`;

export const wrapperwithtitleCustomIdDemo: string = `() => (
  <WrapperWithTitle
    title="Custom ID Example"
    className="custom-wrapper"
    id="my-custom-wrapper"
  >
    <span>The root id is "my-custom-wrapper"</span>
    <span>The title id is "my-custom-wrapper__title"</span>
    <span>The body id is "my-custom-wrapper__Wrapper"</span>
  </WrapperWithTitle>
)`;
