"use client";

import { Tooltip } from "@/components/ui/tooltip";
import type { ModelTypeCount } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Model type distribution (segmented bar) ── */

const TYPE_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-red-500",
  "bg-yellow-500",
  "bg-pink-500",
  "bg-cyan-500",
];

export function ModelTypeChart({
  data,
  onSelect,
  selection,
}: ChartProps<ModelTypeCount[]>) {
  if (data.length === 0) return <Empty />;
  const total = data.reduce((s, d) => s + d.count, 0);
  const activeType =
    selection?.type === "modelType" ? selection.modelType : null;

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      {/* Segmented bar */}
      <div className="flex h-8 overflow-hidden bg-background">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.count / total) * 100 : 0;
          const isActive = d.type === activeType;
          return (
            <Tooltip
              key={d.type}
              content={`${d.type}: ${d.count} (${Math.round(pct)}%)`}
            >
              <div
                className={cn(
                  "cursor-pointer transition-opacity duration-150",
                  TYPE_COLORS[i % TYPE_COLORS.length],
                  isActive
                    ? "opacity-100"
                    : activeType
                      ? "opacity-30"
                      : "opacity-70 hover:opacity-100",
                )}
                style={{ width: `${pct}%`, minWidth: pct > 0 ? 2 : 0 }}
                onClick={() =>
                  onSelect({ type: "modelType", modelType: d.type })
                }
              />
            </Tooltip>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-border border-t px-4 py-2.5">
        {data.map((d, i) => (
          <button
            key={d.type}
            type="button"
            className={cn(
              "flex items-center gap-1.5 text-xs transition-opacity",
              activeType && d.type !== activeType ? "opacity-40" : "",
            )}
            onClick={() => onSelect({ type: "modelType", modelType: d.type })}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                TYPE_COLORS[i % TYPE_COLORS.length],
              )}
            />
            <span className="text-muted-foreground">{d.type}</span>
            <span className="font-mono text-foreground">{d.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
