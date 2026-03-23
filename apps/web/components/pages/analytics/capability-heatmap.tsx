"use client";
import React from "react";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Tooltip } from "@/components/ui/tooltip";
import type { CapabilityRow } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Capability heatmap ── */

const CAP_LABELS: Record<string, string> = {
  vision: "Vision",
  tool_call: "Tools",
  reasoning: "Reasoning",
  streaming: "Stream",
  structured_output: "JSON",
  fine_tuning: "Fine-tune",
};

function heatClass(pct: number, active: boolean): string {
  if (active)
    return "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100";
  if (pct === 0) return "bg-background text-muted-foreground";
  if (pct < 25)
    return "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400";
  if (pct < 50)
    return "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400";
  if (pct < 75)
    return "bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
  return "bg-blue-300 text-blue-800 dark:bg-blue-800 dark:text-blue-200";
}

export function CapabilityHeatmap({
  data,
  onSelect,
  selection,
}: ChartProps<CapabilityRow[]>) {
  if (data.length === 0) return <Empty />;
  const caps = Object.keys(CAP_LABELS);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-px overflow-hidden rounded-md bg-border ring-1 ring-border"
        style={{
          gridTemplateColumns: `1fr repeat(${caps.length}, 4rem)`,
        }}
      >
        {/* Header row */}
        <div className="bg-background px-3 py-2 text-muted-foreground text-xs">
          Provider
        </div>
        {caps.map((c) => (
          <div
            key={c}
            className="bg-background px-2 py-2 text-center text-[10px] text-muted-foreground"
          >
            {CAP_LABELS[c]}
          </div>
        ))}
        {/* Data rows */}
        {data.slice(0, 15).map((row) => (
          <React.Fragment key={row.provider}>
            <a
              href={`/${row.provider}`}
              className="flex items-center gap-2 bg-background px-3 py-2 text-sm transition-colors duration-200 hover:bg-accent"
            >
              <ProviderIcon
                provider={row.icon ? { icon: row.icon } : null}
                size={13}
              />
              <span className="truncate">{row.providerName}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                {row.modelCount}
              </span>
            </a>
            {caps.map((c) => {
              const active =
                selection?.type === "capability" &&
                selection.provider === row.provider &&
                selection.cap === c;
              return (
                <Tooltip
                  key={c}
                  content={`${row.providerName}: ${row.caps[c]}% support ${CAP_LABELS[c]}`}
                >
                  <button
                    type="button"
                    className={cn(
                      "flex cursor-pointer items-center justify-center bg-background py-2 text-center font-mono text-xs transition-all duration-150",
                      heatClass(row.caps[c], active),
                    )}
                    onClick={() =>
                      onSelect({
                        type: "capability",
                        provider: row.provider,
                        cap: c,
                      })
                    }
                  >
                    {row.caps[c] > 0 ? `${row.caps[c]}%` : "—"}
                  </button>
                </Tooltip>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
