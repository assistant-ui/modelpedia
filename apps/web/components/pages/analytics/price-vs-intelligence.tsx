"use client";

import { useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { PriceVsIntelligencePoint } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  type ChartProps,
  Empty,
  handleChartKeyDown,
  PERF_COLORS,
  PERF_LABELS,
} from "./chart-utils";

/* ── Price vs Intelligence ── */

export function PriceVsIntelligence({
  data,
  onSelect,
  selection,
}: ChartProps<PriceVsIntelligencePoint[]>) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  if (data.length === 0) return <Empty />;

  const sorted = [...data].sort((a, b) => a.input - b.input);
  const maxPrice = Math.max(...data.map((d) => d.input));
  const logMax = Math.log10(maxPrice + 1);
  const hasModelSel = selection?.type === "model";
  const selectByIdx = (i: number) =>
    onSelect({ type: "model", id: sorted[i].id });

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div
        role="toolbar"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: toolbar is interactive
        tabIndex={0}
        ref={containerRef}
        onKeyDown={(e: React.KeyboardEvent) =>
          handleChartKeyDown(e, data.length, focusIdx, setFocusIdx, selectByIdx)
        }
        onFocus={() => focusIdx < 0 && setFocusIdx(0)}
        className="relative h-48 bg-background sm:h-64 md:h-80"
        style={{ padding: "1rem 1rem 1rem 2.5rem" }}
      >
        {[1, 2, 3, 4, 5].map((v) => {
          const y = 8 + (v / 5) * 80;
          return (
            <div key={v}>
              <div
                className="pointer-events-none absolute left-0"
                style={{ bottom: `${y}%`, transform: "translateY(50%)" }}
              >
                <span className="inline-block w-8 text-right text-[10px] text-muted-foreground/50">
                  {v}
                </span>
              </div>
              <div
                className="pointer-events-none absolute right-4 left-10 border-border/30 border-t"
                style={{ bottom: `${y}%` }}
              />
            </div>
          );
        })}
        {data.map((d) => {
          const xPct =
            logMax > 0 ? (Math.log10(d.input + 1) / logMax) * 100 : 50;
          const yPct = 8 + (d.performance / 5) * 80;
          const isHovered = hovered === d.id;
          const isActive =
            hasModelSel && (selection as { id: string }).id === d.id;
          const isFocused = sorted[focusIdx]?.id === d.id;
          return (
            <Tooltip
              key={d.id}
              content={`${d.name} (${d.providerName}) — $${d.input}/M`}
            >
              <div
                className={cn(
                  "absolute cursor-pointer rounded-full transition-all duration-150",
                  PERF_COLORS[d.performance] ?? "bg-foreground",
                  isActive
                    ? "z-20 h-3 w-3 opacity-100"
                    : isFocused || isHovered
                      ? "z-10 h-2.5 w-2.5 opacity-100"
                      : hasModelSel
                        ? "h-2 w-2 opacity-15"
                        : "h-2 w-2 opacity-70",
                )}
                style={{
                  left: `${5 + (xPct / 100) * 90}%`,
                  bottom: `${yPct}%`,
                  transform: "translate(-50%, 50%)",
                }}
                onMouseEnter={() => setHovered(d.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect({ type: "model", id: d.id })}
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-border border-t px-4 py-2 text-muted-foreground text-xs">
        <span>Low price</span>
        <div className="hidden items-center gap-3 sm:flex">
          {[1, 2, 3, 4, 5].map((v) => (
            <span key={v} className="flex items-center gap-1">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  PERF_COLORS[v],
                )}
              />
              <span className="text-[10px]">{PERF_LABELS[v]}</span>
            </span>
          ))}
        </div>
        <span>High price</span>
      </div>
    </div>
  );
}
