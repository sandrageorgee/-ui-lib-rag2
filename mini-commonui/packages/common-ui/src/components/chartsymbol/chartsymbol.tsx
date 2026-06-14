import React, { useEffect, useRef } from "react";
import { IChartSymbolProps, SymbolType } from "./ichartsymbol";
import { renderSymbolOnCanvas } from "./chartsymbolutils";

const ChartSymbol: React.FC<IChartSymbolProps> = ({
  symbolType = "circle",
  size = 32,
  color = "#3d9ccc",
  rotate = 0,
  className = "",
  style,
}: IChartSymbolProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);
    renderSymbolOnCanvas(ctx, symbolType as SymbolType, size * 0.6, color, size / 2, size / 2, rotate);
  }, [symbolType, size, color, rotate]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={style}
      aria-label={`${symbolType} symbol`}
    />
  );
};

export default ChartSymbol;
export { IChartSymbolProps, SymbolType };
