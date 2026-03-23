"use client";

import { useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { OpenWeightMonth, OpenWeightSummary } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  type ChartProps,
  Empty,
  handleChartKeyDown,
  isMonthActive,
  StatCell,
} from "./chart-utils";

/* ── Open weight trend ── */

export function OpenWeightTrend({
  data,
  onSelect,
  selection,
  summary,
}: ChartProps<OpenWeightMonth[]> & { summary: OpenWeightSummary }) {
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectByIdx = (i: number) =>
    onSelect({ type: "month", month: data[i].month, chart: "openweight" });
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.open + d.proprietary));
  const hasSel =
    selection?.type === "month" && selection.chart === "openweight";

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        <StatCell label="Open weight" value={String(summary.openTotal)} />
        <StatCell
          label="Proprietary"
          value={String(summary.proprietaryTotal)}
        />
        <StatCell label="Open %" value={`${summary.openPct}%`} />
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
        className="flex h-36 items-end gap-1 border-border border-t bg-background px-4 pt-4 pb-2 outline-none sm:h-48 md:h-56"
      >
        {data.map((d, i) => {
          const total = d.open + d.proprietary;
          const openPct = total > 0 ? (d.open / total) * 100 : 0;
          const active = isMonthActive(selection, "openweight", d.month);
          const focused = focusIdx === i;
          return (
            <Tooltip
              key={d.month}
              content={`${d.month}: ${d.open} open, ${d.proprietary} proprietary (${Math.round(openPct)}% open)`}
            >
              <div
                className={cn(
                  "flex flex-1 cursor-pointer flex-col overflow-hidden rounded-t transition-all duration-150",
                  active
                    ? "ring-1 ring-green-500"
                    : focused
                      ? "ring-1 ring-green-500/50"
                      : "",
                )}
                style={{
                  height: `${max > 0 ? Math.max((total / max) * 100, 2) : 0}%`,
                }}
                onClick={() =>
                  onSelect({
                    type: "month",
                    month: d.month,
                    chart: "openweight",
                  })
                }
              >
                <div
                  className={cn(
                    "w-full transition-colors duration-150",
                    active
                      ? "bg-green-500/50"
                      : hasSel
                        ? "bg-green-500/15"
                        : "bg-green-500/30 hover:bg-green-500/50",
                  )}
                  style={{
                    height: total > 0 ? `${(d.open / total) * 100}%` : "0",
                  }}
                />
                <div
                  className={cn(
                    "w-full",
                    active
                      ? "bg-purple-500/30"
                      : hasSel
                        ? "bg-purple-500/8"
                        : "bg-purple-500/15",
                  )}
                  style={{
                    height:
                      total > 0 ? `${(d.proprietary / total) * 100}%` : "0",
                  }}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-border border-t px-4 py-2 text-[10px]">
        <span className="text-muted-foreground">{data[0]?.month}</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Open weight</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
            <span className="text-muted-foreground">Proprietary</span>
          </span>
        </div>
        <span className="text-muted-foreground">
          {data[data.length - 1]?.month}
        </span>
      </div>
    </div>
  );
}
