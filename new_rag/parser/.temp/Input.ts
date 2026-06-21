

/**
 * Base props for input behavior
 */
export interface IInputProps1 {
    /**
     * Default value for the input component.
     */
    defaultValue?: string | number;

    /**
     * Callback function called when the input is clicked.
     */
    onClick?: (event: any) => void;

    /**
     * Callback function called when the input value changes.
     */
    onChange?: (event: any) => void;

    /**
     * Ref to the native input element.
     */
    inputRef?: React.Ref<HTMLInputElement>;

    /**
     * Flag to indicate if the input is disabled.
     */
    disabled?: boolean;
}

/**
 * Extended props (🔥 SAME NAME — intentional duplicate)
 * This will test your parser's ability to handle variants
 */
export interface IInputProps2 {
    /**
     * Label for the input component.
     */
    label?: string;

    /**
     * Nested input props (composition)
     */
    inputProps?: IInputProps1;

    /**
     * Placeholder text
     */
    placeholder?: string;

    /**
     * Input type
     */
    type?: "text" | "password" | "email";
}