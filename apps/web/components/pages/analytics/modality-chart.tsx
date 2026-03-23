"use client";

import type { ModalityCombo } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── Modality coverage ── */

export function ModalityChart({
  data,
  onSelect,
  selection,
}: ChartProps<ModalityCombo[]>) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.count));
  const activeKey =
    selection?.type === "modality"
      ? `${selection.input}→${selection.output}`
      : null;

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="bg-background">
        {data.map((d, i) => {
          const key = `${d.input}→${d.output}`;
          const isActive = key === activeKey;
          const pct = max > 0 ? (d.count / max) * 100 : 0;
          const fmtInput = d.input.replace(/\+/g, ", ");
          const fmtOutput = d.output.replace(/\+/g, ", ");
          return (
            <div
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-4 py-2.5 transition-colors duration-200 hover:bg-accent",
                i > 0 && "border-border border-t",
                isActive && "bg-accent",
              )}
              onClick={() =>
                onSelect({ type: "modality", input: d.input, output: d.output })
              }
            >
              <div className="min-w-0 flex-1">
                <span className="text-foreground text-xs">{fmtInput}</span>
                <span className="mx-1.5 text-muted-foreground/50">→</span>
                <span className="text-foreground text-xs">{fmtOutput}</span>
              </div>
              <div className="w-16">
                <div
                  className="h-1.5 rounded-full bg-blue-500/30"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-6 text-right font-mono text-muted-foreground text-xs tabular-nums">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
