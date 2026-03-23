"use client";

import { useRef, useState } from "react";
import type { PriceBucket, PriceSummary } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  type ChartProps,
  Empty,
  handleChartKeyDown,
  StatCell,
} from "./chart-utils";

/* ── Pricing distribution ── */

const PRICE_COLORS = [
  "bg-green-500/30",
  "bg-green-500/20",
  "bg-blue-500/20",
  "bg-blue-500/25",
  "bg-orange-500/20",
  "bg-orange-500/25",
  "bg-red-500/20",
];
const PRICE_ACTIVE = [
  "bg-green-500/50 ring-1 ring-green-500",
  "bg-green-500/40 ring-1 ring-green-500",
  "bg-blue-500/40 ring-1 ring-blue-500",
  "bg-blue-500/50 ring-1 ring-blue-500",
  "bg-orange-500/40 ring-1 ring-orange-500",
  "bg-orange-500/50 ring-1 ring-orange-500",
  "bg-red-500/40 ring-1 ring-red-500",
];

export function PriceDistribution({
  data,
  onSelect,
  selection,
  summary,
}: ChartProps<PriceBucket[]> & { summary: PriceSummary }) {
  const max = Math.max(...data.map((d) => d.count));
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  if (max === 0) return <Empty />;
  const activeLabel = selection?.type === "price" ? selection.label : null;
  const selectByIdx = (i: number) =>
    onSelect({ type: "price", label: data[i].label });

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="grid grid-cols-2 gap-px bg-border">
        <StatCell
          label="Models with pricing"
          value={String(summary.totalPriced)}
        />
        <StatCell label="Median range" value={summary.medianRange} />
      </div>
      <div
        role="toolbar"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: toolbar is interactive
        tabIndex={0}
        ref={containerRef}
        onKeyDown={(e: React.KeyboardEvent) =>
          handleChartKeyDown(e, data.length, focusIdx, setFocusIdx, selectByIdx)
        }
        onFocus={() => focusIdx < 0 && setFocusIdx(0)}
        className="space-y-1 border-border border-t bg-background p-4 outline-none"
      >
        {data.map((d, i) => {
          const active = d.label === activeLabel;
          const focused = focusIdx === i;
          return (
            <div
              key={d.label}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded px-1 transition-colors",
                active
                  ? "bg-accent"
                  : focused
                    ? "bg-accent/50"
                    : "hover:bg-accent",
              )}
              onClick={() => onSelect({ type: "price", label: d.label })}
            >
              <span className="w-14 shrink-0 text-right font-mono text-muted-foreground text-xs">
                {d.label}
              </span>
              <div className="flex-1">
                <div
                  className={cn(
                    "h-5 rounded transition-all duration-150",
                    active
                      ? (PRICE_ACTIVE[i] ??
                          "bg-foreground/40 ring-1 ring-foreground")
                      : (PRICE_COLORS[i] ?? "bg-foreground/20"),
                  )}
                  style={{
                    width: `${max > 0 ? (d.count / max) * 100 : 0}%`,
                    minWidth: d.count > 0 ? 2 : 0,
                  }}
                />
              </div>
              <span className="w-8 font-mono text-muted-foreground text-xs tabular-nums">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="border-border border-t px-4 py-2 text-muted-foreground text-xs">
        Input price per 1M tokens
      </div>
    </div>
  );
}
