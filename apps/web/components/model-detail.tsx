import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { CAP_BADGES, PERF_LABELS, SPEED_LABELS } from "@/lib/constants";
import { formatPrice, formatTokens } from "@/lib/format";

export function InheritedBadge({ from }: { from?: string }) {
  return (
    <Tooltip content={`Inherited from ${from ?? "official model data"}`}>
      <span className="inline-flex shrink-0 cursor-help text-muted-foreground/50">
        <Info size={12} />
      </span>
    </Tooltip>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  inheritedFrom,
}: {
  label: string;
  value: string;
  sub?: string;
  inheritedFrom?: string;
}) {
  return (
    <div className="bg-background px-4 py-3">
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {label}
        {inheritedFrom && <InheritedBadge from={inheritedFrom} />}
      </div>
      <div className="mt-1 font-medium font-mono text-foreground text-lg">
        {value}
      </div>
      {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
    </div>
  );
}

export function RatingCard({
  label,
  value,
  max,
  inheritedFrom,
}: {
  label: string;
  value: number;
  max: number;
  inheritedFrom?: string;
}) {
  const labels = label === "Speed" ? SPEED_LABELS : PERF_LABELS;
  const description = labels[value] ?? `${value}/${max}`;

  return (
    <div className="bg-background px-4 py-3">
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {label}
        {inheritedFrom && <InheritedBadge from={inheritedFrom} />}
      </div>
      <Tooltip content={description}>
        <div className="mt-2 flex items-center gap-1.5">
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${i < value ? "bg-foreground" : "bg-border"}`}
            />
          ))}
        </div>
      </Tooltip>
    </div>
  );
}

export function DetailCell({
  label,
  value,
  href,
  icon,
  inheritedFrom,
}: {
  label: string;
  value: string;
  href?: string;
  icon?: React.ReactNode;
  inheritedFrom?: string;
}) {
  return (
    <div className="flex items-center justify-between bg-background px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        {href ? (
          <a
            href={href}
            className="flex items-center gap-1.5 text-foreground transition-colors duration-200 hover:text-accent-foreground"
          >
            {icon}
            {value}
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-foreground">
            {icon}
            {value}
          </span>
        )}
        {inheritedFrom && <InheritedBadge from={inheritedFrom} />}
      </span>
    </div>
  );
}

export function PriceCell({
  label,
  value,
}: {
  label: string;
  value?: number | null;
}) {
  return (
    <div className="bg-background px-4 py-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 font-medium font-mono text-foreground">
        {formatPrice(value)}
      </div>
    </div>
  );
}

function MiniDots({ value, max = 5 }: { value?: number; max?: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < value ? "bg-foreground" : "bg-border"}`}
        />
      ))}
    </span>
  );
}

export function FamilyComparison({
  models,
  currentId,
  provider,
}: {
  models: typeof import("@/lib/data").allModels;
  currentId: string;
  provider: string;
}) {
  return (
    <div className="mb-8 overflow-x-auto rounded-md ring-1 ring-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="px-4 py-2 text-left font-normal">Model</th>
            <th className="hidden px-3 py-2 text-center font-normal sm:table-cell">
              Perf
            </th>
            <th className="hidden px-3 py-2 text-center font-normal sm:table-cell">
              Speed
            </th>
            <th className="px-3 py-2 text-right font-normal">Context</th>
            <th className="px-3 py-2 text-right font-normal">Max out</th>
            <th className="px-3 py-2 text-right font-normal">Input</th>
            <th className="px-3 py-2 text-right font-normal">Output</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const isCurrent = m.id === currentId;
            const caps = m.capabilities as Record<string, boolean> | undefined;
            const deprecated = m.status === "deprecated";

            return (
              <tr
                key={m.id}
                className={`border-border border-t ${isCurrent ? "bg-accent" : ""} ${deprecated ? "opacity-50" : ""}`}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {isCurrent ? (
                      <span className="font-medium text-foreground">
                        {m.name}
                      </span>
                    ) : (
                      <a
                        href={`/${provider}/${m.id}`}
                        className="text-foreground transition-colors duration-200 hover:text-accent-foreground"
                      >
                        {m.name}
                      </a>
                    )}
                    <span className="flex gap-0.5">
                      {CAP_BADGES.map(([key, letter]) =>
                        caps?.[key] ? (
                          <span
                            key={key}
                            className="flex h-3.5 w-3.5 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground"
                          >
                            {letter}
                          </span>
                        ) : null,
                      )}
                    </span>
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <MiniDots value={m.performance} />
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <MiniDots value={m.speed} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground text-xs tabular-nums">
                  {m.context_window != null
                    ? formatTokens(m.context_window)
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground text-xs tabular-nums">
                  {m.max_output_tokens != null
                    ? formatTokens(m.max_output_tokens)
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground tabular-nums">
                  {formatPrice(m.pricing?.input)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                  {formatPrice(m.pricing?.output)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
