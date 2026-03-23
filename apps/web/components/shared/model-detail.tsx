import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { PERF_LABELS, REASONING_LABELS, SPEED_LABELS } from "@/lib/constants";
import { formatPrice } from "@/lib/format";

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
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-medium font-mono text-foreground text-lg">
          {value}
        </span>
        {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
      </div>
    </div>
  );
}

const RATING_LABEL_MAP: Record<string, string[]> = {
  Speed: SPEED_LABELS,
  Reasoning: REASONING_LABELS,
};

export function RatingCard({
  label,
  value,
  max,
  inheritedFrom,
}: {
  label: string;
  value?: number | null;
  max: number;
  inheritedFrom?: string;
}) {
  const labels = RATING_LABEL_MAP[label] ?? PERF_LABELS;
  const description =
    value != null ? (labels[value] ?? `${value}/${max}`) : "—";

  return (
    <div className="bg-background px-4 py-3">
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {label}
        {inheritedFrom && <InheritedBadge from={inheritedFrom} />}
      </div>
      {value != null ? (
        <Tooltip content={description}>
          <div className="mt-1 flex h-7 items-center gap-1.5">
            {Array.from({ length: max }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  i < value ? "bg-foreground" : "bg-border",
                )}
              />
            ))}
          </div>
        </Tooltip>
      ) : (
        <div className="mt-1 font-medium font-mono text-foreground text-lg">
          —
        </div>
      )}
    </div>
  );
}

export function DetailCell({
  label,
  value,
  href,
  icon,
  inheritedFrom,
  dateTime,
}: {
  label: string;
  value: string;
  href?: string;
  icon?: React.ReactNode;
  inheritedFrom?: string;
  /** Pass an ISO date string to render a semantic <time> element. */
  dateTime?: string;
}) {
  const Wrapper = href ? "a" : "span";
  const valueContent = dateTime ? (
    <time dateTime={dateTime}>{value}</time>
  ) : (
    value
  );
  return (
    <div className="flex items-center justify-between bg-background px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <Wrapper
          href={href}
          className={cn(
            "flex items-center gap-1.5 text-foreground",
            href &&
              "transition-colors duration-200 hover:text-accent-foreground",
          )}
        >
          {icon}
          {valueContent}
        </Wrapper>
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
