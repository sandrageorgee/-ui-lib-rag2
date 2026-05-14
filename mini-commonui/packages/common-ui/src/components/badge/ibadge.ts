import { ReactNode } from "react";

/**
 * Visual variants of the Badge.
 */
export type BadgeVariant = "standard" | "dot";

/**
 * Colour options for the Badge indicator.
 */
export type BadgeColor = "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";

/**
 * Interface for the Badge component.
 * A small numeric or status descriptor anchored to a child element.
 */
export interface IBadgeProps {
  /**
   * The content the badge is anchored to. Typically an icon or button.
   */
  children: ReactNode;

  /**
   * The numeric value displayed inside the badge.
   * Ignored when variant is "dot".
   */
  count?: number;

  /**
   * If count exceeds this value, the badge displays `${max}+`.
   * @default 99
   */
  max?: number;

  /**
   * Controls whether the badge is visible even when count is zero.
   * @default false
   */
  showZero?: boolean;

  /**
   * Visual variant of the badge.
   * - "standard" renders the count number.
   * - "dot" renders a small coloured dot with no text.
   * @default "standard"
   */
  variant?: BadgeVariant;

  /**
   * Colour of the badge indicator.
   * @default "error"
   */
  color?: BadgeColor;

  /**
   * When true the badge is not rendered.
   * @default false
   */
  invisible?: boolean;

  /**
   * Additional CSS class names applied to the root element.
   */
  className?: string;
}
