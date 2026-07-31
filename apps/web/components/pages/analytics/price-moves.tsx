"use client";

import { ProviderIcon } from "@/components/shared/provider-icon";
import type { PriceMove } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { formatDay, formatPrice } from "@/lib/format";
import { formatPct } from "@/lib/price-history";
import { Empty } from "./chart-utils";

export function PriceMoves({
  data,
}: {
  data: { cuts: PriceMove[]; raises: PriceMove[]; since: string };
}) {
  if (data.cuts.length === 0 && data.raises.length === 0) return <Empty />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Board title="Cuts" moves={data.cuts} direction="down" />
        <Board title="Raises" moves={data.raises} direction="up" />
      </div>
      <p className="text-muted-foreground/60 text-xs">
        Input price steps since {formatDay(data.since)}, per provider listing.
      </p>
    </div>
  );
}

function Board({
  title,
  moves,
  direction,
}: {
  title: string;
  moves: PriceMove[];
  direction: "up" | "down";
}) {
  const tone =
    direction === "down"
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="ring-border overflow-hidden rounded-md ring-1">
      <div className="border-border text-muted-foreground border-b px-4 py-2 text-xs">
        {title}
      </div>
      {moves.length === 0 ? (
        <p className="text-muted-foreground/60 px-4 py-6 text-center text-xs">
          None in this window
        </p>
      ) : (
        <div className="divide-border divide-y">
          {moves.map((m) => (
            <a
              key={`${m.provider}/${m.id}`}
              href={`/${m.provider}/${m.id}`}
              className="hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 transition-colors duration-200"
            >
              <ProviderIcon
                provider={m.icon ? { icon: m.icon } : null}
                size={14}
              />
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm">
                  {m.name}
                </span>
                <span className="text-muted-foreground/60 block truncate text-xs">
                  {m.providerName}
                </span>
              </span>
              <span className="text-muted-foreground/60 shrink-0 font-mono text-xs tabular-nums">
                {formatPrice(m.from)} → {formatPrice(m.to)}
              </span>
              <span
                className={cn(
                  "shrink-0 text-right font-mono text-xs tabular-nums",
                  tone,
                )}
                style={{ minWidth: "3.5rem" }}
              >
                {formatPct(m.pct)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
