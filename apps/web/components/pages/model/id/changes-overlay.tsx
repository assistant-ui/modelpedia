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
          <h2 className="text-foreground flex-1 text-lg font-medium tracking-tight">
            {model.name}
          </h2>
          {model.status && model.status !== "active" && (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
              {model.status}
            </span>
          )}
        </>
      }
      subheader={
        <>
          {normalizeModelId(model.id) !== normalizeModelId(model.name) && (
            <div className="text-muted-foreground mt-1 font-mono text-sm break-all">
              {model.id}
            </div>
          )}
          {model.description && (
            <p className="text-muted-foreground mt-2 leading-relaxed text-pretty">
              <RenderMarkdown text={model.description} />
            </p>
          )}
          {(model.alias || (model.snapshots?.length ?? 0) > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {model.alias && (
                <a
                  href={`/${model.provider}/${model.alias}`}
                  className="bg-muted text-muted-foreground ring-border hover:text-foreground rounded px-2 py-1 font-mono ring-1 transition-colors duration-200"
                >
                  alias → {model.alias}
                </a>
              )}
              {model.snapshots?.map((s) => (
                <a
                  key={s}
                  href={`/${model.provider}/${s}`}
                  className="bg-muted text-muted-foreground ring-border hover:text-foreground rounded px-2 py-1 font-mono ring-1 transition-colors duration-200"
                >
                  {s}
                </a>
              ))}
            </div>
          )}
        </>
      }
    >
      <div className="text-muted-foreground mb-4 text-sm">
        Changes · {changes.length} entries
      </div>
      {changes.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-pretty">
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
