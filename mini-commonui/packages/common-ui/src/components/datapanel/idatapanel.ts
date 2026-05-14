import { ReactNode } from "react";

/**
 * Props for an individual action button rendered in the DataPanel footer.
 */
export interface IDataPanelActionProps {
  /**
   * Unique identifier for the action button.
   */
  id: string;

  /**
   * Label text displayed inside the button.
   */
  label: string;

  /**
   * Visual variant of the button.
   * @default "secondary"
   */
  variant?: "primary" | "secondary" | "ghost";

  /**
   * When true the button cannot be interacted with.
   * @default false
   */
  disabled?: boolean;

  /**
   * Icon displayed before the label.
   */
  startIcon?: ReactNode;

  /**
   * Icon displayed after the label.
   */
  endIcon?: ReactNode;

  /**
   * Callback fired when the button is clicked.
   */
  onClick?: () => void;
}

/**
 * Props for the DataPanelHeader sub-component.
 */
export interface IDataPanelHeaderProps {
  /**
   * Identifier of the header element.
   */
  id: string;

  /**
   * Primary title text rendered in the header bar.
   */
  title: string;

  /**
   * Optional subtitle rendered below the title.
   */
  subtitle?: string;

  /**
   * Icon node rendered to the left of the title.
   */
  icon?: ReactNode;

  /**
   * When true a collapse/expand toggle button is shown.
   */
  collapsible?: boolean;

  /**
   * Current collapsed state passed down from the parent DataPanel.
   */
  collapsed?: boolean;

  /**
   * Callback fired when the collapse toggle is clicked.
   */
  onToggleCollapse?: () => void;

  /**
   * Callback fired when the close button is clicked.
   * If omitted, no close button is rendered.
   */
  onClose?: () => void;

  /**
   * Arbitrary content rendered on the right side of the header, before the action buttons.
   */
  rightContent?: ReactNode;
}

/**
 * Props for the DataPanelBody sub-component.
 */
export interface IDataPanelBodyProps {
  /**
   * Content rendered inside the panel body.
   */
  children?: ReactNode;

  /**
   * When true a loading spinner overlay replaces the body content.
   * @default false
   */
  loading?: boolean;

  /**
   * Message displayed when children is empty and loading is false.
   */
  emptyMessage?: string;

  /**
   * When true the body is not rendered (panel is collapsed).
   * @default false
   */
  collapsed?: boolean;

  /**
   * Additional CSS class names applied to the body element.
   */
  className?: string;

  /**
   * Inline styles applied to the body element.
   */
  style?: React.CSSProperties;
}

/**
 * Props for the DataPanelFooter sub-component.
 */
export interface IDataPanelFooterProps {
  /**
   * List of action buttons rendered inside the footer toolbar.
   */
  actions: IDataPanelActionProps[];

  /**
   * Horizontal alignment of the action buttons.
   * @default "flex-end"
   */
  justify?: "flex-start" | "center" | "flex-end" | "space-between";
}

/**
 * Props for the top-level DataPanel component.
 * DataPanel composes DataPanelHeader, DataPanelBody, and DataPanelFooter
 * into a single managed panel with optional collapsible behaviour.
 */
export interface IDataPanelProps {
  /**
   * Identifier of the root panel element.
   */
  id: string;

  /**
   * Primary title shown in the panel header.
   */
  title: string;

  /**
   * Optional subtitle shown below the title.
   */
  subtitle?: string;

  /**
   * Controls panel visibility. When false the panel is not rendered.
   * @default true
   */
  show?: boolean;

  /**
   * When true a collapse/expand toggle is rendered in the header.
   * @default false
   */
  collapsible?: boolean;

  /**
   * Initial collapsed state when collapsible is true.
   * @default false
   */
  defaultCollapsed?: boolean;

  /**
   * Icon node displayed in the header beside the title.
   */
  icon?: ReactNode;

  /**
   * Callback fired when the header close button is clicked.
   * If omitted, no close button is rendered.
   */
  onClose?: () => void;

  /**
   * Body content. Rendered inside DataPanelBody.
   */
  children?: ReactNode;

  /**
   * List of footer action buttons. When empty, the footer is not rendered.
   */
  actions?: IDataPanelActionProps[];

  /**
   * Message shown inside the body when children is empty and loading is false.
   */
  emptyMessage?: string;

  /**
   * When true the body shows a loading spinner instead of children.
   * @default false
   */
  loading?: boolean;

  /**
   * Horizontal alignment of footer action buttons.
   * @default "flex-end"
   */
  footerJustify?: "flex-start" | "center" | "flex-end" | "space-between";

  /**
   * Additional CSS class names applied to the root element.
   */
  className?: string;

  /**
   * Inline styles applied to the root element.
   */
  style?: React.CSSProperties;
}
