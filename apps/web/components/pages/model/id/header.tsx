import { Download, GitCompareArrows, History } from "lucide-react";
import { ModelIdCopy } from "@/components/pages/model/id/id-copy";
import { RenderMarkdown } from "@/components/shared/markdown";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import type { Model, Provider } from "@/lib/data";
import { formatParams } from "@/lib/format";

export function ModelDetailHeader({
  model,
  providerInfo,
  provider,
  modelId,
  changesCount,
}: {
  model: Model;
  providerInfo: Provider | undefined;
  provider: string;
  modelId: string;
  changesCount: number;
}) {
  const successors = model.successor
    ? Array.isArray(model.successor)
      ? model.successor
      : [model.successor]
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <a
          href={`/${model.provider}`}
          className="shrink-0 transition-opacity duration-200 hover:opacity-70"
        >
          <ProviderIcon provider={providerInfo} size={20} />
        </a>
        <h1 className="font-medium text-foreground text-lg tracking-tight">
          {model.name}
        </h1>
        {model.model_type && <Badge>{model.model_type}</Badge>}
        {model.status === "deprecated" && (
          <Badge variant="red">deprecated</Badge>
        )}
        {model.status === "preview" && <Badge variant="yellow">preview</Badge>}
        {model.license && (
          <Badge variant={model.license !== "proprietary" ? "green" : "muted"}>
            {model.license}
          </Badge>
        )}
        {model.parameters != null && (
          <Badge>
            {formatParams(model.parameters, model.active_parameters)}
          </Badge>
        )}
        <span className="flex-1" />

        <ButtonLink
          href={`/compare?a=${encodeURIComponent(`${model.provider}/${model.id}`)}`}
          variant="default"
          size="icon"
          title="Compare this model"
        >
          <GitCompareArrows size={14} />
        </ButtonLink>
        {changesCount > 0 && (
          <ButtonLink
            href={`/${provider}/${modelId}/changes`}
            variant="default"
            size="icon"
            title="Change history"
          >
            <History size={14} />
          </ButtonLink>
        )}
        <Dropdown>
          <DropdownTrigger>
            <Button variant="default" size="icon" title="Export model data">
              <Download size={14} />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end">
            <DropdownLabel>Export</DropdownLabel>
            <DropdownItem
              href={`https://api.modelpedia.dev/v1/export?format=json&provider=${provider}&model=${encodeURIComponent(model.id)}`}
            >
              JSON
            </DropdownItem>
            <DropdownItem
              href={`https://api.modelpedia.dev/v1/export?format=csv&provider=${provider}&model=${encodeURIComponent(model.id)}`}
            >
              CSV
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
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
                  .map((s) => ({ label: "Snapshot", value: s })),
              ],
            },
            {
              label: "Links",
              items: [
                {
                  label: "API endpoint",
                  value: `/v1/models/${model.provider}/${model.id}`,
                },
                ...(providerInfo?.api_url
                  ? [{ label: "Provider API", value: providerInfo.api_url }]
                  : []),
                ...(model.page_url
                  ? [{ label: "Model page", value: model.page_url }]
                  : []),
              ],
            },
          ]}
        />
      </div>

      {(model.description || model.tagline || successors) && (
        <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
          {model.description ? (
            <RenderMarkdown text={model.description} />
          ) : (
            model.tagline
          )}
          {successors && (
            <>
              {(model.description || model.tagline) && " · "}
              Succeeded by{" "}
              {successors.map((s, i) => (
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
