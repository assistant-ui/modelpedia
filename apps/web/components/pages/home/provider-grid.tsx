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
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2 md:grid-cols-3">
      {providers.map((p) => (
        <a
          key={p.id}
          href={`/${p.id}`}
          className="flex items-center gap-3 bg-background px-4 py-4 transition-colors duration-200 hover:bg-accent"
        >
          <ProviderIcon provider={p} size={20} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground text-sm">{p.name}</div>
            <div className="text-muted-foreground text-xs">
              {p.models.length} models · {p.region}
            </div>
          </div>
        </a>
      ))}
      <a
        href="/providers"
        className="group flex items-center gap-3 bg-background px-4 py-4 transition-colors duration-200 hover:bg-accent"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ChevronRight
            size={14}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-muted-foreground text-sm transition-colors duration-200 group-hover:text-foreground">
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
