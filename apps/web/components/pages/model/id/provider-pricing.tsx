import { ProviderIcon } from "@/components/shared/provider-icon";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { formatPct, type PriceDelta } from "@/lib/price-history";

export interface ProviderPrice {
  provider: string;
  name: string;
  icon?: string;
  id: string;
  input?: number | null;
  output?: number | null;
  delta: PriceDelta | null;
  isCurrent: boolean;
}

export function ProviderPricing({ rows }: { rows: ProviderPrice[] }) {
  const priced = rows.filter((r) => typeof r.input === "number");
  const cheapest =
    priced.length > 1
      ? Math.min(...priced.map((r) => r.input as number))
      : null;

  return (
    <div className="ring-border overflow-x-auto rounded-md ring-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="px-4 py-2 text-left font-normal">Provider</th>
            <th className="px-4 py-2 text-right font-normal">Input</th>
            <th className="px-4 py-2 text-right font-normal">Output</th>
            <th className="px-4 py-2 text-right font-normal">Since launch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.provider}/${row.id}`}
              className={cn(
                "border-border border-t",
                row.isCurrent && "bg-muted/40",
              )}
            >
              <td className="px-4 py-2.5">
                <a
                  href={`/${row.provider}/${row.id}`}
                  className="text-foreground hover:text-accent-foreground inline-flex items-center gap-2 transition-colors duration-200"
                >
                  <ProviderIcon
                    provider={row.icon ? { icon: row.icon } : null}
                    size={14}
                  />
                  {row.name}
                </a>
                {row.input === cheapest && priced.length > 1 && (
                  <span className="text-muted-foreground/60 ml-2 text-xs">
                    cheapest
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatPrice(row.input)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatPrice(row.output)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                {row.delta ? (
                  <span
                    className={
                      row.delta.pct < 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {formatPct(row.delta.pct)}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
