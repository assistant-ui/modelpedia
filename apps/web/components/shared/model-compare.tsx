"use client";

import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Cable,
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
  Wrench,
  Zap,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ModelPicker } from "@/components/shared/model-picker";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { PERF_LABELS, REASONING_LABELS, SPEED_LABELS } from "@/lib/constants";
import type { ModelCapabilities } from "@/lib/data";
import { formatPrice, formatTokens } from "@/lib/format";

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
  capabilities?: ModelCapabilities;
  modalities?: { input?: string[]; output?: string[] };
  pricing?: {
    input?: number | null;
    output?: number | null;
    cache_write?: number | null;
    cached_input?: number | null;
    batch_input?: number | null;
    batch_output?: number | null;
  };
  tools?: string[];
  endpoints?: string[];
  [key: string]: unknown;
}

function CompareRow({
  icon: Icon,
  label,
  a,
  b,
  diff,
}: {
  icon?: LucideIcon;
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  diff?: boolean;
}) {
  const cell =
    "flex items-center border-border border-l px-4 py-2.5 font-mono text-foreground text-sm";
  const diffCls = diff ? " bg-yellow-500/8" : "";
  return (
    <div className="grid grid-cols-1 border-border border-t sm:grid-cols-3">
      <div className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground text-sm">
        {Icon && <Icon size={14} className="shrink-0" />}
        {label}
      </div>
      <div className={cn(cell, diffCls)}>{a ?? "—"}</div>
      <div className={cn(cell, diffCls)}>{b ?? "—"}</div>
    </div>
  );
}

function neq(a: unknown, b: unknown): boolean {
  return (a ?? null) !== (b ?? null);
}

function TagList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <span>—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((t) => (
        <span
          key={t}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
        >
          {t.replace(/_/g, " ")}
        </span>
      ))}
    </span>
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
            className={cn(
              "h-2 w-2 rounded-full",
              i < value ? "bg-foreground" : "bg-border",
            )}
          />
        ))}
      </span>
    </Tooltip>
  );
}

function optionalTokens(value?: number | null): string | null {
  return value ? formatTokens(value) : null;
}

function boolLabel(value?: boolean | null): string | null {
  if (value == null) return null;
  return value ? "Yes" : "No";
}

function CapBadge({ supported }: { supported?: boolean }) {
  if (supported === undefined)
    return <span className="text-muted-foreground">—</span>;
  return (
    <span className={supported ? "text-foreground" : "text-muted-foreground"}>
      {supported ? "Yes" : "No"}
    </span>
  );
}

function ModelHeader({ model }: { model: CompareModel }) {
  return (
    <a
      href={`/${model.provider}/${model.id}`}
      className="flex min-w-0 items-center gap-2 border-border border-l px-4 py-3 transition-colors duration-200 hover:bg-accent"
    >
      <ProviderIcon
        provider={model.providerIcon ? { icon: model.providerIcon } : null}
        size={14}
      />
      <span className="truncate font-medium text-foreground text-sm">
        {model.name}
      </span>
    </a>
  );
}

function CreatorLink({
  id,
  name,
  icon,
}: {
  id?: string;
  name?: string;
  icon?: string;
}) {
  return (
    <a
      href={`/${id}`}
      className="flex items-center gap-1.5 transition-colors duration-200 hover:text-accent-foreground"
    >
      <ProviderIcon provider={icon ? { icon } : null} size={13} />
      {name ?? id}
    </a>
  );
}

