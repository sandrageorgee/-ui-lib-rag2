import React from "react";
import { ButtonProps } from "./Button.types";

/**
 * Button component supporting multiple variants.
 * Used for triggering actions inside the UI library.
 */
const Button: React.FC<ButtonProps> = ({
    label,
    variant = "primary",
    disabled,
    onClick
}) => {
    return (
        <button
            className={`btn btn-${variant}`}
            disabled={disabled}
            onClick={onClick}
        >
            {label}
        </button>
    );
};

export default Button;