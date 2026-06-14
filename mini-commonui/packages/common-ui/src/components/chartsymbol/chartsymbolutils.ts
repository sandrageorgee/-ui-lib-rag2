import { SymbolType } from "../icharts";

/**
 * Extracts chart colors from CSS variables.
 * Returns an array of 9 chart colors.
 */
export const chartColors = (): string[] => {
  const rootStyles = window.getComputedStyle(document.documentElement);
  return [
    rootStyles.getPropertyValue("--color-chart-1"),
    rootStyles.getPropertyValue("--color-chart-2"),
    rootStyles.getPropertyValue("--color-chart-3"),
    rootStyles.getPropertyValue("--color-chart-4"),
    rootStyles.getPropertyValue("--color-chart-5"),
    rootStyles.getPropertyValue("--color-chart-6"),
    rootStyles.getPropertyValue("--color-chart-7"),
    rootStyles.getPropertyValue("--color-chart-8"),
    rootStyles.getPropertyValue("--color-chart-9"),
  ];
};

/**
 * Renders a symbol on a canvas context.
 * Used for canvas-based rendering scenarios.
 */
export const renderSymbolOnCanvas = (
  ctx: CanvasRenderingContext2D,
  symbolType: SymbolType | undefined,
  size: number,
  color: string,
  x: number,
  y: number,
  rotate: number
) => {
  const half = size / 2;
  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
  ctx.fillStyle = color;

  switch (symbolType) {
    case "rect":
      ctx.fillRect(-half, -half, size, size);
      break;
    case "roundRect": {
      const r = Math.max(1, size * 0.15);
      const left = -half;
      const top  = -half;
      ctx.beginPath();
      ctx.moveTo(left + r, top);
      ctx.lineTo(left + size - r, top);
      ctx.arcTo(left + size, top, left + size, top + r, r);
      ctx.lineTo(left + size, top + size - r);
      ctx.arcTo(left + size, top + size, left + size - r, top + size, r);
      ctx.lineTo(left + r, top + size);
      ctx.arcTo(left, top + size, left, top + size - r, r);
      ctx.lineTo(left, top + r);
      ctx.arcTo(left, top, left + r, top, r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(half, half);
      ctx.lineTo(-half, half);
      ctx.closePath();
      ctx.fill();
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(half, 0);
      ctx.lineTo(0, half);
      ctx.lineTo(-half, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case "arrow":
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.7, half);
      ctx.lineTo(0, size * 0.15);
      ctx.lineTo(-size * 0.7, half);
      ctx.closePath();
      ctx.fill();
      break;
    case "pin":
      ctx.beginPath();
      ctx.ellipse(0, -half * 0.4, half * 0.45, half * 0.45, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -half * 0.4);
      ctx.lineTo(-half * 0.35, half);
      ctx.lineTo(half * 0.35, half);
      ctx.closePath();
      ctx.fill();
      break;
    case "none":
      break;
    case "circle":
    default:
      ctx.beginPath();
      ctx.arc(0, 0, half, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
};
