import {
  Braces,
  Brain,
  Eye,
  GitCompareArrows,
  Hammer,
  History,
  Layers,
  Lightbulb,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiEndpoint } from "@/components/api-endpoint";
import { ChangeEntry } from "@/components/change-entry";
import { RenderMarkdown } from "@/components/markdown";
import {
  DetailCell,
  FamilyComparison,
  InheritedBadge,
  MetricCard,
  PriceCell,
  RatingCard,
} from "@/components/model-detail";
import { ModelIdCopy } from "@/components/model-id-copy";
import { OverlayPanel } from "@/components/overlay-panel";

import { ProviderIcon } from "@/components/provider-icon";
import { ButtonLink } from "@/components/ui/button";
import {
  allModels,
  getChanges,
  getModel,
  getModelWithInheritance,
  getProvider,
} from "@/lib/data";
import { formatPrice, formatTokens } from "@/lib/format";
import { normalizeModelId } from "@/lib/search";

type Params = { provider: string; id: string[] };

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

function parseIdSegments(segments: string[]): {
  modelId: string;
  isChanges: boolean;
} {
  const last = segments[segments.length - 1];
  if (last === "changes" && segments.length > 1) {
    return {
      modelId: decodeURIComponent(segments.slice(0, -1).join("/")),
      isChanges: true,
    };
  }
  return { modelId: decodeURIComponent(segments.join("/")), isChanges: false };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { provider, id } = await params;
  const { modelId, isChanges } = parseIdSegments(id);
  const model = getModel(provider, modelId);
  if (!model) return { title: "Not Found" };
  if (isChanges) {
    return { title: `Changes — ${model.name}` };
  }
  const ogUrl = `/api/og?provider=${provider}&id=${encodeURIComponent(modelId)}`;
  return {
    title: model.name,
    description:
      model.description ??
      `${model.name} — AI model by ${model.created_by}. View specs, pricing, and capabilities.`,
    openGraph: {
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
  };
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { provider, id: idSegments } = await params;
  const { modelId, isChanges } = parseIdSegments(idSegments);
  const _model = getModelWithInheritance(provider, modelId);
  if (!_model) return notFound();
  const model = _model;

  const providerInfo = getProvider(model.provider);
  const modelChanges = getChanges().filter(
    (e) => e.provider === provider && e.model === modelId,
  );

  function renderHeader(actions: React.ReactNode) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <a
            href={`/${model.provider}`}
            className="shrink-0 transition-opacity duration-200 hover:opacity-70"
          >
            <ProviderIcon provider={providerInfo} size={18} />
          </a>
          <h1 className="flex-1 font-medium text-foreground text-lg tracking-tight">
            {model.name}
          </h1>
          {model.status && model.status !== "active" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
              {model.status}
            </span>
          )}
          {actions}
        </div>
        {model.id !== model.name && (
          <div className="mt-1 break-all font-mono text-muted-foreground text-sm">
            {model.id}
          </div>
        )}
        {model.description && (
          <p className="mt-2 text-pretty text-muted-foreground leading-relaxed">
            <RenderMarkdown text={model.description} />
          </p>
        )}
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
    );
  }

  const changesOverlay = isChanges ? (
    <OverlayPanel
      backHref={`/${provider}/${modelId}`}
      header={
        <>
          <ButtonLink href={`/${model.provider}`} variant="ghost" size="icon">
            <ProviderIcon provider={providerInfo} size={18} />
          </ButtonLink>
          <h2 className="flex-1 font-medium text-foreground text-lg tracking-tight">
            {model.name}
          </h2>
          {model.status && model.status !== "active" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
              {model.status}
            </span>
          )}
        </>
      }
    >
      <div className="mb-4 text-muted-foreground text-sm">
        Changes · {modelChanges.length} entries
      </div>
      {modelChanges.length === 0 ? (
        <p className="text-pretty py-16 text-center text-muted-foreground">
          No changes recorded for this model.
        </p>
      ) : (
        <div className="space-y-2">
          {modelChanges.map((entry, i) => (
            <ChangeEntry
              key={`${entry.ts}-${i}`}
              entry={entry}
              provider={providerInfo}
              showModel={false}
            />
          ))}
        </div>
      )}
    </OverlayPanel>
  ) : null;

  const inherited = model.inheritedFields;
  const inh = (field: string) =>
    inherited?.has(field) ? model.inheritedFrom : undefined;

  const creatorProvider =
    model.created_by !== model.provider ? getProvider(model.created_by) : null;

  const originalModel = creatorProvider
    ? allModels.find(
        (m) =>
          m.provider === model.created_by &&
          (m.name === model.name ||
            normalizeModelId(m.id) === normalizeModelId(model.id) ||
            normalizeModelId(m.id) === normalizeModelId(model.name)),
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

  return (
    <>
      {renderHeader(
        <>
          <ButtonLink
            href={`/compare?a=${encodeURIComponent(`${model.provider}/${model.id}`)}`}
            variant="default"
            size="icon"
            title="Compare this model"
          >
            <GitCompareArrows size={14} />
          </ButtonLink>
          {modelChanges.length > 0 && (
            <ButtonLink
              href={`/${provider}/${modelId}/changes`}
              variant="default"
              size="icon"
              title="Change history"
            >
              <History size={14} />
            </ButtonLink>
          )}
          <ModelIdCopy
            groups={[
              {
                label: "Model ID",
                items: [
                  { label: model.id, value: model.id },
                  ...(model.alias
                    ? [{ label: "Alias", value: model.alias }]
                    : []),
                  ...(model.snapshots ?? []).map((s) => ({
                    label: "Snapshot",
                    value: s,
                  })),
                ],
              },
              {
                label: "API",
                items: [
                  {
                    label: "API endpoint",
                    value: `/v1/models/${model.provider}/${model.id}`,
                  },
                  ...(providerInfo?.api_url
                    ? [
                        {
                          label: "Provider API",
                          value: providerInfo.api_url,
                        },
                      ]
                    : []),
                ],
              },
            ]}
          />
        </>,
      )}

      <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-4">
        <RatingCard
          label="Intelligence"
          value={model.performance}
          max={5}
          inheritedFrom={inh("performance")}
        />
        <RatingCard
          label="Reasoning"
          value={model.reasoning}
          max={5}
          inheritedFrom={inh("reasoning")}
        />
        <RatingCard
          label="Speed"
          value={model.speed}
          max={5}
          inheritedFrom={inh("speed")}
        />
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
          label="Max context"
          value={
            model.max_context_window != null
              ? formatTokens(model.max_context_window)
              : "—"
          }
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
          value={formatPrice(model.pricing?.input)}
          sub={model.pricing?.input != null ? "/1M tokens" : undefined}
          inheritedFrom={inh("pricing")}
        />
        <MetricCard
          label="Output price"
          value={formatPrice(model.pricing?.output)}
          sub={model.pricing?.output != null ? "/1M tokens" : undefined}
          inheritedFrom={inh("pricing")}
        />
      </div>

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

      {model.pricing && Object.values(model.pricing).some((v) => v != null) && (
        <>
          <div className="mb-4 text-muted-foreground text-sm">
            Pricing <span className="text-muted-foreground">per 1M tokens</span>
          </div>
          <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-3 lg:grid-cols-6">
            <PriceCell label="Input" value={model.pricing.input} />
            <PriceCell label="Output" value={model.pricing.output} />
            <PriceCell label="Cache write" value={model.pricing.cache_write} />
            <PriceCell label="Cache read" value={model.pricing.cached_input} />
            <PriceCell label="Batch in" value={model.pricing.batch_input} />
            <PriceCell label="Batch out" value={model.pricing.batch_output} />
          </div>
        </>
      )}

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

      <div className="mb-4 text-muted-foreground text-sm">API</div>
      <ApiEndpoint
        path={`/v1/models/${model.provider}/${model.id}`}
        tryPath={`https://api.modelpedia.dev/v1/models/${model.provider}/${model.id}`}
      />

      {changesOverlay}
    </>
  );
}
