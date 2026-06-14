import { TooltipComponentOption } from "echarts";

export type SymbolType = 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow' | 'none';
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right';
export type Orientation = 'horizontal' | 'vertical';

export interface ILine {
  color?: string;
  width?: number;
  type?: "solid" | "dashed" | "dotted";
  dashOffset?: number;
  cap?: "butt" | "round" | "square" | "squareRatio";
  join?: "bevel" | "round" | "miter";
  miterLimit?: number;
  shadowBlur?: number;
  shadowColor?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface IGrid {
  left?: string | number;
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  width?: string | number;
  height?: string | number;
  containLabel?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: string;
  shadowOffsetY?: string;
}

export interface ITickmarksStyle {
  length?: number;
  lineStyle?: ILine;
}

export interface IAxis {
  label?: string;
  labelSpacing?: number;
  splitNumber?: number;
  showGuidelines?: boolean;
  showTickmarks?: boolean;
  interval?: number;
  lineStyle?: ILine;
  guidelinesStyle?: ILine;
  labelStyle?: React.CSSProperties;
  valuesStyle?: React.CSSProperties;
  tickmarksStyle?: ITickmarksStyle;
  formatter?: (value: number | string) => number | string;
}

export interface ILegend {
  fontFamily?: string;
  fontColor?: string;
  fontWeight?: number;
  fontSize?: number;
  orientation?: Orientation;
  position?: LegendPosition;
  inactiveColor?: string;
}

export interface IChartProps {
  id?: string;
  title?: string;
  allowZoom?: boolean;
  zoomProps?: {
    disableYaxisZoom: boolean;
    start?: number;
    end?: number;
    startValue?: number;
    endValue?: number;
  };
  titleSx?: React.CSSProperties;
  showToolTip?: boolean;
  allowAxisTooltip?: boolean;
  showAnimation?: boolean;
  showHighlightOnHover?: boolean;
  xAxisPosition?: "top" | "bottom";
  xAxisProps?: IAxis;
  yAxisProps?: IAxis;
  annotationAxisProps?: Pick<IAxis, "showTickmarks" | "valuesStyle" | "lineStyle">;
  gridProps?: IGrid;
  /** @deprecated Use appropriate props for styling instead. */
  sx?: React.CSSProperties;
  legend?: ILegend;
  maxX?: number;
  maxY?: number;
  minX?: number;
  minY?: number;
}

export interface ITooltip extends TooltipComponentOption {
  show?: boolean;
  trigger?: 'item' | 'axis' | 'none';
  triggerOn?: 'mousemove' | 'click' | 'none';
  alwaysShowContent?: boolean;
  showDelay?: number;
  hideDelay?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number | [number, number, number, number];
  textStyle?: {
    color?: string;
    fontStyle?: 'normal' | 'italic' | 'oblique';
    fontWeight?: 'normal' | 'bold' | 'bolder' | 'lighter' | number;
    fontFamily?: string;
    fontSize?: number;
  };
  formatter?: string;
  z?: number;
  transitionDuration?: number;
  showContent?: boolean;
  extraCssText?: string;
}
