import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Button component supporting multiple variants.
 * Used for triggering actions inside the UI library.
 */
const Button = ({ label, variant = "primary", disabled, onClick }) => {
    return (_jsx("button", { className: `btn btn-${variant}`, disabled: disabled, onClick: onClick, children: label }));
};
export default Button;
