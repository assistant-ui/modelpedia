"use client";

import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Calendar,
  CircleDollarSign,
  Coins,
  Database,
  Eye,
  FileText,
  Gauge,
  Hammer,
  Hash,
  Layers,
  Lightbulb,
  Maximize,
  MessageSquare,
  Package,
  Play,
  Puzzle,
  SlidersHorizontal,
  Tag,
  Timer,
  User,
  Zap,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PERF_LABELS, REASONING_LABELS, SPEED_LABELS } from "@/lib/constants";
import { formatPrice, formatTokens } from "@/lib/format";
import { ModelPicker } from "./model-picker";
import { ProviderIcon } from "./provider-icon";
import { Tooltip } from "./ui/tooltip";

interface CompareModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  providerIcon?: string;
  created_by?: string;
  creatorName?: string;
  creatorIcon?: string;
  family?: string;
  status?: string;
  model_type?: string;
  release_date?: string | null;
  context_window?: number | null;
  max_context_window?: number | null;
  max_output_tokens?: number | null;
  max_input_tokens?: number | null;
  knowledge_cutoff?: string | null;
  reasoning_tokens?: boolean;
  performance?: number;
  reasoning?: number;
  speed?: number;
  capabilities?: Record<string, boolean>;
  modalities?: { input?: string[]; output?: string[] };
  pricing?: {
    input?: number | null;
    output?: number | null;
    cache_write?: number | null;
    cached_input?: number | null;
    batch_input?: number | null;
    batch_output?: number | null;
  };
}

function CompareRow({
  icon: Icon,
  label,
  a,
  b,
}: {
  icon?: LucideIcon;
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 border-border border-t">
      <div className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground text-sm">
        {Icon && <Icon size={14} className="shrink-0" />}
        {label}
      </div>
      <div className="flex items-center border-border border-l px-4 py-2.5 font-mono text-foreground text-sm">
        {a ?? "—"}
      </div>
      <div className="flex items-center border-border border-l px-4 py-2.5 font-mono text-foreground text-sm">
        {b ?? "—"}
      </div>
    </div>
  );
}

