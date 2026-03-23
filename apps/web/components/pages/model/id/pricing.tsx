import { PriceCell } from "@/components/shared/model-detail";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import type { ModelPricing } from "@/lib/data";

export function PricingSection({
  pricing,
  pricingNotes,
}: {
  pricing: ModelPricing;
  pricingNotes?: string[];
}) {
  if (!Object.values(pricing).some((v) => v != null)) return null;

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
              <div className="overflow-x-auto rounded-md ring-1 ring-border">
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
                        <td className="px-4 py-2.5 text-muted-foreground">
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
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-3 lg:grid-cols-6">
            <PriceCell label="Input" value={pricing.input} />
            <PriceCell label="Output" value={pricing.output} />
            <PriceCell label="Cache write" value={pricing.cache_write} />
            <PriceCell label="Cache read" value={pricing.cached_input} />
            <PriceCell label="Batch in" value={pricing.batch_input} />
            <PriceCell label="Batch out" value={pricing.batch_output} />
          </div>
          <PricingNotes notes={pricingNotes} className="mt-4" />
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
