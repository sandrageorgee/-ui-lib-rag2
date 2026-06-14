import ReactECharts from "echarts-for-react";
import { LegendPosition } from "../icharts";
import { IBarChartData, IBarChartProps } from "./ibarchart";
import { useMemo } from "react";

const BarChart: React.FC<IBarChartProps> = (props: IBarChartProps): JSX.Element => {
  const {
    id, allowZoom, zoomProps, data, thresholdProps = { threshold: 999999 },
    showToolTip, showHighlightOnHover, showAnimation, gridProps, xAxisProps,
    yAxisProps, annotationAxisProps, xAxisPosition, barProps, sx, title,
    titleSx = { color: "#FFF9" }, legend, maxX, maxY,
  } = props;

  const finalData: IBarChartData[] = data.length === 0 ? [{ label: "", yValue: 0 }] : data;

  const getLegendPosition = (position: LegendPosition | undefined): object => {
    switch (position) {
      case "top":    return { top: 5, left: "45%" };
      case "bottom": return { bottom: 0, left: "45%" };
      case "left":   return { left: -5, top: "middle", orient: "vertical" };
      case "right":  return { right: 10, top: "middle", orient: "vertical" };
      default:       return { top: 5, left: "45%" };
    }
  };

  const titleColor      = useMemo(() => window.getComputedStyle(document.documentElement).getPropertyValue("--SecondaryShades__Secondary200"), []);
  const backgroundColor = useMemo(() => window.getComputedStyle(document.documentElement).getPropertyValue("--SecondaryShades__Secondary700"), []);
  const axisColor       = useMemo(() => window.getComputedStyle(document.documentElement).getPropertyValue("--SecondaryShades__Secondary400"), []);

  const chartColors = useMemo(() => {
    const root = window.getComputedStyle(document.documentElement);
    return Array.from({ length: 9 }, (_, i) => root.getPropertyValue(`--color-chart-${i + 1}`));
  }, []);

  return (
    <ReactECharts
      onChartReady={(chart) => { chart._api.getDom().id = id; }}
      option={{
        title: { text: title, left: "center", textStyle: { ...titleSx, color: titleColor } },
        tooltip: { show: showToolTip },
        animation: showAnimation,
        grid: { show: true, z: -1, borderColor: "transparent", ...gridProps, backgroundColor },
        legend: {
          type: "scroll",
          orient: legend?.orientation,
          ...getLegendPosition(legend?.position),
          itemWidth: 16,
          inactiveColor: legend?.inactiveColor,
          textStyle: { color: titleColor, fontSize: 12, fontWeight: 700 },
        },
        xAxis: [
          {
            name: xAxisProps?.label,
            data: finalData.map((item) => item.label || ""),
            nameLocation: "middle",
            nameGap: xAxisProps?.labelSpacing,
            nameTextStyle: { ...xAxisProps?.labelStyle, color: titleColor },
            boundaryGap: ["20%", "20%"],
            axisLabel: { ...xAxisProps?.xAxislabelsProps, formatter: xAxisProps?.formatter },
            splitLine: { show: xAxisProps?.showGuidelines, lineStyle: { ...xAxisProps?.guidelinesStyle, color: axisColor } },
            axisLine: { onZero: false, lineStyle: { width: 0, ...xAxisProps?.lineStyle } },
            axisTick: { show: xAxisProps?.showTickmarks },
            max: maxX,
            splitNumber: xAxisProps?.splitNumber,
            position: xAxisPosition,
          },
          {
            data: finalData.map((item) => item.annotation || ""),
            show: true,
            axisLabel: { ...annotationAxisProps?.annotationsTextProps },
            axisLine: { lineStyle: { width: 0, ...annotationAxisProps?.lineStyle } },
            axisTick: { show: xAxisProps?.showTickmarks, alignWithLabel: true },
            max: maxX,
            splitNumber: xAxisProps?.splitNumber,
          },
        ],
        yAxis: [
          {
            name: yAxisProps?.label,
            nameLocation: "middle",
            nameGap: yAxisProps?.labelSpacing,
            nameTextStyle: { ...yAxisProps?.labelStyle, color: titleColor },
            type: "value",
            axisLabel: { ...yAxisProps?.valuesStyle, formatter: yAxisProps?.formatter },
            splitLine: { show: yAxisProps?.showGuidelines, lineStyle: { ...yAxisProps?.guidelinesStyle, color: axisColor } },
            axisLine: { width: 0, lineStyle: { ...yAxisProps?.lineStyle } },
            axisTick: { show: yAxisProps?.showTickmarks, alignWithLabel: true },
            splitNumber: !yAxisProps?.interval && yAxisProps?.splitNumber,
            max: maxY,
            interval: yAxisProps?.interval,
          },
        ],
        [allowZoom ? "dataZoom" : ""]: [
          { type: "inside", filterMode: "none", xAxisIndex: [0], ...zoomProps },
          { type: "inside", filterMode: "none", disabled: zoomProps?.disableYaxisZoom, yAxisIndex: [0], ...zoomProps },
        ],
        series: [
          {
            z: !barProps?.showBarAboveGuidelines ? -1 : 2,
            barGap: "0%",
            stack: "total",
            data: finalData.map((item, index) => {
              let threshold = 1;
              if (thresholdProps?.threshold) {
                threshold = 1 - thresholdProps.threshold / item.yValue;
                threshold = threshold > 1 || threshold < 0 ? 0 : threshold;
              }
              const stops = [
                { offset: 0,         color: thresholdProps?.aboveThresholdColor ?? "rgba(255, 38, 64, 1)" },
                { offset: threshold, color: thresholdProps?.aboveThresholdColor ?? "rgba(255, 38, 64, 1)" },
                { offset: threshold, color: chartColors[index % 9] || "rgba(61, 156, 204, 1)" },
                { offset: 1,         color: chartColors[index % 9] || "rgba(61, 156, 204, 1)" },
              ];
              const gradient = { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: stops, global: false };
              return {
                tooltip: { borderColor: axisColor, ...item.tooltip },
                value: item.yValue,
                emphasis: !showHighlightOnHover && { color: gradient },
                itemStyle: { ...item.itemStyle, color: gradient },
              };
            }),
            type: "bar",
            barWidth: barProps?.width,
            markLine: {
              silent: !thresholdProps?.showAnimationOnTouch,
              symbol: "none",
              label: { color: "red", formatter: thresholdProps?.formatter, ...thresholdProps?.labelStyle },
              data: [{ yAxis: thresholdProps?.threshold }],
              lineStyle: { type: "solid", width: 2, color: thresholdProps?.thresholdLineColor ?? "#E55C6C" },
            },
          },
        ],
      }}
      style={{ backgroundColor, border: `1px solid ${axisColor}`, borderRadius: "10px", ...sx }}
    />
  );
};

export default BarChart;
export { IBarChartData, IBarChartProps };
