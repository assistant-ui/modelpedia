"use client";

import { useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ContextMonth, ContextSummary } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { formatTokens } from "@/lib/format";
import {
  type ChartProps,
  computeContextTicks,
  Empty,
  handleChartKeyDown,
  isMonthActive,
  StatCell,
} from "./chart-utils";

/* ── Context window evolution ── */

export function ContextTimeline({
  data,
  onSelect,
  selection,
  summary,
}: ChartProps<ContextMonth[]> & { summary: ContextSummary }) {
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.maxContext));
  const hasSel = selection?.type === "month" && selection.chart === "context";
  const selectByIdx = (i: number) =>
    onSelect({ type: "month", month: data[i].month, chart: "context" });

  const ticks = computeContextTicks(max);

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="grid grid-cols-2 gap-px bg-border">
        <StatCell
          label="Current max"
          value={formatTokens(summary.currentMax)}
        />
        <StatCell label="Growth" value={`${summary.growthFactor}x`} />
      </div>
      <div
        className="relative h-36 border-border border-t bg-background sm:h-48 md:h-56"
        style={{ padding: "1rem 1rem 0.5rem 3rem" }}
      >
        {ticks.map((t) => {
          const pct = (t / max) * 100;
          return (
            <div key={t}>
              <div
                className="pointer-events-none absolute left-0"
                style={{ bottom: `${pct}%`, transform: "translateY(50%)" }}
              >
                <span className="inline-block w-10 text-right font-mono text-[10px] text-muted-foreground/50">
                  {formatTokens(t)}
                </span>
              </div>
              <div
                className="pointer-events-none absolute right-4 left-12 border-border/30 border-t"
                style={{ bottom: `${pct}%` }}
              />
            </div>
          );
        })}
        <div
          role="toolbar"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: toolbar is interactive
          tabIndex={0}
          ref={containerRef}
          onKeyDown={(e: React.KeyboardEvent) =>
            handleChartKeyDown(
              e,
              data.length,
              focusIdx,
              setFocusIdx,
              selectByIdx,
            )
          }
          onFocus={() => focusIdx < 0 && setFocusIdx(0)}
          className="flex h-full items-end gap-1 outline-none"
        >
          {data.map((d, i) => {
            const active = isMonthActive(selection, "context", d.month);
            const focused = focusIdx === i;
            return (
              <Tooltip
                key={d.month}
                content={`${d.month}: ${formatTokens(d.maxContext)} tokens`}
              >
                <div
                  className={cn(
                    "flex-1 cursor-pointer rounded-t transition-all duration-150",
                    active
                      ? "bg-purple-500/50 ring-1 ring-purple-500"
                      : focused
                        ? "bg-purple-500/40"
                        : hasSel
                          ? "bg-purple-500/10"
                          : "bg-purple-500/20 hover:bg-purple-500/40",
                  )}
                  style={{
                    height: `${max > 0 ? Math.max((d.maxContext / max) * 100, 2) : 0}%`,
                  }}
                  onClick={() =>
                    onSelect({
                      type: "month",
                      month: d.month,
                      chart: "context",
                    })
                  }
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-border border-t px-4 py-2 text-[10px] text-muted-foreground">
        <span>{data[0]?.month}</span>
        <span className="font-mono">max {formatTokens(max)} tokens</span>
        <span>{data[data.length - 1]?.month}</span>
      </div>
    </div>
  );
}
