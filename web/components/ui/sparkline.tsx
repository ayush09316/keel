import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  className,
  stroke = "var(--accent)",
  height = 28,
  label,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  height?: number;
  label?: string;
}) {
  const width = 120;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("block h-7 w-full overflow-visible", className)}
      role="img"
      aria-label={label ?? `trend, latest ${values[values.length - 1] ?? 0}`}
    >
      <path d={area} fill={stroke} opacity={0.12} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
