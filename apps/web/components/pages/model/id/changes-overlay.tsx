import { OverlayPanel } from "@/components/pages/model/id/overlay-panel";
import { ChangeEntry } from "@/components/shared/change-entry";
import { RenderMarkdown } from "@/components/shared/markdown";
import { ProviderIcon } from "@/components/shared/provider-icon";
import type {
  ChangeEntry as ChangeEntryData,
  EnrichedModel,
  Provider,
} from "@/lib/data";
import { normalizeModelId } from "@/lib/search";

export function ChangesOverlay({
  model,
  provider,
  providerInfo,
  modelId,
  changes,
}: {
  model: EnrichedModel;
  provider: string;
  providerInfo: Provider | undefined;
  modelId: string;
  changes: ChangeEntryData[];
}) {
  return (
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
          {(model.alias || (model.snapshots?.length ?? 0) > 0) && (
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
        Changes · {changes.length} entries
      </div>
      {changes.length === 0 ? (
        <p className="text-pretty py-16 text-center text-muted-foreground">
          No changes recorded for this model.
        </p>
      ) : (
        <div className="space-y-2">
          {changes.map((entry, i) => (
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
  );
}
