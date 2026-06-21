# Component Authoring Guide — Parser Compatibility

This guide documents the exact rules a component file must follow for the parser
pipeline to produce a valid schema. Every rule here was derived from real failures
observed during development.

---

## Quick checklist

- [ ] Component uses `React.FC<IMyProps>` as its type annotation
- [ ] The props parameter has an **explicit type annotation**: `(props: IMyProps)`
- [ ] The interface name starts with `I[A-Z]` **or** contains `Props`
- [ ] Every prop has a JSDoc comment (`/** … */`)
- [ ] External types (`React.CSSProperties`, `ReactNode`, etc.) are used as-is — do not expand them
- [ ] If the component uses `forwardRef`, add type anchor aliases in the `.tsx` file
- [ ] Return type uses `React.ReactElement`, not `JSX.Element`

---

## 1. File structure

Each component lives in its own folder. The folder name is the component name in
lowercase. There are exactly three source files:

```
components/
└── mycomponent/
    ├── mycomponent.tsx       ← component implementation
    ├── imycomponent.ts       ← interface / prop types
    └── mycomponent.css       ← styles (optional but conventional)
```

Demos and storybook stories live outside the component folder:

```
docs/
├── demos/src/components/building/mycomponent.ts
└── storybook/src/stories/building/mycomponent.stories.tsx
```

---

## 2. Component file (`.tsx`)

### Rule 1 — Always type the props parameter explicitly

The schema generator uses the props parameter type to discover which interface to
document. If the parameter has no type annotation the generator crashes.

```tsx
// ✅ CORRECT — props parameter is typed
const MyComponent: React.FC<IMyProps> = (props: IMyProps): React.ReactElement => {
  const { label, disabled } = props;
  ...
};

// ✅ CORRECT — destructured parameter, still explicitly typed
const MyComponent: React.FC<IMyProps> = ({ label, disabled }: IMyProps): React.ReactElement => {
  ...
};

// ❌ WRONG — bare (props) with no type causes a crash
const MyComponent: React.FC<IMyProps> = (props) => {
  ...
};
```

### Rule 2 — Use `React.ReactElement` as the return type, not `JSX.Element`

`JSX.Element` may not be in scope depending on the tsconfig. `React.ReactElement`
always works.

```tsx
// ✅ CORRECT
const Alert: React.FC<IAlertProps> = (props: IAlertProps): React.ReactElement => (
  <div>...</div>
);

// ❌ WRONG — JSX namespace may not be resolved
const Alert: React.FC<IAlertProps> = (props: IAlertProps): JSX.Element => (
  <div>...</div>
);
```

### Rule 3 — `forwardRef` components need type anchor aliases

The schema generator discovers interfaces through the props parameter type. When
a component uses `forwardRef`, the parameter is inside the callback and the generator
cannot reach the interface. Add type alias anchors near the top of the file:

```tsx
// ❌ PROBLEM — generator never finds INotificationCenterProps
const NotificationCenter = forwardRef<INotificationCenterRef, INotificationCenterProps>(
  (props, ref) => { ... }
);

// ✅ FIX — add type anchors so the generator tracks the interfaces.
// Names must NOT match the stage6 filter (no "Props", no ^I[A-Z])
// so only the real interfaces appear in the output.
type _p = INotificationCenterProps;
type _r = INotificationCenterRef;
type _n = INotification;

const NotificationCenter = forwardRef<INotificationCenterRef, INotificationCenterProps>(
  (props, ref) => { ... }
);
```

---

## 3. Interface file (`.ts`)

### Rule 4 — Interface names must match the parser filter

The schema generator only outputs types whose name either:
- Starts with `I` followed by an uppercase letter: `IAlertProps`, `ICard`, `INotification`
- Contains the word `Props`: `ToggleButtonProps`, `ButtonProps`

```ts
// ✅ Passes the filter
export interface IAlertProps { ... }
export interface ToggleButtonProps { ... }
export interface ICard { ... }

// ❌ Filtered out — will not appear in the schema
export interface alertProps { ... }
export interface MyComponentConfig { ... }
```

### Rule 5 — Every prop must have a JSDoc comment

The schema generator extracts descriptions from JSDoc. Undocumented props will
appear in the schema with no description.

```ts
// ✅ CORRECT
export interface IAlertProps {
  /**
   * The severity of the alert, which controls its colour and default icon.
   * @default "info"
   */
  severity?: 'info' | 'success' | 'warning' | 'error';

  /**
   * The main message text displayed inside the alert.
   */
  message: string;
}

// ❌ Missing descriptions
export interface IAlertProps {
  severity?: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
```

### Rule 6 — Use `@default` and `@deprecated` JSDoc tags

```ts
export interface IButtonProps {
  /**
   * Visual style variant of the button.
   * @default "primary"
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';

  /**
   * @deprecated Use className instead.
   * Legacy inline style override.
   */
  sx?: React.CSSProperties;
}
```

