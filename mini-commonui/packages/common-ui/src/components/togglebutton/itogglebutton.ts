/**
 * Props for the ToggleButton component.
 */
export interface ToggleButtonProps {
  /**
   * Identifier of the ToggleButton.
   */
  id?: string;

  /**
   * Classname passed to the component
  */
  className?: string;

  /**
   * Value of the ToggleButton.
   */
  value: boolean;

  /**
   * Flag to show the label. Defaults to true.
   */
  showLabel?: boolean | undefined;

  /**
   * Callback function called when the value of the ToggleButton changes.
   */
  onChange?: (value: boolean) => void;

  /**
   * @deprecated This prop is no longer supported and will have no effect. Please use the appropriate props for styling.
   * Style properties for the switch to apply.
   */
  sx?: {
    /**
     * @deprecated This property is no longer used. Please use the appropriate styling approach.
     * Styling properties for the typography.
     */
    typographySx?: React.CSSProperties;

    /**
     * @deprecated This property is no longer used. Please use the appropriate styling approach.
     * Styling properties for the switch.
     */
    switchSx?: React.CSSProperties;
  };

  /**
   * Label of the ToggleButton.
   */
  label?: string;

  /**
   * Indicates whether the ToggleButton is disabled.
   */
  disabled?: boolean;

  /**
   * Flag to reverse the order of the Switch and Typography.
   */
  labelPlacement?: 'start' | 'end';
}