import { ReactNode } from "react";

/**
 * Interface for the Card component.
 * A generic surface container used to group related content.
 */
export interface ICard extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Content rendered inside the card body.
   */
  children?: ReactNode;

  /**
   * CSS object to override or extend styling rules.
   * @deprecated Use className instead.
   */
  sx?: React.CSSProperties;

  /**
   * Determines whether a helper icon is displayed at the bottom-right of the card.
   */
  hasHelperIcon?: boolean;

  /**
   * Callback fired when the helper icon is clicked.
   */
  onClickHelperFunction?: () => void;

  /**
   * The icon node to display as the helper icon.
   */
  helperIcon?: ReactNode;

  /**
   * Custom styles applied to the helper icon wrapper.
   * @deprecated Use className instead.
   */
  helperIconSx?: React.CSSProperties;
}
