import React from "react";
import { IInputProps } from "./Input.types";

/**
 * Input Component
 */
const Input: React.FC<IInputProps> = (props) => {
    const {
        defaultValue,
        onClick,
        onChange,
        inputRef,
        disabled,
        label,
        placeholder,
        type = "text",
    } = props;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {label && <label>{label}</label>}

            <input
                ref={inputRef as any}
                defaultValue={defaultValue}
                onClick={onClick}
                onChange={onChange}
                disabled={disabled}
                placeholder={placeholder}
                type={type}
                style={{
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                }}
            />
        </div>
    );
};

export default Input;