### Rule 7 — External types are safe to use as-is

The parser stubs external types (anything from `node_modules`) and preserves their
names in the schema as `{"tsType": "React.CSSProperties"}`. You do not need to
expand or replace them.

```ts
// ✅ CORRECT — use external types directly
export interface ICardProps {
  style?:    React.CSSProperties;   // → { tsType: "React.CSSProperties" }
  icon?:     React.ReactNode;       // → { tsType: "ReactNode" }
  children?: React.ReactNode;
}

// ❌ UNNECESSARY — do not manually unwrap external types
export interface ICardProps {
  style?: {
    color?: string;
    margin?: string;
    // ... hundreds of CSS properties
  };
}
```

### Rule 8 — Function types in interfaces work correctly

```ts
// ✅ All of these parse correctly
export interface IAlertProps {
  onClose?:  () => void;
  onChange?: (value: boolean) => void;
  formatter?: (value: number | string) => string;
}
```

### Rule 9 — Cross-folder imports (`../`) work but require care

The parser resolves cross-folder type references correctly. However, if an interface
**extends** a type from a parent folder (`../`), the generator may crash unless the
extend target is a simple interface (not a deeply generic type).

```ts
// ✅ SAFE — extending a local interface in the same folder
export interface IBarChartProps extends IChartProps { ... }
// where IChartProps is in ./icharts.ts (same folder)

// ✅ SAFE — extending a cross-folder interface that is a plain object type
// (the parser's import-walking stub handles this)

// ⚠️ RISKY — extending a generic from node_modules
// React.ButtonHTMLAttributes<HTMLButtonElement> is handled by the stub,
// but only because it contains a dot (stubbed automatically).
export interface IButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { ... }
```

---

## 4. Complete working example

### `components/badge/ibadge.ts`

```ts
export type BadgeVariant = 'standard' | 'dot';
export type BadgeColor   = 'primary' | 'success' | 'warning' | 'error';

/**
 * Props for the Badge component.
 * Displays a small numerical or dot indicator on top of another element.
 */
export interface IBadgeProps {
  /**
   * The number to display inside the badge.
   */
  count?: number;

  /**
   * Visual style of the badge.
   * @default "standard"
   */
  variant?: BadgeVariant;

  /**
   * Colour preset for the badge.
   * @default "primary"
   */
  color?: BadgeColor;

  /**
   * Maximum count to display. When count exceeds this, "${max}+" is shown.
   * @default 99
   */
  max?: number;

  /**
   * When true, hides the badge even when count > 0.
   * @default false
   */
  invisible?: boolean;

  /**
   * When true, shows the badge even when count is 0.
   * @default false
   */
  showZero?: boolean;

  /**
   * Content the badge is anchored to.
   */
  children?: React.ReactNode;

  /**
   * Additional CSS class names applied to the root element.
   */
  className?: string;
}
```

### `components/badge/badge.tsx`

```tsx
import React from 'react';
import { IBadgeProps } from './ibadge';
import './badge.css';

const Badge: React.FC<IBadgeProps> = (props: IBadgeProps): React.ReactElement => {
  const {
    count, variant = 'standard', color = 'primary',
    max = 99, invisible = false, showZero = false,
    children, className = '',
  } = props;

  const displayCount = count !== undefined && count > max ? `${max}+` : count;
  const hidden = invisible || (!showZero && count === 0);

  return (
    <span className={`Cui-Badge__root ${className}`}>
      {children}
      {!hidden && variant !== 'dot' && (
        <span className={`Cui-Badge Cui-Badge--${color}`}>{displayCount}</span>
      )}
      {!hidden && variant === 'dot' && (
        <span className={`Cui-Badge Cui-Badge--dot Cui-Badge--${color}`} />
      )}
    </span>
  );
};

export default Badge;
```

---

## 5. Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `UnhandledError: Cannot read properties of undefined (reading '0')` at `FunctionNodeParser` | Props parameter has no type annotation: `(props) =>` | Add `: IMyProps` → `(props: IMyProps) =>` |
| Schema file is `[]` (empty) | Interface not reachable — `React.FC<IMyProps>` is stubbed and parameter also untyped | Ensure parameter has explicit type annotation |
| Schema file is `[]` for a `forwardRef` component | Generator can't reach the interface through the `forwardRef<Ref, Props>` call | Add type anchors: `type _p = IMyProps;` |
| Interface not in schema output | Interface name doesn't match filter | Use `IXxx` (capital I + uppercase) or include `Props` in the name |
| `UnhandledError` at `ExpressionWithTypeArgumentsNodeParser` | `extends SomeType` where `SomeType` comes from `../folder` and can't be resolved | Move shared types to the same folder, or ensure the parent folder's import is handled |
| Schema shows `{ tsType: "React.FC<IMyProps>" }` instead of expanding | Expected — external types are intentionally stubbed to avoid node_modules traversal | No action needed; `tsType` is used by the RAG text writer |
