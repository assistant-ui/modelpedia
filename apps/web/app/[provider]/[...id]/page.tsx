import {
  Braces,
  Brain,
  Eye,
  Hammer,
  Info,
  Layers,
  Lightbulb,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiEndpoint } from "@/components/api-endpoint";
import { RenderMarkdown } from "@/components/markdown";
import { ModelIdCopy } from "@/components/model-id-copy";
import { Tooltip } from "@/components/ui/tooltip";
import { Breadcrumb, formatTokens, ProviderIcon } from "@/components/views";
import type { EnrichedModel } from "@/lib/data";
import {
  allModels,
  getModel,
  getModelWithInheritance,
  getProvider,
} from "@/lib/data";

type Params = { provider: string; id: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { provider, id } = await params;
  const model = getModel(provider, decodeURIComponent(id.join("/")));
  return { title: model ? `${model.name} — AI Model Registry` : "Not Found" };
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { provider, id: idSegments } = await params;
  const modelId = decodeURIComponent(idSegments.join("/"));
  const model = getModelWithInheritance(provider, modelId);
  if (!model) return notFound();
  const inherited = model.inheritedFields;
  const inh = (field: string) =>
    inherited?.has(field) ? model.inheritedFrom : undefined;

  const providerInfo = getProvider(model.provider);
  const creatorProvider =
    model.created_by !== model.provider ? getProvider(model.created_by) : null;

  // Find the original model on the creator's provider
  // Normalize IDs for comparison: strip prefixes, dashes, version suffixes
  function normalizeId(id: string): string {
    return id
      .toLowerCase()
      .replace(/[@/]/g, "-")
      .replace(/-(?:vertex|bedrock|azure)$/, "")
      .replace(/^(?:openai-|meta-|anthropic-|google-)/, "")
      .replace(/-/g, "");
  }

  const originalModel = creatorProvider
    ? allModels.find(
        (m) =>
          m.provider === model.created_by &&
          (m.name === model.name ||
            normalizeId(m.id) === normalizeId(model.id) ||
            normalizeId(m.id) === normalizeId(model.name)),
      )
    : null;

  const familyModels = model.family
    ? allModels
        .filter(
          (m) =>
            m.family === model.family &&
            m.provider === model.provider &&
            !m.alias,
        )
        .sort((a, b) => (a.pricing?.input ?? 0) - (b.pricing?.input ?? 0))
    : [];

  const CAP_MAP = {
    vision: { label: "vision", icon: Eye },
    tool_call: { label: "tool call", icon: Hammer },
    structured_output: { label: "structured output", icon: Braces },
    reasoning: { label: "reasoning", icon: Brain },
    json_mode: { label: "json mode", icon: Lightbulb },
    streaming: { label: "streaming", icon: Play },
    fine_tuning: { label: "fine tuning", icon: SlidersHorizontal },
    batch: { label: "batch", icon: Layers },
  } as const;
  const CAP_KEYS = Object.keys(CAP_MAP) as (keyof typeof CAP_MAP)[];

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <ProviderIcon provider={providerInfo} size={18} />
          <h1 className="flex-1 font-medium text-foreground text-lg tracking-tight">
            {model.name}
          </h1>
          {model.status && model.status !== "active" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
              {model.status}
            </span>
          )}
          <ModelIdCopy
            ids={[
              model.id,
              ...(model.snapshots ?? []),
              ...(model.alias ? [model.alias] : []),
            ]}
          />
        </div>

        {/* API ID — only if different from display name */}
        {model.id !== model.name && (
          <div className="mt-1 font-mono text-muted-foreground text-sm">
            {model.id}
          </div>
        )}

        {model.description && (
          <p className="mt-2 text-muted-foreground leading-relaxed">
            <RenderMarkdown text={model.description} />
          </p>
        )}

        {/* Alias / Snapshots — inline tags */}
        {(model.alias || (model.snapshots && model.snapshots.length > 0)) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {model.alias && (
              <a
                href={`/${model.provider}/${model.alias}`}
                className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground ring-1 ring-border transition-colors duration-200 hover:text-foreground"
              >
                alias → {model.alias}
              </a>
            )}
            {model.snapshots?.map((s) => (
              <a
                key={s}
                href={`/${model.provider}/${s}`}
                className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground ring-1 ring-border transition-colors duration-200 hover:text-foreground"
              >
                {s}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Key metrics cards */}
      <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-3 lg:grid-cols-6">
        {model.performance != null && (
          <RatingCard
            label="Reasoning"
            value={model.performance}
            max={5}
            inheritedFrom={inh("performance")}
          />
        )}
        {model.speed != null && (
          <RatingCard
            label="Speed"
            value={model.speed}
            max={5}
            inheritedFrom={inh("speed")}
          />
        )}
        <MetricCard
          label="Context"
          value={
            model.context_window != null
              ? formatTokens(model.context_window)
              : "—"
          }
          inheritedFrom={inh("context_window")}
        />
        <MetricCard
          label="Max output"
          value={
            model.max_output_tokens != null
              ? formatTokens(model.max_output_tokens)
              : "—"
          }
          inheritedFrom={inh("max_output_tokens")}
        />
        <MetricCard
          label="Input price"
          value={model.pricing?.input != null ? `$${model.pricing.input}` : "—"}
          sub={model.pricing?.input != null ? "/1M tokens" : undefined}
          inheritedFrom={inh("pricing")}
        />
        <MetricCard
          label="Output price"
          value={
            model.pricing?.output != null ? `$${model.pricing.output}` : "—"
          }
          sub={model.pricing?.output != null ? "/1M tokens" : undefined}
          inheritedFrom={inh("pricing")}
        />
      </div>

      {/* Capabilities grid */}
      <div className="mb-4 text-muted-foreground text-sm">Capabilities</div>
      <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-4">
        {CAP_KEYS.map((key) => {
          const val = model.capabilities?.[key];
          const { label, icon: Icon } = CAP_MAP[key];
          const isInherited = inherited?.has(`capabilities.${key}`);
          return (
            <div
              key={key}
              className="flex items-center gap-2 bg-background px-3 py-2.5"
            >
              <Icon
                size={14}
                className={`shrink-0 ${val === true ? "text-foreground" : "text-muted-foreground/40"}`}
              />
              <span
                className={`flex-1 text-sm ${val === true ? "text-foreground" : "text-muted-foreground/40"}`}
              >
                {label}
              </span>
              {isInherited && <InheritedBadge from={model.inheritedFrom} />}
            </div>
          );
        })}
      </div>

      {/* Details */}
      <div className="mb-4 text-muted-foreground text-sm">Details</div>
      <div className="mb-8 grid gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2">
        <DetailCell
          label="Provider"
          value={providerInfo?.name ?? model.provider}
          href={`/${model.provider}`}
          icon={<ProviderIcon provider={providerInfo} size={14} />}
        />
        <DetailCell
          label="Creator"
          value={
            creatorProvider?.name ?? providerInfo?.name ?? model.created_by
          }
          href={
            originalModel
              ? `/${originalModel.provider}/${originalModel.id}`
              : creatorProvider
                ? `/${model.created_by}`
                : undefined
          }
          icon={
            <ProviderIcon
              provider={creatorProvider ?? providerInfo}
              size={14}
            />
          }
        />
        <DetailCell
          label="Family"
          value={model.family ?? "—"}
          href={
            model.family
              ? `/${model.provider}?family=${model.family}`
              : undefined
          }
        />
        <DetailCell
          label="Status"
          value={model.status ?? "—"}
          inheritedFrom={inh("status")}
        />
        <DetailCell
          label="Input modalities"
          value={model.modalities?.input?.join(", ") ?? "—"}
          inheritedFrom={inh("modalities")}
        />
        <DetailCell
          label="Output modalities"
          value={model.modalities?.output?.join(", ") ?? "—"}
          inheritedFrom={inh("modalities")}
        />
        <DetailCell
          label="Knowledge cutoff"
          value={model.knowledge_cutoff ?? "—"}
          inheritedFrom={inh("knowledge_cutoff")}
        />
        <DetailCell
          label="Release date"
          value={model.release_date ?? "—"}
          inheritedFrom={inh("release_date")}
        />
        <DetailCell
          label="Deprecation date"
          value={model.deprecation_date ?? "—"}
          inheritedFrom={inh("deprecation_date")}
        />
        <DetailCell label="Source" value={model.source} />
        <DetailCell label="Last updated" value={model.last_updated} />
        <DetailCell
          label="Max input"
          value={
            model.max_input_tokens != null
              ? `${formatTokens(model.max_input_tokens)} tokens`
              : "—"
          }
        />
      </div>

      {/* Pricing breakdown */}
      {model.pricing && Object.values(model.pricing).some((v) => v != null) && (
        <>
          <div className="mb-4 text-muted-foreground text-sm">
            Pricing <span className="text-muted-foreground">per 1M tokens</span>
          </div>
          <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-5">
            <PriceCell label="Input" value={model.pricing.input} />
            <PriceCell label="Output" value={model.pricing.output} />
            <PriceCell label="Cached" value={model.pricing.cached_input} />
            <PriceCell label="Batch in" value={model.pricing.batch_input} />
            <PriceCell label="Batch out" value={model.pricing.batch_output} />
          </div>
        </>
      )}

      {/* Family comparison */}
      {familyModels.length > 1 && (
        <>
          <div className="mb-4 text-muted-foreground text-sm">
            {model.family} family
          </div>
          <FamilyComparison
            models={familyModels}
            currentId={model.id}
            provider={model.provider}
          />
        </>
      )}

      {/* API */}
      <div className="mb-4 text-muted-foreground text-sm">API</div>
      <ApiEndpoint
        path={`/v1/models/${model.provider}/${model.id}`}
        tryPath={`https://api.ai-model.dev/v1/models/${model.provider}/${model.id}`}
      />
    </>
  );
}

function InheritedBadge({ from }: { from?: string }) {
  return (
    <Tooltip content={`Inherited from ${from ?? "official model data"}`}>
      <span className="inline-flex shrink-0 cursor-help text-muted-foreground/50">
        <Info size={12} />
      </span>
    </Tooltip>
  );
}

function MetricCard({
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

const SPEED_LABELS = ["", "Very slow", "Slow", "Normal", "Fast", "Very fast"];
const PERF_LABELS = ["", "Basic", "Good", "Strong", "Excellent", "Frontier"];

function RatingCard({
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

function DetailCell({
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

function PriceCell({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="bg-background px-4 py-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 font-medium font-mono text-foreground">
        {value != null ? `$${value}` : "—"}
      </div>
    </div>
  );
}

const CAP_BADGES: [string, string][] = [
  ["reasoning", "R"],
  ["vision", "V"],
  ["tool_call", "T"],
  ["streaming", "S"],
];

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

function FamilyComparison({
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
                {/* Name + caps */}
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

                {/* Performance */}
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <MiniDots value={m.performance} />
                </td>

                {/* Speed */}
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <MiniDots value={m.speed} />
                </td>

                {/* Context */}
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground text-xs tabular-nums">
                  {m.context_window != null
                    ? formatTokens(m.context_window)
                    : "—"}
                </td>

                {/* Max output */}
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground text-xs tabular-nums">
                  {m.max_output_tokens != null
                    ? formatTokens(m.max_output_tokens)
                    : "—"}
                </td>

                {/* Input price */}
                <td className="px-3 py-2.5 text-right font-mono text-foreground tabular-nums">
                  {m.pricing?.input != null ? `$${m.pricing.input}` : "—"}
                </td>

                {/* Output price */}
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                  {m.pricing?.output != null ? `$${m.pricing.output}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
