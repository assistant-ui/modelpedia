"use client";

import type { FamilyCount } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Top families (ranked list) ── */

export function TopFamiliesChart({
  data,
  onSelect,
  selection,
}: ChartProps<FamilyCount[]>) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.count));
  const activeFamily = selection?.type === "family" ? selection.family : null;

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="bg-background">
        {data.slice(0, 15).map((d, i) => (
          <div
            key={d.family}
            className={cn(
              "flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-200 hover:bg-accent",
              i > 0 && "border-border border-t",
              activeFamily === d.family && "bg-accent",
            )}
            onClick={() => onSelect({ type: "family", family: d.family })}
          >
            <span className="w-5 text-right font-mono text-[10px] text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-foreground text-xs">{d.family}</span>
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                {d.provider}
              </span>
            </div>
            <div className="w-16">
              <div
                className="h-1.5 rounded-full bg-blue-500/30"
                style={{ width: `${max > 0 ? (d.count / max) * 100 : 0}%` }}
              />
            </div>
            <span className="w-6 text-right font-mono text-muted-foreground text-xs tabular-nums">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
