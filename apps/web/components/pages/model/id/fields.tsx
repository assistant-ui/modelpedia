import { DetailCell } from "@/components/shared/model-detail";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Section } from "@/components/ui/section";
import type { Model, Provider } from "@/lib/data";
import { formatParams, formatTokens } from "@/lib/format";
import { normalizeModelId } from "@/lib/search";

function boolDisplay(value: boolean | undefined | null): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

function creatorHref(
  originalModel: { provider: string; id: string } | null,
  creatorProvider: Provider | null | undefined,
  createdBy: string | undefined,
): string | undefined {
  if (originalModel) return `/${originalModel.provider}/${originalModel.id}`;
  if (creatorProvider) return `/${createdBy}`;
  return undefined;
}

export function DetailsGrid({
  model,
  providerInfo,
  creatorProvider,
  originalModel,
  inh,
}: {
  model: Model;
  providerInfo: Provider | undefined;
  creatorProvider: Provider | null | undefined;
  originalModel: { provider: string; id: string } | null;
  inh: (field: string) => string | undefined;
}) {
  const successors = model.successor
    ? Array.isArray(model.successor)
      ? model.successor
      : [model.successor]
    : null;

  return (
    <Section id="details" title="Details">
      <div className="grid gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2">
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
          value={creatorProvider?.name ?? model.created_by}
          href={creatorHref(originalModel, creatorProvider, model.created_by)}
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
          label="License"
          value={model.license ?? "—"}
          inheritedFrom={inh("license")}
        />
        <DetailCell
          label="Parameters"
          value={formatParams(model.parameters, model.active_parameters) ?? "—"}
          inheritedFrom={inh("parameters")}
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
          label="Architecture"
          value={model.architecture ?? "—"}
          inheritedFrom={inh("architecture")}
        />
        <DetailCell
          label="Knowledge cutoff"
          value={model.knowledge_cutoff ?? "—"}
          dateTime={model.knowledge_cutoff ?? undefined}
          inheritedFrom={inh("knowledge_cutoff")}
        />
        <DetailCell
          label="Training data cutoff"
          value={model.training_data_cutoff ?? "—"}
          dateTime={model.training_data_cutoff ?? undefined}
          inheritedFrom={inh("training_data_cutoff")}
        />
        <DetailCell
          label="Release date"
          value={model.release_date ?? "—"}
          dateTime={model.release_date ?? undefined}
          inheritedFrom={inh("release_date")}
        />
        <DetailCell
          label="Deprecation date"
          value={model.deprecation_date ?? "—"}
          dateTime={model.deprecation_date ?? undefined}
          inheritedFrom={inh("deprecation_date")}
        />
        <DetailCell
          label="Type"
          value={model.model_type ?? "—"}
          inheritedFrom={inh("model_type")}
        />
        <DetailCell
          label="Reasoning tokens"
          value={boolDisplay(model.reasoning_tokens)}
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
        {successors && (
          <DetailCell
            label="Successor"
            value={successors.join(", ")}
            href={`/${model.provider}/${successors[0]}`}
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
        <DetailCell
          label="Open weight"
          value={boolDisplay(model.open_weight)}
          inheritedFrom={inh("open_weight")}
        />
        {model.capabilities?.prompt_caching && (
          <DetailCell label="Prompt caching" value="Supported" />
        )}
        <DetailCell label="Source" value={model.source} />
        <DetailCell
          label="Last updated"
          value={model.last_updated}
          dateTime={model.last_updated}
        />
      </div>
    </Section>
  );
}
