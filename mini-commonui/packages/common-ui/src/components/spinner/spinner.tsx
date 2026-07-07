import React from 'react';
import './spinner.css';

const baseClass = 'Cui-Spinner';

export type SpinnerSize = 'small' | 'medium' | 'large';
export type SpinnerColor = 'primary' | 'secondary' | 'inherit';

export interface ISpinnerProps {
  /**
   * Size of the spinner wheel.
   * @default "medium"
   */
  size?: SpinnerSize;

  /**
   * Colour variant of the spinner.
   * @default "primary"
   */
  color?: SpinnerColor;

  /**
   * Accessible label announced by screen readers.
   * @default "Loading"
   */
  label?: string;

  /**
   * Additional CSS class names applied to the root element.
   */
  className?: string;

  /**
   * Optional SVG icon rendered inside the spinner track.
   * Accepts any React SVG component (e.g. imported .svg as ReactComponent).
   */
  icon?: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
}

const Spinner: React.FC<ISpinnerProps> = ({
  size = 'medium',
  color = 'primary',
  label = 'Loading',
  className = '',
}: ISpinnerProps) => (
  <span
    className={`${baseClass} ${baseClass}--${size} ${baseClass}--${color} ${className}`.trim()}
    role="status"
    aria-label={label}
  >
    <span className={`${baseClass}__track`} />
  </span>
);

export default Spinner;
