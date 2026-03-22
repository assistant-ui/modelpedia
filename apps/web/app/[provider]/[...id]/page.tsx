import {
  Braces,
  Brain,
  ExternalLink,
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
import { EndpointList, ToolList } from "@/components/endpoint-list";
import { RenderMarkdown } from "@/components/markdown";
import {
  DetailCell,
  FamilyComparison,
  InheritedBadge,
  OverviewGrid,
  PriceCell,
} from "@/components/model-detail";
import { ModelIdCopy } from "@/components/model-id-copy";
import { OverlayPanel } from "@/components/overlay-panel";
import { ProviderIcon } from "@/components/provider-icon";
import { SnapshotList } from "@/components/snapshot-list";
import { ButtonLink } from "@/components/ui/button";
import {
  allModels,
  getChanges,
  getModel,
  getModelWithInheritance,
  getProvider,
} from "@/lib/data";
import { formatTokens } from "@/lib/format";
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

  const providerInfo = getProvider(provider);
  const providerName = providerInfo?.name ?? provider;

  if (isChanges) {
    return {
      title: `Changes — ${model.name} (${providerName})`,
      description: `Change history for ${model.name} on ${providerName}.`,
    };
  }

  const ogUrl = `/api/og?provider=${provider}&id=${encodeURIComponent(modelId)}`;

  const priceParts: string[] = [];
  if (model.pricing?.input != null)
    priceParts.push(`$${model.pricing.input}/M input`);
  if (model.pricing?.output != null)
    priceParts.push(`$${model.pricing.output}/M output`);
  const priceStr = priceParts.length > 0 ? ` ${priceParts.join(", ")}.` : "";

  const ctxStr =
    model.context_window != null
      ? ` ${formatTokens(model.context_window)} context.`
      : "";

  const description =
    model.description ??
    `${model.name} by ${providerName}.${ctxStr}${priceStr} View specs, pricing, and capabilities.`;

  return {
    title: `${model.name} — ${providerName}`,
    description,
    alternates: {
      canonical: `/${provider}/${modelId}`,
    },
    openGraph: {
      title: `${model.name} — ${providerName}`,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      title: `${model.name} — ${providerName}`,
      description,
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

  const aliasOf =
    model.alias ??
    allModels.find(
      (m) =>
        m.provider === model.provider &&
        normalizeModelId(m.id) !== normalizeModelId(model.id) &&
        m.snapshots?.includes(model.id),
    )?.id ??
    null;

  const snapshots = model.snapshots?.filter(
    (s) => normalizeModelId(s) !== normalizeModelId(model.id),
  );

  function renderHeader(actions: React.ReactNode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <a
            href={`/${model.provider}`}
            className="shrink-0 transition-opacity duration-200 hover:opacity-70"
          >
            <ProviderIcon provider={providerInfo} size={20} />
          </a>
          <h1 className="font-medium text-foreground text-lg tracking-tight">
            {model.name}
          </h1>
          {model.model_type && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
              {model.model_type}
            </span>
          )}
          {model.status === "deprecated" && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-600 text-xs dark:text-red-400">
              deprecated
            </span>
          )}
          {model.status === "preview" && (
            <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 font-mono text-xs text-yellow-600 dark:text-yellow-400">
              preview
            </span>
          )}
          <span className="flex-1" />
          {actions}
        </div>
        {(model.description || model.tagline || model.successor) && (
          <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
            {model.description ? (
              <RenderMarkdown text={model.description} />
            ) : (
              model.tagline
            )}
            {model.successor && (
              <>
                {(model.description || model.tagline) && " · "}
                Succeeded by{" "}
                {(Array.isArray(model.successor)
                  ? model.successor
                  : [model.successor]
                ).map((s, i) => (
                  <span key={s}>
                    {i > 0 && " or "}
                    <a
                      href={`/${model.provider}/${s}`}
                      className="font-medium text-foreground transition-colors duration-200 hover:text-foreground/70"
                    >
                      {s}
                    </a>
                  </span>
                ))}
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  const changesOverlay = isChanges ? (
    <OverlayPanel
      backHref={`/${provider}/${modelId}`}
      header={
        <>
          <a
            href={`/${model.provider}`}
            className="shrink-0 transition-opacity duration-200 hover:opacity-70"
          >
            <ProviderIcon provider={providerInfo} size={20} />
          </a>
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
      subheader={
        <>
          {normalizeModelId(model.id) !== normalizeModelId(model.name) && (
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
      <div className="mb-8 space-y-4">
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
            {providerInfo?.playground_url && (
              <ButtonLink
                href={providerInfo.playground_url}
                variant="default"
                size="icon"
                title="Open Playground"
                target="_blank"
              >
                <ExternalLink size={14} />
              </ButtonLink>
            )}
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
                    ...(model.snapshots ?? [])
                      .filter((s) => s !== model.id)
                      .map((s) => ({
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

        <OverviewGrid model={model} inh={inh} />

        {(aliasOf || (snapshots && snapshots.length > 0)) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {aliasOf && (
              <>
                <span className="text-muted-foreground/60">
                  {model.alias ? "Alias of" : "Snapshot of"}
                </span>
                <a
                  href={`/${model.provider}/${aliasOf}`}
                  className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground ring-1 ring-border transition-colors duration-200 hover:text-foreground"
                >
                  {aliasOf}
                </a>
              </>
            )}
            {snapshots && snapshots.length > 0 && (
              <SnapshotList
                provider={model.provider}
                snapshots={snapshots.map((s) => ({
                  id: s,
                  deprecated:
                    allModels.find(
                      (m) => m.provider === model.provider && m.id === s,
                    )?.status === "deprecated",
                }))}
              />
            )}
          </div>
        )}
      </div>

      <div id="capabilities" className="mb-4 text-muted-foreground text-sm">
        Capabilities
      </div>
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

      <div id="details" className="mb-4 text-muted-foreground text-sm">
        Details
      </div>
      <div className="mb-8 grid gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2">
        {normalizeModelId(model.id) !== normalizeModelId(model.name) && (
          <DetailCell label="Model ID" value={model.id} />
        )}
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
        <DetailCell
          label="Type"
          value={model.model_type ?? "—"}
          inheritedFrom={inh("model_type")}
        />
        <DetailCell
          label="Reasoning tokens"
          value={
            model.reasoning_tokens != null
              ? model.reasoning_tokens
                ? "Yes"
                : "No"
              : "—"
          }
          inheritedFrom={inh("reasoning_tokens")}
        />
        <DetailCell
          label="Max input"
          value={
            model.max_input_tokens != null
              ? `${formatTokens(model.max_input_tokens)} tokens`
              : "—"
          }
        />
        {model.successor && (
          <DetailCell
            label="Successor"
            value={
              Array.isArray(model.successor)
                ? model.successor.join(", ")
                : model.successor
            }
            href={
              Array.isArray(model.successor)
                ? `/${model.provider}/${model.successor[0]}`
                : `/${model.provider}/${model.successor}`
            }
          />
        )}
        {typeof model.training_data_cutoff === "string" && (
          <DetailCell
            label="Training data cutoff"
            value={model.training_data_cutoff}
          />
        )}
        {typeof model.extended_thinking === "boolean" && (
          <DetailCell
            label="Extended thinking"
            value={model.extended_thinking ? "Yes" : "No"}
          />
        )}
        {typeof model.adaptive_thinking === "boolean" && (
          <DetailCell
            label="Adaptive thinking"
            value={model.adaptive_thinking ? "Yes" : "No"}
          />
        )}
        {typeof model.priority_tier === "boolean" && (
          <DetailCell
            label="Priority tier"
            value={model.priority_tier ? "Yes" : "No"}
          />
        )}
        {model.capabilities?.prompt_caching && (
          <DetailCell label="Prompt caching" value="Supported" />
        )}
        <DetailCell label="Source" value={model.source} />
        <DetailCell label="Last updated" value={model.last_updated} />
      </div>

      {model.tools && model.tools.length > 0 && (
        <>
          <div id="tools" className="mb-4 text-muted-foreground text-sm">
            Tools
          </div>
          <div className="mb-8">
            <ToolList tools={model.tools} />
          </div>
        </>
      )}

      {model.endpoints && model.endpoints.length > 0 && (
        <>
          <div id="endpoints" className="mb-4 text-muted-foreground text-sm">
            Endpoints
          </div>
          <div className="mb-8">
            <EndpointList
              endpoints={model.endpoints}
              apiUrl={providerInfo?.api_url}
            />
          </div>
        </>
      )}

      {model.pricing && Object.values(model.pricing).some((v) => v != null) && (
        <>
          <div id="pricing" className="mb-4 text-muted-foreground text-sm">
            Pricing
          </div>
          {model.pricing.tiers && model.pricing.tiers.length > 0 ? (
            <div className="mb-8 space-y-6">
              {model.pricing.tiers.map((tier) => (
                <div key={tier.label}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-foreground text-sm">
                      {tier.label}
                    </span>
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
                          <tr
                            key={row.label}
                            className="border-border border-t"
                          >
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
              {model.pricing_notes && model.pricing_notes.length > 0 && (
                <div className="space-y-1">
                  {model.pricing_notes.map((note) => (
                    <p
                      key={note.slice(0, 40)}
                      className="text-muted-foreground text-xs leading-relaxed"
                    >
                      {note}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-3 lg:grid-cols-6">
                <PriceCell label="Input" value={model.pricing.input} />
                <PriceCell label="Output" value={model.pricing.output} />
                <PriceCell
                  label="Cache write"
                  value={model.pricing.cache_write}
                />
                <PriceCell
                  label="Cache read"
                  value={model.pricing.cached_input}
                />
                <PriceCell label="Batch in" value={model.pricing.batch_input} />
                <PriceCell
                  label="Batch out"
                  value={model.pricing.batch_output}
                />
              </div>
              {model.pricing_notes && model.pricing_notes.length > 0 && (
                <div className="-mt-4 mb-8 space-y-1">
                  {model.pricing_notes.map((note) => (
                    <p
                      key={note.slice(0, 40)}
                      className="text-muted-foreground text-xs leading-relaxed"
                    >
                      {note}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {familyModels.length > 1 && (
        <>
          <div id="family" className="mb-4 text-muted-foreground text-sm">
            Family Comparison: {model.family}
          </div>
          <FamilyComparison
            models={familyModels}
            currentId={model.id}
            provider={model.provider}
          />
        </>
      )}

      <div id="api" className="mb-4 text-muted-foreground text-sm">
        API
      </div>
      <div className="mb-8">
        <ApiEndpoint
          path={`/v1/models/${model.provider}/${model.id}`}
          tryPath={`https://api.modelpedia.dev/v1/models/${model.provider}/${model.id}`}
        />
      </div>

      {changesOverlay}
    </>
  );
}
