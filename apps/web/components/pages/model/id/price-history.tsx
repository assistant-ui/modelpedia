"use client";

import { useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatDay, formatDayShort, formatPriceExact } from "@/lib/format";
import {
  buildSegments,
  formatPct,
  type PriceField,
  type PricePoint,
  PRICE_FIELDS,
  priceDelta,
} from "@/lib/price-history";

const CUT = "text-green-600 dark:text-green-400";
const RAISE = "text-red-600 dark:text-red-400";

export function PriceHistory({
  points,
  fields,
  defaultField,
  inheritedFrom,
  provider,
  today,
}: {
  points: PricePoint[];
  fields: PriceField[];
  defaultField: PriceField;
  inheritedFrom?: string;
  provider: string;
  today: string;
}) {
  const [field, setField] = useState<PriceField>(defaultField);
  const active = fields.includes(field) ? field : defaultField;
  const label =
    PRICE_FIELDS.find((f) => f.key === active)?.label ?? (active as string);
  const { segments } = buildSegments(points, active, today);
  const delta = priceDelta(points, active);
  const spansYears = points[0].date.slice(0, 4) !== today.slice(0, 4);
  // A step narrower than this cannot hold a price without colliding with its
  // neighbour; the tooltip still covers those.
  const labelled = (seg: (typeof segments)[number]) =>
    seg.value != null && (seg.isLast || seg.width >= 7);

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          Price history
          <span className="text-muted-foreground/60">
            {" "}
            · $/1M {label.toLowerCase()}
          </span>
          {inheritedFrom && (
            <span className="text-muted-foreground/60">
              {" "}
              · inherited from {inheritedFrom}
            </span>
          )}
        </span>
        {fields.length > 1 && (
          <div className="bg-muted ring-border flex rounded-md text-xs ring-1">
            {fields.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setField(key)}
                className={cn(
                  "px-2.5 py-1 transition-colors duration-200",
                  key === active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {PRICE_FIELDS.find((f) => f.key === key)?.label ?? key}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ring-border overflow-hidden rounded-md ring-1">
        <div className="bg-background flex h-32 items-end px-4 pt-7 sm:h-40">
          {segments.map((seg, i) => (
            <Tooltip
              key={`step-${i}`}
              content={
                <span className="font-mono">
                  {formatPriceExact(seg.value)} · {formatDay(seg.start)}
                  {seg.isLast ? " → now" : ` → ${formatDay(seg.end)}`}
                </span>
              }
            >
              <div
                className="border-background flex h-full cursor-default flex-col justify-end border-l first:border-l-0"
                style={{ width: `${seg.width}%` }}
              >
                <div
                  className={cn(
                    "relative rounded-t-[2px] transition-colors duration-150",
                    seg.isLast
                      ? "bg-foreground/70 hover:bg-foreground"
                      : "bg-foreground/20 hover:bg-foreground/40",
                  )}
                  style={{ height: `${seg.height}%` }}
                >
                  {labelled(seg) && (
                    <span
                      className={cn(
                        "text-foreground absolute -top-5 font-mono text-[11px] whitespace-nowrap tabular-nums",
                        seg.isLast ? "right-0" : "left-0",
                      )}
                    >
                      {formatPriceExact(seg.value)}
                    </span>
                  )}
                </div>
              </div>
            </Tooltip>
          ))}
        </div>
        <div className="border-border text-muted-foreground flex overflow-hidden border-t px-4 py-2 text-[10px]">
          {segments.map((seg, i) => (
            <span
              key={`axis-${i}`}
              className={cn(
                "whitespace-nowrap",
                seg.isLast && "flex-1 text-right",
              )}
              style={seg.isLast ? undefined : { width: `${seg.width}%` }}
            >
              {labelled(seg) ? formatDayShort(seg.start, spansYears) : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="ring-border overflow-x-auto rounded-md ring-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="px-4 py-2 text-left font-normal">Date</th>
              {fields.map((key) => (
                <th key={key} className="px-4 py-2 text-right font-normal">
                  {PRICE_FIELDS.find((f) => f.key === key)?.label ?? key}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-normal">Change</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, i) => (
              <Row
                key={`${point.date}-${i}`}
                point={point}
                previous={points[i - 1]}
                fields={fields}
                active={active}
                provider={provider}
              />
            ))}
          </tbody>
        </table>
      </div>

      {delta && (
        <p className="text-muted-foreground text-xs">
          {label} is{" "}
          <span className={delta.pct < 0 ? CUT : RAISE}>
            {formatPct(delta.pct)}
          </span>{" "}
          since {formatDay(delta.since)}, from {formatPriceExact(delta.from)} to{" "}
          {formatPriceExact(delta.to)} per 1M tokens.
        </p>
      )}
    </div>
  );
}

function Row({
  point,
  previous,
  fields,
  active,
  provider,
}: {
  point: PricePoint;
  previous: PricePoint | undefined;
  fields: PriceField[];
  active: PriceField;
  provider: string;
}) {
  const from = previous?.[active];
  const to = point[active];
  const pct =
    typeof from === "number" && typeof to === "number" && from !== 0
      ? ((to - from) / from) * 100
      : null;

  return (
    <tr className="border-border border-t">
      <td className="px-4 py-2.5">
        <span className="text-muted-foreground">{formatDay(point.date)}</span>
        {point.commit && (
          <a
            href={`https://github.com/assistant-ui/modelpedia/commit/${point.commit}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/50 hover:text-muted-foreground ml-2 font-mono text-xs transition-colors duration-200"
          >
            {point.commit.slice(0, 7)}
          </a>
        )}
        {point.tiers && (
          <span
            className="text-muted-foreground/50 ml-2 text-xs"
            title={`Tier tables updated on ${provider}`}
          >
            tiers updated
          </span>
        )}
      </td>
      {fields.map((key) => (
        <td
          key={key}
          className={cn(
            "px-4 py-2.5 text-right font-mono tabular-nums",
            key === active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {formatPriceExact(point[key])}
        </td>
      ))}
      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
        {pct == null ? (
          <span className="text-muted-foreground/50">
            {point.introduced ? "introduced" : "—"}
          </span>
        ) : (
          <span className={pct < 0 ? CUT : RAISE}>{formatPct(pct)}</span>
        )}
      </td>
    </tr>
  );
}
