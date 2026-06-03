"use client";

import type { LicenseCount } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { type ChartProps, Empty } from "./chart-utils";

/* ── License distribution ── */

const OPEN_LICENSES = new Set([
  "apache-2.0",
  "mit",
  "llama-community",
  "gemma",
  "qwen",
  "deepseek",
  "open-weight",
  "cc-by-4.0",
  "cc-by-sa-4.0",
]);

export function LicenseChart({
  data,
  onSelect,
  selection,
}: ChartProps<LicenseCount[]>) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.count));
  const activeLicense =
    selection?.type === "license" ? selection.license : null;

  return (
    <div className="ring-border overflow-hidden rounded-md ring-1">
      <div className="bg-background space-y-1 p-4">
        {data.map((d) => {
          const isOpen = OPEN_LICENSES.has(d.license);
          const isActive = d.license === activeLicense;
          return (
            <div
              key={d.license}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded px-1 transition-colors",
                isActive ? "bg-accent" : "hover:bg-accent",
              )}
              onClick={() => onSelect({ type: "license", license: d.license })}
            >
              <span className="text-muted-foreground w-24 shrink-0 truncate text-right text-xs">
                {d.license}
              </span>
              <div className="flex-1">
                <div
                  className={cn(
                    "h-5 rounded transition-all duration-150",
                    isOpen ? "bg-green-500/25" : "bg-purple-500/20",
                  )}
                  style={{
                    width: `${max > 0 ? (d.count / max) * 100 : 0}%`,
                    minWidth: d.count > 0 ? 2 : 0,
                  }}
                />
              </div>
              <span className="text-muted-foreground w-8 font-mono text-xs tabular-nums">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="border-border text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />{" "}
          Open
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />{" "}
          Proprietary
        </span>
      </div>
    </div>
  );
}
