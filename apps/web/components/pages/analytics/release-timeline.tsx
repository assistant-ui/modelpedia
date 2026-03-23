"use client";

import { useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ReleaseMonth, ReleaseSummary } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  type ChartProps,
  Empty,
  handleChartKeyDown,
  isMonthActive,
  StatCell,
} from "./chart-utils";

/* ── Release timeline ── */

export function ReleaseTimeline({
  data,
  onSelect,
  selection,
  summary,
}: ChartProps<ReleaseMonth[]> & { summary: ReleaseSummary }) {
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.count));
  const hasSel = selection?.type === "month" && selection.chart === "releases";
  const selectByIdx = (i: number) =>
    onSelect({ type: "month", month: data[i].month, chart: "releases" });

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        <StatCell label="Total released" value={String(summary.total)} />
        <StatCell label="Avg / month" value={String(summary.avgPerMonth)} />
        <StatCell
          label="Peak"
          value={`${summary.peakCount} (${summary.peakMonth})`}
        />
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
          const active = isMonthActive(selection, "releases", d.month);
          const focused = focusIdx === i;
          return (
            <Tooltip key={d.month} content={`${d.month}: ${d.count} models`}>
              <div
                className={cn(
                  "flex-1 cursor-pointer rounded-t transition-all duration-150",
                  active
                    ? "bg-blue-500/50 ring-1 ring-blue-500"
                    : focused
                      ? "bg-blue-500/40"
                      : hasSel
                        ? "bg-blue-500/10"
                        : "bg-blue-500/20 hover:bg-blue-500/40",
                )}
                style={{
                  height: `${max > 0 ? Math.max((d.count / max) * 100, 2) : 0}%`,
                }}
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
        <span>{data[data.length - 1]?.month}</span>
      </div>
    </div>
  );
}
