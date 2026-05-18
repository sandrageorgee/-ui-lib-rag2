import React from "react";

/**
 * Variant styles available for the Button component.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * Size options for the Button component.
 */
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Interface for the Button component.
 * Extends all native HTML button attributes so consumers can pass
 * onClick, disabled, type, aria-*, data-* and any other standard button prop.
 */
export interface IButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual style variant of the button.
   * @default "primary"
   */
  variant?: ButtonVariant;

  /**
   * Size of the button.
   * @default "md"
   */
  size?: ButtonSize;

  /**
   * When true, renders a spinner and disables the button.
   * @default false
   */
  loading?: boolean;

  /**
   * Optional icon rendered to the left of the label.
   */
  leftIcon?: React.ReactNode;

  /**
   * Optional icon rendered to the right of the label.
   */
  rightIcon?: React.ReactNode;

  /**
   * Label text displayed inside the button.
   */
  label?: string;
}
