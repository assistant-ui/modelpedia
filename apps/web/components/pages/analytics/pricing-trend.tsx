"use client";

import { Tooltip } from "@/components/ui/tooltip";
import type { PricingMonth } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Pricing trend (line-style dots) ── */

export function PricingTrend({
  data,
  onSelect,
  selection,
}: ChartProps<PricingMonth[]>) {
  if (data.length === 0) return <Empty />;
  // Use p90 as max to avoid outliers compressing the chart
  const sorted = [...data.map((d) => d.medianInput)].sort((a, b) => a - b);
  const p90 =
    sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
  const max = Math.max(p90 * 1.1, 0.01);
  const activeMonth =
    selection?.type === "month" && selection.chart === "releases"
      ? selection.month
      : null;

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="flex h-36 items-end gap-1 bg-background px-4 pt-4 pb-2 sm:h-48 md:h-56">
        {data.map((d) => {
          const clamped = Math.min(d.medianInput, max);
          const pct = max > 0 ? Math.max((clamped / max) * 100, 2) : 0;
          const isActive = d.month === activeMonth;
          return (
            <Tooltip
              key={d.month}
              content={`${d.month}: $${d.medianInput.toFixed(2)} median (${d.count} models)`}
            >
              <div
                className={cn(
                  "flex-1 cursor-pointer rounded-t transition-all duration-150",
                  isActive
                    ? "bg-green-500/50"
                    : activeMonth
                      ? "bg-green-500/10"
                      : "bg-green-500/20 hover:bg-green-500/40",
                )}
                style={{ height: `${pct}%` }}
                onClick={() =>
                  onSelect({
                    type: "month",
                    month: d.month,
                    chart: "releases",
                  })
                }
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-border border-t px-4 py-2 text-[10px] text-muted-foreground">
        <span>{data[0]?.month}</span>
        <span className="font-mono">median $/1M input</span>
        <span>{data[data.length - 1]?.month}</span>
      </div>
    </div>
  );
}
