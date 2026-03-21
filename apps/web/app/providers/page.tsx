import type { Metadata } from "next";
import { Breadcrumb, PageHeader, ProviderIcon } from "@/components/views";
import { providers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Providers — AI Model Registry",
};

export default function ProvidersPage() {
  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-3">
        {[...providers]
          .sort((a, b) => {
            const aEmpty = a.models.length === 0;
            const bEmpty = b.models.length === 0;
            if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
            return a.name.localeCompare(b.name);
          })
          .map((p) => {
            const empty = p.models.length === 0;
            return (
              <a
                key={p.id}
                href={`/${p.id}`}
                className={`flex items-center gap-2 bg-background px-4 py-3 transition-colors duration-200 hover:bg-accent ${empty ? "opacity-50" : ""}`}
              >
                <ProviderIcon provider={p} size={14} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-foreground text-sm">
                      {p.name}
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground text-xs">
                      {p.region}
                    </span>
                  </div>
                </div>
                {p.models.length > 0 ? (
                  <span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
                    {p.models.length}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    —
                  </span>
                )}
              </a>
            );
          })}
      </div>
    </>
  );
}