const CAP_KEYS: [keyof ModelCapabilities, string, LucideIcon][] = [
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
          <div className="grid grid-cols-1 sm:grid-cols-3">
            <div className="px-4 py-3 text-muted-foreground text-xs uppercase tracking-wider" />
            <ModelHeader model={a} />
            <ModelHeader model={b} />
          </div>

          <CompareRow
            icon={User}
            label="Creator"
            diff={neq(a.created_by, b.created_by)}
            a={
              <CreatorLink
                id={a.created_by}
                name={a.creatorName}
                icon={a.creatorIcon}
              />
            }
            b={
              <CreatorLink
                id={b.created_by}
                name={b.creatorName}
                icon={b.creatorIcon}
              />
            }
          />
          <CompareRow
            icon={Tag}
            label="Family"
            a={a.family}
            b={b.family}
            diff={neq(a.family, b.family)}
          />
          <CompareRow
            icon={Hash}
            label="Type"
            a={a.model_type}
            b={b.model_type}
            diff={neq(a.model_type, b.model_type)}
          />
          <CompareRow
            icon={Puzzle}
            label="Status"
            a={a.status}
            b={b.status}
            diff={neq(a.status, b.status)}
          />
          <CompareRow
            icon={Calendar}
            label="Release date"
            a={a.release_date}
            b={b.release_date}
            diff={neq(a.release_date, b.release_date)}
          />
          <CompareRow
            icon={MessageSquare}
            label="Context"
            a={optionalTokens(a.context_window)}
            b={optionalTokens(b.context_window)}
            diff={neq(a.context_window, b.context_window)}
          />
          <CompareRow
            icon={Maximize}
            label="Max context"
            a={optionalTokens(a.max_context_window)}
            b={optionalTokens(b.max_context_window)}
            diff={neq(a.max_context_window, b.max_context_window)}
          />
          <CompareRow
            icon={Maximize}
            label="Max output"
            a={optionalTokens(a.max_output_tokens)}
            b={optionalTokens(b.max_output_tokens)}
            diff={neq(a.max_output_tokens, b.max_output_tokens)}
          />
          <CompareRow
            icon={Maximize}
            label="Max input"
            a={optionalTokens(a.max_input_tokens)}
            b={optionalTokens(b.max_input_tokens)}
            diff={neq(a.max_input_tokens, b.max_input_tokens)}
          />
          <CompareRow
            icon={Timer}
            label="Knowledge cutoff"
            a={a.knowledge_cutoff}
            b={b.knowledge_cutoff}
            diff={neq(a.knowledge_cutoff, b.knowledge_cutoff)}
          />
          <CompareRow
            icon={Lightbulb}
            label="Intelligence"
            a={<RatingDots value={a.performance} labels={PERF_LABELS} />}
            b={<RatingDots value={b.performance} labels={PERF_LABELS} />}
            diff={neq(a.performance, b.performance)}
          />
          <CompareRow
            icon={Brain}
            label="Reasoning"
            a={<RatingDots value={a.reasoning} labels={REASONING_LABELS} />}
            b={<RatingDots value={b.reasoning} labels={REASONING_LABELS} />}
            diff={neq(a.reasoning, b.reasoning)}
          />
          <CompareRow
            icon={Gauge}
            label="Speed"
            a={<RatingDots value={a.speed} labels={SPEED_LABELS} />}
            b={<RatingDots value={b.speed} labels={SPEED_LABELS} />}
            diff={neq(a.speed, b.speed)}
          />

          <CompareRow
            icon={CircleDollarSign}
            label="Input price"
            a={formatPrice(a.pricing?.input)}
            b={formatPrice(b.pricing?.input)}
            diff={neq(a.pricing?.input, b.pricing?.input)}
          />
          <CompareRow
            icon={CircleDollarSign}
            label="Output price"
            a={formatPrice(a.pricing?.output)}
            b={formatPrice(b.pricing?.output)}
            diff={neq(a.pricing?.output, b.pricing?.output)}
          />
          <CompareRow
            icon={Database}
            label="Cache write"
            a={formatPrice(a.pricing?.cache_write)}
            b={formatPrice(b.pricing?.cache_write)}
            diff={neq(a.pricing?.cache_write, b.pricing?.cache_write)}
          />
          <CompareRow
            icon={Database}
            label="Cache read"
            a={formatPrice(a.pricing?.cached_input)}
            b={formatPrice(b.pricing?.cached_input)}
            diff={neq(a.pricing?.cached_input, b.pricing?.cached_input)}
          />
          <CompareRow
            icon={Coins}
            label="Batch input"
            a={formatPrice(a.pricing?.batch_input)}
            b={formatPrice(b.pricing?.batch_input)}
            diff={neq(a.pricing?.batch_input, b.pricing?.batch_input)}
          />
          <CompareRow
            icon={Coins}
            label="Batch output"
            a={formatPrice(a.pricing?.batch_output)}
            b={formatPrice(b.pricing?.batch_output)}
            diff={neq(a.pricing?.batch_output, b.pricing?.batch_output)}
          />
          <CompareRow
            icon={Zap}
            label="Reasoning tokens"
            a={boolLabel(a.reasoning_tokens)}
            b={boolLabel(b.reasoning_tokens)}
            diff={neq(a.reasoning_tokens, b.reasoning_tokens)}
          />

          {CAP_KEYS.map(([key, label, capIcon]) => (
            <CompareRow
              key={key}
              icon={capIcon}
              label={label}
              a={<CapBadge supported={a.capabilities?.[key]} />}
              b={<CapBadge supported={b.capabilities?.[key]} />}
              diff={neq(a.capabilities?.[key], b.capabilities?.[key])}
            />
          ))}

          <CompareRow
            icon={Play}
            label="Input modalities"
            a={a.modalities?.input?.join(", ")}
            b={b.modalities?.input?.join(", ")}
            diff={neq(
              a.modalities?.input?.join(","),
              b.modalities?.input?.join(","),
            )}
          />
          <CompareRow
            icon={Play}
            label="Output modalities"
            a={a.modalities?.output?.join(", ")}
            b={b.modalities?.output?.join(", ")}
            diff={neq(
              a.modalities?.output?.join(","),
              b.modalities?.output?.join(","),
            )}
          />

          <CompareRow
            icon={Wrench}
            label="Tools"
            a={<TagList items={a.tools} />}
            b={<TagList items={b.tools} />}
            diff={neq(a.tools?.join(","), b.tools?.join(","))}
          />
          <CompareRow
            icon={Cable}
            label="Endpoints"
            a={<TagList items={a.endpoints} />}
            b={<TagList items={b.endpoints} />}
            diff={neq(a.endpoints?.join(","), b.endpoints?.join(","))}
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