function RatingDots({
  value,
  max = 5,
  labels,
}: {
  value?: number;
  max?: number;
  labels?: string[];
}) {
  if (value == null) return <span>—</span>;
  const description = labels?.[value] ?? `${value}/${max}`;
  return (
    <Tooltip content={description}>
      <span className="flex cursor-default gap-1">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < value ? "bg-foreground" : "bg-border"}`}
          />
        ))}
      </span>
    </Tooltip>
  );
}

function CapBadge({ supported }: { supported?: boolean }) {
  if (supported === undefined)
    return <span className="text-muted-foreground">—</span>;
  return supported ? (
    <span className="text-foreground">Yes</span>
  ) : (
    <span className="text-muted-foreground">No</span>
  );
}

const CAP_KEYS: [string, string, LucideIcon][] = [
  ["reasoning", "Reasoning", Brain],
  ["vision", "Vision", Eye],
  ["tool_call", "Tool calling", Hammer],
  ["streaming", "Streaming", Play],
  ["structured_output", "Structured output", Layers],
  ["json_mode", "JSON mode", FileText],
  ["fine_tuning", "Fine-tuning", SlidersHorizontal],
  ["batch", "Batch", Package],
];

function CompareInner({ models }: { models: CompareModel[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const modelA = searchParams.get("a");
  const modelB = searchParams.get("b");

  const a = modelA
    ? models.find((m) => `${m.provider}/${m.id}` === modelA)
    : null;
  const b = modelB
    ? models.find((m) => `${m.provider}/${m.id}` === modelB)
    : null;

  function setModels(aKey: string | null, bKey: string | null) {
    const params = new URLSearchParams();
    if (aKey) params.set("a", aKey);
    if (bKey) params.set("b", bKey);
    const qs = params.toString();
    router.push(qs ? `/compare?${qs}` : "/compare");
  }

  return (
    <div>
      <div className="mb-8 flex gap-4">
        <ModelPicker
          models={models}
          selected={modelA}
          onSelect={(key) => setModels(key, modelB)}
          label="Select model A"
        />
        <ModelPicker
          models={models}
          selected={modelB}
          onSelect={(key) => setModels(modelA, key)}
          label="Select model B"
        />
      </div>

      {a && b ? (
        <div className="overflow-hidden rounded-md ring-1 ring-border">
          <div className="grid grid-cols-3">
            <div className="px-4 py-3 text-muted-foreground text-xs uppercase tracking-wider" />
            <a
              href={`/${a.provider}/${a.id}`}
              className="flex min-w-0 items-center gap-2 border-border border-l px-4 py-3 transition-colors duration-200 hover:bg-accent"
            >
              <ProviderIcon
                provider={a.providerIcon ? { icon: a.providerIcon } : null}
                size={14}
              />
              <span className="truncate font-medium text-foreground text-sm">
                {a.name}
              </span>
            </a>
            <a
              href={`/${b.provider}/${b.id}`}
              className="flex min-w-0 items-center gap-2 border-border border-l px-4 py-3 transition-colors duration-200 hover:bg-accent"
            >
              <ProviderIcon
                provider={b.providerIcon ? { icon: b.providerIcon } : null}
                size={14}
              />
              <span className="truncate font-medium text-foreground text-sm">
                {b.name}
              </span>
            </a>
          </div>

          <CompareRow
            icon={User}
            label="Creator"
            a={
              <a
                href={`/${a.created_by}`}
                className="flex items-center gap-1.5 transition-colors duration-200 hover:text-accent-foreground"
              >
                <ProviderIcon
                  provider={a.creatorIcon ? { icon: a.creatorIcon } : null}
                  size={13}
                />
                {a.creatorName ?? a.created_by}
              </a>
            }
            b={
              <a
                href={`/${b.created_by}`}
                className="flex items-center gap-1.5 transition-colors duration-200 hover:text-accent-foreground"
              >
                <ProviderIcon
                  provider={b.creatorIcon ? { icon: b.creatorIcon } : null}
                  size={13}
                />
                {b.creatorName ?? b.created_by}
              </a>
            }
          />
          <CompareRow icon={Tag} label="Family" a={a.family} b={b.family} />
          <CompareRow
            icon={Hash}
            label="Type"
            a={a.model_type}
            b={b.model_type}
          />
          <CompareRow
            icon={Puzzle}
            label="Status"
            a={a.status ?? "—"}
            b={b.status ?? "—"}
          />
          <CompareRow
            icon={Calendar}
            label="Release date"
            a={a.release_date}
            b={b.release_date}
          />
          <CompareRow
            icon={MessageSquare}
            label="Context"
            a={a.context_window ? formatTokens(a.context_window) : null}
            b={b.context_window ? formatTokens(b.context_window) : null}
          />
          <CompareRow
            icon={Maximize}
            label="Max context"
            a={a.max_context_window ? formatTokens(a.max_context_window) : null}
            b={b.max_context_window ? formatTokens(b.max_context_window) : null}
          />
          <CompareRow
            icon={Maximize}
            label="Max output"
            a={a.max_output_tokens ? formatTokens(a.max_output_tokens) : null}
            b={b.max_output_tokens ? formatTokens(b.max_output_tokens) : null}
          />
          <CompareRow
            icon={Maximize}
            label="Max input"
            a={a.max_input_tokens ? formatTokens(a.max_input_tokens) : null}
            b={b.max_input_tokens ? formatTokens(b.max_input_tokens) : null}
          />
          <CompareRow
            icon={Timer}
            label="Knowledge cutoff"
            a={a.knowledge_cutoff}
            b={b.knowledge_cutoff}
          />
          <CompareRow
            icon={Lightbulb}
            label="Intelligence"
            a={<RatingDots value={a.performance} labels={PERF_LABELS} />}
            b={<RatingDots value={b.performance} labels={PERF_LABELS} />}
          />
          <CompareRow
            icon={Brain}
            label="Reasoning"
            a={<RatingDots value={a.reasoning} labels={REASONING_LABELS} />}
            b={<RatingDots value={b.reasoning} labels={REASONING_LABELS} />}
          />
          <CompareRow
            icon={Gauge}
            label="Speed"
            a={<RatingDots value={a.speed} labels={SPEED_LABELS} />}
            b={<RatingDots value={b.speed} labels={SPEED_LABELS} />}
          />

          <CompareRow
            icon={CircleDollarSign}
            label="Input price"
            a={formatPrice(a.pricing?.input)}
            b={formatPrice(b.pricing?.input)}
          />
          <CompareRow
            icon={CircleDollarSign}
            label="Output price"
            a={formatPrice(a.pricing?.output)}
            b={formatPrice(b.pricing?.output)}
          />
          <CompareRow
            icon={Database}
            label="Cache write"
            a={formatPrice(a.pricing?.cache_write)}
            b={formatPrice(b.pricing?.cache_write)}
          />
          <CompareRow
            icon={Database}
            label="Cache read"
            a={formatPrice(a.pricing?.cached_input)}
            b={formatPrice(b.pricing?.cached_input)}
          />
          <CompareRow
            icon={Coins}
            label="Batch input"
            a={formatPrice(a.pricing?.batch_input)}
            b={formatPrice(b.pricing?.batch_input)}
          />
          <CompareRow
            icon={Coins}
            label="Batch output"
            a={formatPrice(a.pricing?.batch_output)}
            b={formatPrice(b.pricing?.batch_output)}
          />
          <CompareRow
            icon={Zap}
            label="Reasoning tokens"
            a={
              a.reasoning_tokens != null
                ? a.reasoning_tokens
                  ? "Yes"
                  : "No"
                : null
            }
            b={
              b.reasoning_tokens != null
                ? b.reasoning_tokens
                  ? "Yes"
                  : "No"
                : null
            }
          />

          {CAP_KEYS.map(([key, label, capIcon]) => (
            <CompareRow
              key={key}
              icon={capIcon}
              label={label}
              a={<CapBadge supported={a.capabilities?.[key]} />}
              b={<CapBadge supported={b.capabilities?.[key]} />}
            />
          ))}

          <CompareRow
            icon={Play}
            label="Input modalities"
            a={a.modalities?.input?.join(", ")}
            b={b.modalities?.input?.join(", ")}
          />
          <CompareRow
            icon={Play}
            label="Output modalities"
            a={a.modalities?.output?.join(", ")}
            b={b.modalities?.output?.join(", ")}
          />
        </div>
      ) : (
        <div className="text-balance py-16 text-center text-muted-foreground text-sm">
          Select two models to compare
        </div>
      )}
    </div>
  );
}

export function ModelCompare({ models }: { models: CompareModel[] }) {
  return (
    <Suspense>
      <CompareInner models={models} />
    </Suspense>
  );
}
