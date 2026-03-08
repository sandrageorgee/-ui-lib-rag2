export interface ButtonProps {
    label?: string;
    variant?: "primary" | "secondary" | "danger";
    disabled?: boolean;
    onClick?: () => void;
}
