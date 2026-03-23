"use client";

import { Tooltip } from "@/components/ui/tooltip";
import type { ParamsMonth } from "@/lib/analytics";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Parameters trend ── */

function fmtParams(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}T`;
  if (n >= 1) return `${Math.round(n)}B`;
  return `${Math.round(n * 1_000)}M`;
}

export function ParamsTrend({
  data,
  onSelect,
  selection,
}: ChartProps<ParamsMonth[]>) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.maxParams));
  const _hasSel = selection?.type === "month" && selection.chart === "context";

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="flex h-36 items-end gap-1 bg-background px-4 pt-4 pb-2 sm:h-48 md:h-56">
        {data.map((d) => (
          <Tooltip
            key={d.month}
            content={`${d.month}: max ${fmtParams(d.maxParams)}, avg ${fmtParams(d.avgParams)}`}
          >
            <div
              className="flex flex-1 cursor-pointer flex-col justify-end overflow-hidden rounded-t transition-all duration-150"
              style={{
                height: `${max > 0 ? Math.max((d.maxParams / max) * 100, 2) : 0}%`,
              }}
              onClick={() =>
                onSelect({ type: "month", month: d.month, chart: "context" })
              }
            >
              {/* avg portion */}
              <div
                className="w-full bg-orange-500/40 hover:bg-orange-500/60"
                style={{
                  height: `${d.maxParams > 0 ? (d.avgParams / d.maxParams) * 100 : 0}%`,
                }}
              />
              {/* max - avg gap */}
              <div
                className="w-full bg-orange-500/15"
                style={{
                  height: `${d.maxParams > 0 ? ((d.maxParams - d.avgParams) / d.maxParams) * 100 : 0}%`,
                }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="flex items-center justify-between border-border border-t px-4 py-2 text-[10px] text-muted-foreground">
        <span>{data[0]?.month}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-500/40" />{" "}
            avg
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-500/15" />{" "}
            max
          </span>
        </div>
        <span>{data[data.length - 1]?.month}</span>
      </div>
    </div>
  );
}
