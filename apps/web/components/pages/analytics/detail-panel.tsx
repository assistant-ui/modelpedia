"use client";

import { ArrowRight, Calendar, DollarSign, X, Zap } from "lucide-react";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Badge } from "@/components/ui/badge";
import type { AnalyticsModel, Selection } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { formatTokens, regionFlag } from "@/lib/format";

const PERF_LABELS = ["", "Basic", "Moderate", "Strong", "Advanced", "Frontier"];
const PERF_VARIANTS: Record<
  number,
  "red" | "orange" | "yellow" | "blue" | "green"
> = { 1: "red", 2: "orange", 3: "yellow", 4: "blue", 5: "green" };

const CAP_DISPLAY: Record<string, string> = {
  vision: "Vision",
  tool_call: "Tools",
  reasoning: "Reasoning",
  streaming: "Streaming",
  structured_output: "JSON",
  fine_tuning: "Fine-tune",
};

const PRICE_RANGES: Record<string, { min: number; max: number }> = {
  Free: { min: 0, max: 0 },
  "<$0.5": { min: 0.001, max: 0.5 },
  "$0.5–2": { min: 0.5, max: 2 },
  "$2–5": { min: 2, max: 5 },
  "$5–15": { min: 5, max: 15 },
  "$15–30": { min: 15, max: 30 },
  "$30+": { min: 30, max: Infinity },
};

const CTX_RANGES: Record<string, { min: number; max: number }> = {
  "<8K": { min: 0, max: 8_000 },
  "8-32K": { min: 8_000, max: 32_000 },
  "32-128K": { min: 32_000, max: 128_000 },
  "128-512K": { min: 128_000, max: 512_000 },
  "512K-1M": { min: 512_000, max: 1_000_000 },
  "1M+": { min: 1_000_000, max: Number.POSITIVE_INFINITY },
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CN: "China",
  CA: "Canada",
  FR: "France",
  GB: "United Kingdom",
};

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

export function DetailPanel({
  selection,
  models,
  onClose,
}: {
  selection: Selection;
  models: AnalyticsModel[];
  onClose: () => void;
}) {
  const content = renderContent(selection, models);
  if (!content) return null;

  return (
    <div className="relative overflow-hidden rounded-md bg-background shadow-lg ring-1 ring-border">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2.5 right-2.5 z-10 rounded bg-background/80 p-1 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        <X size={12} />
      </button>
      {content}
    </div>
  );
}

