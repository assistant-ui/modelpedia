"use client";

import type { Selection } from "@/lib/analytics";

export type OnSelect = (s: Selection) => void;
export type ChartProps<T> = {
  data: T;
  onSelect: OnSelect;
  selection: Selection | null;
};

/** Keyboard navigation handler for chart items */
export function handleChartKeyDown(
  e: React.KeyboardEvent,
  length: number,
  focusIdx: number,
  setFocusIdx: (i: number) => void,
  onSelectIdx: (i: number) => void,
) {
  if (length === 0) return;
  let next = focusIdx;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    next = focusIdx < length - 1 ? focusIdx + 1 : 0;
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    next = focusIdx > 0 ? focusIdx - 1 : length - 1;
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (focusIdx >= 0) onSelectIdx(focusIdx);
    return;
  } else {
    return;
  }
  setFocusIdx(next);
  onSelectIdx(next);
}

/** Summary stat cell used at top of charts */
export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-4 py-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-0.5 font-medium font-mono text-foreground text-lg">
        {value}
      </div>
    </div>
  );
}

/** Check if a month-based bar is active */
export function isMonthActive(
  sel: Selection | null,
  chart: string,
  month: string,
) {
  return sel?.type === "month" && sel.chart === chart && sel.month === month;
}

/** Performance level colors (1-5) */
export const PERF_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-blue-500",
  5: "bg-green-500",
};

export const PERF_LABELS = [
  "",
  "Basic",
  "Moderate",
  "Strong",
  "Advanced",
  "Frontier",
];

/** Pick ~4 nice round tick values for a context window Y-axis */
export function computeContextTicks(max: number): number[] {
  const steps = [
    1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000,
    512_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000, 16_000_000,
  ];
  const step = steps.find((s) => s * 4 >= max) ?? steps[steps.length - 1];
  const ticks: number[] = [];
  for (let v = step; v <= max; v += step) ticks.push(v);
  return ticks;
}

/** Empty chart state */
export function Empty() {
  return (
    <div className="rounded-md bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm ring-1 ring-border">
      Not enough data to display
    </div>
  );
}
