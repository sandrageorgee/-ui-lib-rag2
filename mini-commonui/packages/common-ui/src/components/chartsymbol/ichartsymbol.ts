/**
 * Symbol shape types supported by the ChartSymbol component.
 */
export type SymbolType =
  | "circle"
  | "rect"
  | "roundRect"
  | "triangle"
  | "diamond"
  | "pin"
  | "arrow"
  | "none";

/**
 * Props for the ChartSymbol component.
 * Renders a single chart marker symbol on a canvas element.
 */
export interface IChartSymbolProps {
  /**
   * Shape of the symbol to render.
   * @default "circle"
   */
  symbolType?: SymbolType;

  /**
   * Width and height of the canvas in pixels.
   * @default 32
   */
  size?: number;

  /**
   * Fill color of the symbol.
   * Accepts any valid CSS color string.
   * @default "#3d9ccc"
   */
  color?: string;

  /**
   * Rotation angle of the symbol in degrees.
   * @default 0
   */
  rotate?: number;

  /**
   * Additional CSS class names applied to the canvas element.
   */
  className?: string;

  /**
   * Inline styles applied to the canvas element.
   */
  style?: React.CSSProperties;
}
