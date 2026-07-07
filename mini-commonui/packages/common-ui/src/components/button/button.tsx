import React from "react";
import { IButtonProps } from "./ibutton";

const baseClass = "Cui-Button";

const Button: React.FC<IButtonProps> = (props: IButtonProps) => {
  const {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    label,
    disabled,
    className = "",
    children,
    ...rest
  } = props;

  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={`${baseClass} ${baseClass}--${variant} ${baseClass}--${size} ${className}`.trim()}
    >
      {loading && (
        <span className={`${baseClass}__spinner`} aria-hidden="true" />
      )}
      {!loading && leftIcon && (
        <span className={`${baseClass}__leftIcon`}>{leftIcon}</span>
      )}
      <span className={`${baseClass}__label`}>{label ?? children}</span>
      {!loading && rightIcon && (
        <span className={`${baseClass}__rightIcon`}>{rightIcon}</span>
      )}
    </button>
  );
};

export default Button;
