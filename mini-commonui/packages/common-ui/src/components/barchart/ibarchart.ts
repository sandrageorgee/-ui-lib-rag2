import { IChartProps, ITooltip, IAxis } from "../icharts";
import { XAXisComponentOption } from "echarts";

/**
 * Props for the threshold in the bar chart.
 */
export interface IThresholdProps {
  /** Value of the threshold. */
  threshold?: number;
  /** Color for bars above the threshold. */
  aboveThresholdColor?: string;
  /** Color of the threshold line. */
  thresholdLineColor?: string;
  /** Style for the threshold label. */
  labelStyle?: React.CSSProperties;
  /** Flag to show animation when touched. */
  showAnimationOnTouch?: boolean;
  /** Formatter for the threshold label. */
  formatter?: string;
}

/**
 * Props for individual bars in the bar chart.
 */
export interface IBarProps {
  /** Width of the bar. */
  width?: string;
  /** Color of the bar. */
  color?: string;
  /** Flag to show bars above guidelines. */
  showBarAboveGuidelines?: boolean;
}

/**
 * Data for the bar chart.
 */
export interface IBarChartData {
  /** Label for the bar. */
  label: string;
  /** X-axis value for the bar. */
  xValue?: number;
  /** Y-axis value for the bar. */
  yValue: number;
  /** Annotation for the bar. */
  annotation?: string;
  /**
   * Color of the bar.
   * @deprecated This property is no longer in use.
   */
  color?: string;
  /** Each series has its own tooltip configurations. */
  tooltip?: ITooltip;
  /** Extra styling for the bar. */
  itemStyle?: {
    /**
     * Border radius.
     * - Single number: all corners equal.
     * - Array of four: [top-left, top-right, bottom-right, bottom-left].
     */
    borderRadius?: number | [number, number, number, number];
    /** Border width in pixels. */
    borderWidth?: number;
    /** Border color. */
    borderColor?: string;
    /** Opacity from 0 (transparent) to 1 (opaque). */
    opacity?: number;
    /** Border style. */
    borderType?: "solid" | "dashed" | "dotted";
  };
}

/**
 * Props for the BarChart component.
 */
export interface IBarChartProps extends IChartProps {
  /** Id for the bar chart. */
  id?: string;
  /** Data for the bar chart. */
  data: IBarChartData[];
  /** Properties for individual bars. */
  barProps?: IBarProps;
  /**
   * Properties of the X-axis, extends IAxis with ECharts-specific label options.
   */
  xAxisProps?: Omit<IAxis, "valueStyle"> & {
    xAxislabelsProps?: XAXisComponentOption["axisLabel"];
  };
  /**
   * Properties of the annotation axis (second X-axis used for annotations).
   */
  annotationAxisProps?: Pick<IAxis, "showTickmarks" | "valuesStyle" | "lineStyle"> & {
    annotationsTextProps?: XAXisComponentOption["axisLabel"];
  };
  /** Properties for the threshold line and colors. */
  thresholdProps?: IThresholdProps;
}
