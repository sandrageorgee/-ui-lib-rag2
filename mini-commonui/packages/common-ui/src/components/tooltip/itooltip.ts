import { ReactNode } from "react";

/**
 * Placement options for the Tooltip.
 */
export type TooltipPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end";

/**
 * Interface for the Tooltip component.
 * Displays informational text when the user hovers over or focuses the wrapped element.
 */
export interface ITooltipProps {
  /**
   * The tooltip text or content to display.
   */
  content: ReactNode;

  /**
   * The element that triggers the tooltip.
   */
  children: ReactNode;

  /**
   * Placement of the tooltip relative to the trigger element.
   * @default "top"
   */
  placement?: TooltipPlacement;

  /**
   * Delay in milliseconds before the tooltip appears after hover.
   * @default 300
   */
  enterDelay?: number;

  /**
   * Delay in milliseconds before the tooltip disappears after the pointer leaves.
   * @default 0
   */
  leaveDelay?: number;

  /**
   * When true the tooltip is disabled and will never show.
   * @default false
   */
  disabled?: boolean;

  /**
   * When true the tooltip arrow is rendered pointing toward the trigger.
   * @default true
   */
  arrow?: boolean;

  /**
   * Additional CSS class applied to the tooltip popper element.
   */
  className?: string;
}