function renderContent(selection: Selection, models: AnalyticsModel[]) {
  if (selection.type === "model") {
    return renderModel(selection, models);
  }
  // All other types: filter models, group by provider, render
  const { filtered, header } = resolveSelection(selection, models);
  const grouped = groupByProvider(filtered);
  const totalProviders = grouped.length;

  return (
    <>
      {/* Header */}
      <div className="border-border border-b px-3 py-3 pr-8">
        <div className="font-medium text-foreground text-sm">
          {header.title}
        </div>
        {header.badges && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {header.badges.map((b) => (
              <Badge key={b.text} variant={b.variant ?? "muted"}>
                {b.text}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex border-border border-b">
        <div className="flex-1 px-3 py-2">
          <div className="font-mono text-foreground text-sm">
            {filtered.length}
          </div>
          <div className="text-[10px] text-muted-foreground">models</div>
        </div>
        <div className="flex-1 border-border border-l px-3 py-2">
          <div className="font-mono text-foreground text-sm">
            {totalProviders}
          </div>
          <div className="text-[10px] text-muted-foreground">providers</div>
        </div>
        {header.stat && (
          <div className="flex-1 border-border border-l px-3 py-2">
            <div className="font-mono text-foreground text-sm">
              {header.stat.value}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {header.stat.label}
            </div>
          </div>
        )}
      </div>

      {/* Grouped list */}
      <div className="max-h-[50vh] overflow-y-auto">
        {grouped.map((group, gi) => (
          <div key={group.provider}>
            {/* Provider section header */}
            <div
              className={cn(
                "flex items-center gap-2 bg-muted/30 px-3 py-1.5",
                gi > 0 && "border-border border-t",
              )}
            >
              <ProviderIcon
                provider={group.icon ? { icon: group.icon } : null}
                size={11}
              />
              <span className="flex-1 text-[10px] text-muted-foreground">
                {group.name}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {group.models.length}
              </span>
            </div>
            {/* Models in this provider */}
            {group.models.slice(0, 8).map((m) => (
              <a
                key={m.id}
                href={`/${m.id}`}
                className="flex items-center gap-2 border-border border-t px-3 py-1.5 transition-colors duration-200 hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate text-foreground text-xs">
                  {m.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {formatMeta(m, selection)}
                </span>
              </a>
            ))}
            {group.models.length > 8 && (
              <div className="border-border border-t px-3 py-1 text-[10px] text-muted-foreground">
                +{group.models.length - 8} more
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Model detail (single model card) ── */

function renderModel(
  selection: { type: "model"; id: string },
  models: AnalyticsModel[],
) {
  const m = models.find((m) => m.id === selection.id);
  if (!m) return null;

  return (
    <>
      <div className="border-border border-b px-3 py-3 pr-8">
        <div className="flex items-center gap-2">
          <ProviderIcon
            provider={m.providerIcon ? { icon: m.providerIcon } : null}
            size={16}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground text-sm">
              {m.name}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {m.providerName}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {m.performance != null && (
            <Badge variant={PERF_VARIANTS[m.performance]}>
              {PERF_LABELS[m.performance]}
            </Badge>
          )}
          {m.model_type && <Badge>{m.model_type}</Badge>}
          {m.open_weight && <Badge variant="green">open weight</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        {m.input != null && (
          <Stat icon={DollarSign} label="Input" value={`$${m.input}/M`} />
        )}
        {m.output != null && (
          <Stat icon={DollarSign} label="Output" value={`$${m.output}/M`} />
        )}
        {m.context_window != null && (
          <Stat
            icon={Zap}
            label="Context"
            value={formatTokens(m.context_window)}
          />
        )}
        {m.release_date && (
          <Stat icon={Calendar} label="Released" value={m.release_date} />
        )}
      </div>

      {m.caps.length > 0 && (
        <div className="flex flex-wrap gap-1 border-border border-t px-3 py-2.5">
          {m.caps.map((c) => (
            <Badge key={c} variant="blue">
              {CAP_DISPLAY[c] ?? c}
            </Badge>
          ))}
        </div>
      )}

      <a
        href={`/${m.id}`}
        className="flex items-center justify-center gap-1.5 border-border border-t px-3 py-2.5 text-muted-foreground text-xs transition-colors duration-200 hover:bg-accent hover:text-foreground"
      >
        View details <ArrowRight size={12} />
      </a>
    </>
  );
}

/* ── Selection resolver — returns filtered models + header config ── */

interface HeaderConfig {
  title: string;
  badges?: {
    text: string;
    variant?:
      | "muted"
      | "blue"
      | "green"
      | "purple"
      | "orange"
      | "red"
      | "yellow";
  }[];
  stat?: { label: string; value: string };
}

function resolveSelection(
  selection: Selection,
  models: AnalyticsModel[],
): { filtered: AnalyticsModel[]; header: HeaderConfig } {
  switch (selection.type) {
    case "month": {
      const { month, chart } = selection;
      let filtered = models.filter((m) => m.release_date?.startsWith(month));
      if (chart === "context") {
        filtered = filtered
          .filter((m) => m.context_window)
          .sort((a, b) => (b.context_window ?? 0) - (a.context_window ?? 0));
      }
      const openPct =
        filtered.length > 0
          ? Math.round(
              (filtered.filter((m) => m.open_weight).length / filtered.length) *
                100,
            )
          : 0;
      return {
        filtered,
        header: {
          title: month,
          badges: [
            {
              text:
                chart === "releases"
                  ? "releases"
                  : chart === "context"
                    ? "context"
                    : "open weight",
              variant:
                chart === "releases"
                  ? "blue"
                  : chart === "context"
                    ? "purple"
                    : "green",
            },
          ],
          stat: { label: "open weight", value: `${openPct}%` },
        },
      };
    }
    case "capability": {
      const filtered = models.filter(
        (m) =>
          m.provider === selection.provider && m.caps.includes(selection.cap),
      );
      const total = models.filter(
        (m) => m.provider === selection.provider,
      ).length;
      const pct = total > 0 ? Math.round((filtered.length / total) * 100) : 0;
      return {
        filtered,
        header: {
          title: CAP_DISPLAY[selection.cap] ?? selection.cap,
          badges: [
            {
              text: filtered[0]?.providerName ?? selection.provider,
              variant: "muted",
            },
          ],
          stat: { label: "coverage", value: `${pct}%` },
        },
      };
    }
    case "price": {
      const range = PRICE_RANGES[selection.label];
      const filtered = range
        ? models.filter((m) => {
            const p = m.input;
            if (p == null) return false;
            if (selection.label === "Free") return p === 0;
            return p >= range.min && p < range.max;
          })
        : [];
      return {
        filtered,
        header: {
          title: `${selection.label} /1M tokens`,
          badges: [{ text: "input price", variant: "green" }],
        },
      };
    }
    case "region": {
      const filtered = models.filter((m) => m.region === selection.region);
      return {
        filtered,
        header: {
          title: `${regionFlag(selection.region)} ${COUNTRY_NAMES[selection.region] ?? selection.region}`,
        },
      };
    }
    case "modelType": {
      const filtered = models.filter(
        (m) => (m.model_type ?? "other") === selection.modelType,
      );
      return {
        filtered,
        header: {
          title: selection.modelType,
          badges: [{ text: "model type", variant: "muted" }],
        },
      };
    }
    case "license": {
      const filtered = models.filter((m) => m.license === selection.license);
      const isOpen = OPEN_LICENSES.has(selection.license);
      return {
        filtered,
        header: {
          title: selection.license,
          badges: [
            {
              text: isOpen ? "open source" : "proprietary",
              variant: isOpen ? "green" : "purple",
            },
          ],
        },
      };
    }
    case "family": {
      const filtered = models.filter((m) => m.family === selection.family);
      return {
        filtered,
        header: {
          title: selection.family,
          badges: [{ text: "family", variant: "blue" }],
        },
      };
    }
    case "providerRank": {
      const filtered = models.filter((m) => m.provider === selection.provider);
      return {
        filtered,
        header: {
          title: filtered[0]?.providerName ?? selection.provider,
          badges: [{ text: "provider", variant: "muted" }],
        },
      };
    }
    case "contextRange": {
      const range = CTX_RANGES[selection.label];
      const filtered = range
        ? models.filter(
            (m) =>
              m.context_window != null &&
              m.context_window >= range.min &&
              m.context_window < range.max,
          )
        : [];
      return {
        filtered,
        header: {
          title: `${selection.label} context`,
          badges: [{ text: "context window", variant: "purple" }],
        },
      };
    }
    case "modality": {
      const inputSet = new Set(selection.input.split("+"));
      const outputSet = new Set(selection.output.split("+"));
      const filtered = models.filter((m) => {
        const mi = new Set(m.modalities_input ?? []);
        const mo = new Set(m.modalities_output ?? []);
        return (
          inputSet.size === mi.size &&
          [...inputSet].every((x) => mi.has(x)) &&
          outputSet.size === mo.size &&
          [...outputSet].every((x) => mo.has(x))
        );
      });
      return {
        filtered,
        header: {
          title: `${selection.input.replace(/\+/g, ", ")} → ${selection.output.replace(/\+/g, ", ")}`,
          badges: [{ text: "modality", variant: "blue" }],
        },
      };
    }
    default:
      return { filtered: [], header: { title: "Unknown" } };
  }
}

/* ── Helpers ── */

interface ProviderGroup {
  provider: string;
  name: string;
  icon?: string;
  models: AnalyticsModel[];
}

function groupByProvider(models: AnalyticsModel[]): ProviderGroup[] {
  const map = new Map<string, ProviderGroup>();
  for (const m of models) {
    const group = map.get(m.provider) ?? {
      provider: m.provider,
      name: m.providerName,
      icon: m.providerIcon,
      models: [],
    };
    group.models.push(m);
    map.set(m.provider, group);
  }
  return [...map.values()].sort((a, b) => b.models.length - a.models.length);
}

function formatMeta(m: AnalyticsModel, sel: Selection): string {
  if (sel.type === "price" && m.input != null) return `$${m.input}`;
  if (
    (sel.type === "contextRange" ||
      (sel.type === "month" && sel.chart === "context")) &&
    m.context_window
  )
    return formatTokens(m.context_window);
  if (m.input != null) return `$${m.input}/M`;
  return "";
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-background px-3 py-2.5">
      <Icon size={12} className="shrink-0 text-muted-foreground/50" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="font-mono text-foreground text-xs">{value}</div>
      </div>
    </div>
  );
}
