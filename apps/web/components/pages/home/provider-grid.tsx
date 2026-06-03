import { ChevronRight } from "lucide-react";
import { ProviderIcon } from "@/components/shared/provider-icon";
import type { ProviderWithModels } from "@/lib/data";

export function ProviderGrid({
  providers,
  total,
}: {
  providers: ProviderWithModels[];
  total: number;
}) {
  return (
    <div className="bg-border ring-border grid grid-cols-1 gap-px overflow-hidden rounded-md ring-1 sm:grid-cols-2 md:grid-cols-3">
      {providers.map((p) => (
        <a
          key={p.id}
          href={`/${p.id}`}
          className="bg-background hover:bg-accent flex items-center gap-3 px-4 py-4 transition-colors duration-200"
        >
          <ProviderIcon provider={p} size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-sm font-medium">{p.name}</div>
            <div className="text-muted-foreground text-xs">
              {p.models.length} models · {p.region}
            </div>
          </div>
        </a>
      ))}
      <a
        href="/providers"
        className="group bg-background hover:bg-accent flex items-center gap-3 px-4 py-4 transition-colors duration-200"
      >
        <div className="bg-muted text-muted-foreground flex h-5 w-5 items-center justify-center rounded-md">
          <ChevronRight
            size={14}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition-colors duration-200">
            View all providers
          </div>
          <div className="text-muted-foreground text-xs">
            {total} providers total
          </div>
        </div>
      </a>
    </div>
  );
}
