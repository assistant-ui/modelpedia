import type { Metadata } from "next";
import { ProviderIcon } from "@/components/provider-icon";
import { PageHeader } from "@/components/ui/page-header";
import { providers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Providers",
  description:
    "All AI model providers and platforms. Browse models by provider.",
};

const TYPE_STYLES: Record<string, string> = {
  direct: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  aggregator: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  cloud: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

const TYPE_LABELS: Record<string, string> = {
  direct: "Direct",
  aggregator: "Gateway",
  cloud: "Cloud",
};

export default function ProvidersPage() {
  return (
    <>
      <PageHeader
        title="Providers"
        count={providers.length}
        sub="AI model providers and platforms"
      />
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2 lg:grid-cols-3">
        {[...providers]
          .sort((a, b) => {
            const aEmpty = a.models.length === 0;
            const bEmpty = b.models.length === 0;
            if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
            return a.name.localeCompare(b.name);
          })
          .map((p) => {
            const empty = p.models.length === 0;
            const providerType = p.type as string | undefined;
            return (
              <a
                key={p.id}
                href={`/${p.id}`}
                className={`flex items-center gap-3 bg-background px-4 py-3.5 transition-colors duration-200 hover:bg-accent ${empty ? "opacity-50" : ""}`}
              >
                <ProviderIcon provider={p} size={16} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-foreground text-sm">
                      {p.name}
                    </span>
                    {providerType && (
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${TYPE_STYLES[providerType] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {TYPE_LABELS[providerType] ?? providerType}
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-0.5 truncate text-muted-foreground text-xs">
                      {p.description as string}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
                  {p.models.length || "—"}
                </span>
              </a>
            );
          })}
      </div>
    </>
  );
}
