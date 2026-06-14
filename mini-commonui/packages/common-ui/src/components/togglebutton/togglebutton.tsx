import React, { useEffect, useState } from "react";
import { ToggleButtonProps } from "./itogglebutton";
import "./togglebutton.css";

const ToggleButton: React.FC<ToggleButtonProps> = (props: ToggleButtonProps): JSX.Element => {
  const { id, className, value, showLabel = true, label, onChange, disabled = false, labelPlacement = "end" } = props;
  const [checked, setChecked] = useState(value);

  // This effect is necessary to handle cases where the prop changes, but the component does not re-render.
  // React does not automatically trigger a re-render when a prop changes, so without this effect,
  // the component will continue to use the initial value of the prop, even if the prop change.
  useEffect(() => {
    setChecked(value)
  }, [value])

  return (
    <div
      id={id}
      className={`Cui-ToggleButton__wrapper ${disabled && `Cui-ToggleButton__disabled`} ${className}`}
    >
      {
        (showLabel && label && labelPlacement === "start") &&
        <p className={`Cui-ToggleButton__labelText Cui-ToggleButton__labelText--${labelPlacement}`}>
          {label}
        </p>
      }
      <div className={`Cui-ToggleButton__switch ${checked ? "Cui-ToggleButton__switch--checked" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setChecked(!checked);
          onChange?.(!checked);
        }}>
        <div className="Cui-ToggleButton__thumb"></div>
      </div>
      {
        (showLabel && label && labelPlacement === "end") &&
        <p className={`Cui-ToggleButton__labelText Cui-ToggleButton__labelText--${labelPlacement}`}>
          {label}
        </p>
      }
    </div>
  );
};

export default ToggleButton;