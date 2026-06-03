"use client";

import { ProviderIcon } from "@/components/shared/provider-icon";
import type { ProviderModelCount } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Provider ranking ── */

export function ProviderRankingChart({
  data,
  onSelect,
  selection,
}: ChartProps<ProviderModelCount[]>) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.count));
  const activeProvider =
    selection?.type === "providerRank" ? selection.provider : null;

  return (
    <div className="ring-border overflow-hidden rounded-md ring-1">
      <div className="bg-background">
        {data.map((d, i) => (
          <div
            key={d.provider}
            className={cn(
              "hover:bg-accent flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-200",
              i > 0 && "border-border border-t",
              activeProvider === d.provider && "bg-accent",
            )}
            onClick={() =>
              onSelect({ type: "providerRank", provider: d.provider })
            }
          >
            <ProviderIcon
              provider={d.icon ? { icon: d.icon } : null}
              size={14}
            />
            <span className="text-foreground min-w-0 flex-1 truncate text-xs">
              {d.providerName}
            </span>
            <div className="w-20">
              <div
                className="h-1.5 rounded-full bg-blue-500/30"
                style={{ width: `${max > 0 ? (d.count / max) * 100 : 0}%` }}
              />
            </div>
            <span className="text-muted-foreground w-8 text-right font-mono text-xs tabular-nums">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
