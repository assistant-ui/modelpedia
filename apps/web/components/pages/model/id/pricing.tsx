import { PriceHistory } from "@/components/pages/model/id/price-history";
import { PriceCell } from "@/components/shared/model-detail";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import type { ModelPricing } from "@/lib/data";
import {
  latestPriceDelta,
  type ResolvedPriceHistory,
} from "@/lib/price-history";

export function PricingSection({
  pricing,
  pricingNotes,
  fastModePricing,
  history,
  provider,
  today,
}: {
  pricing: ModelPricing;
  pricingNotes?: string[];
  fastModePricing?: { input: number; output: number };
  history?: ResolvedPriceHistory | null;
  provider: string;
  today: string;
}) {
  if (!Object.values(pricing).some((v) => v != null)) return null;

  const has1hCache = pricing.cache_write_1h != null;
  const cacheWriteLabel = has1hCache ? "Cache write (5m)" : "Cache write";
  const delta = history
    ? (field: Parameters<typeof latestPriceDelta>[1]) =>
        latestPriceDelta(history.points, field)
    : () => null;

  return (
    <Section id="pricing" title="Pricing">
      {pricing.tiers?.length ? (
        <div className="space-y-6">
          {pricing.tiers.map((tier) => (
            <div key={tier.label}>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-foreground text-sm">{tier.label}</span>
                <span className="text-muted-foreground text-xs">
                  {tier.unit}
                </span>
              </div>
              <div className="ring-border overflow-x-auto rounded-md ring-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs">
                      <th className="px-4 py-2 text-left font-normal" />
                      {tier.columns.map((col) => (
                        <th
                          key={col}
                          className="px-4 py-2 text-right font-normal"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tier.rows.map((row) => (
                      <tr key={row.label} className="border-border border-t">
                        <td className="text-muted-foreground px-4 py-2.5">
                          {row.label}
                        </td>
                        {row.values.map((val, i) => (
                          <td
                            key={tier.columns[i]}
                            className="px-4 py-2.5 text-right font-mono tabular-nums"
                          >
                            {val != null ? `$${val}` : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <PricingNotes notes={pricingNotes} />
          {history && (
            <PriceHistory
              points={history.points}
              fields={history.fields}
              inheritedFrom={history.inheritedFrom}
              provider={provider}
              today={today}
            />
          )}
        </div>
      ) : (
        <>
          <div className="bg-border ring-border grid grid-cols-2 gap-px overflow-hidden rounded-md ring-1 sm:grid-cols-3 lg:grid-cols-6">
            <PriceCell
              label="Input"
              value={pricing.input}
              delta={delta("input")}
            />
            <PriceCell
              label="Output"
              value={pricing.output}
              delta={delta("output")}
            />
            <PriceCell
              label={cacheWriteLabel}
              value={pricing.cache_write}
              delta={delta("cache_write")}
            />
            {has1hCache && (
              <PriceCell
                label="Cache write (1h)"
                value={pricing.cache_write_1h}
                delta={delta("cache_write_1h")}
              />
            )}
            <PriceCell
              label="Cache read"
              value={pricing.cached_input}
              delta={delta("cached_input")}
            />
            <PriceCell
              label="Batch in"
              value={pricing.batch_input}
              delta={delta("batch_input")}
            />
            <PriceCell
              label="Batch out"
              value={pricing.batch_output}
              delta={delta("batch_output")}
            />
          </div>
          {fastModePricing && (
            <div className="ring-border mt-4 rounded-md ring-1">
              <div className="border-border border-b px-4 py-2 text-xs">
                <span className="text-foreground">Fast mode</span>{" "}
                <span className="text-muted-foreground">
                  (beta, research preview)
                </span>
              </div>
              <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-b-md">
                <PriceCell label="Input" value={fastModePricing.input} />
                <PriceCell label="Output" value={fastModePricing.output} />
              </div>
            </div>
          )}
          <PricingNotes notes={pricingNotes} className="mt-4" />
          {history && (
            <PriceHistory
              points={history.points}
              fields={history.fields}
              inheritedFrom={history.inheritedFrom}
              provider={provider}
              today={today}
            />
          )}
        </>
      )}
    </Section>
  );
}

function PricingNotes({
  notes,
  className,
}: {
  notes?: string[];
  className?: string;
}) {
  if (!notes?.length) return null;
  return (
    <div className={cn("space-y-1", className)}>
      {notes.map((note) => (
        <p
          key={note.slice(0, 40)}
          className="text-muted-foreground text-xs leading-relaxed"
        >
          {note}
        </p>
      ))}
    </div>
  );
}
