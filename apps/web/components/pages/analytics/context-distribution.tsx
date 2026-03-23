"use client";

import { Tooltip } from "@/components/ui/tooltip";
import type { ContextBucket } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Context distribution ── */

export function ContextDistributionChart({
  data,
  onSelect,
  selection,
}: ChartProps<ContextBucket[]>) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.count));
  const activeLabel =
    selection?.type === "contextRange" ? selection.label : null;

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="flex h-36 items-end gap-1 bg-background px-4 pt-4 pb-2 sm:h-48 md:h-56">
        {data.map((d) => {
          const isActive = d.label === activeLabel;
          return (
            <Tooltip key={d.label} content={`${d.label}: ${d.count} models`}>
              <div
                className={cn(
                  "flex-1 cursor-pointer rounded-t transition-all duration-150",
                  isActive
                    ? "bg-purple-500/50"
                    : activeLabel
                      ? "bg-purple-500/10"
                      : "bg-purple-500/20 hover:bg-purple-500/40",
                )}
                style={{
                  height: `${max > 0 ? Math.max((d.count / max) * 100, 4) : 0}%`,
                }}
                onClick={() =>
                  onSelect({ type: "contextRange", label: d.label })
                }
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="flex border-border border-t">
        {data.map((d) => (
          <div key={d.label} className="flex-1 py-2 text-center">
            <div className="font-mono text-[10px] text-foreground">
              {d.count}
            </div>
            <div className="text-[9px] text-muted-foreground">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
