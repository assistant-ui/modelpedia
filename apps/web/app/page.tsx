import Link from "next/link";
import { ModelList } from "@/components/model-list";
import { Divider, ProviderIcon } from "@/components/views";
import type { Model } from "@/lib/data";
import { allModels, getProvider, providers } from "@/lib/data";

/** Pick recent models, round-robin across providers for diversity */
function recentModels(models: Model[], count: number): Model[] {
  const byProvider = new Map<string, Model[]>();
  for (const m of [...models].sort((a, b) =>
    (b.last_updated ?? "").localeCompare(a.last_updated ?? ""),
  )) {
    const list = byProvider.get(m.provider) ?? [];
    list.push(m);
    byProvider.set(m.provider, list);
  }

  const result: Model[] = [];
  const iterators = [...byProvider.values()].map((list) =>
    list[Symbol.iterator](),
  );
  let i = 0;
  while (result.length < count && iterators.length > 0) {
    const idx = i % iterators.length;
    const next = iterators[idx].next();
    if (next.done) {
      iterators.splice(idx, 1);
      continue;
    }
    result.push(next.value);
    i++;
  }
  return result;
}

function toModelItem(m: Model) {
  const p = getProvider(m.provider);
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    status: m.status,
    context_window: m.context_window,
    capabilities: m.capabilities as Record<string, boolean> | undefined,
    pricing: m.pricing,
    providerIcon: p?.icon,
  };
}

export default function HomePage() {
  const withPricing = allModels.filter((m) => m.pricing?.input != null).length;
  const activeModels = allModels.filter((m) => m.status !== "deprecated");
  const families = new Set(allModels.map((m) => m.family).filter(Boolean));

  return (
    <>
      {/* Hero */}
      <div className="mb-10">
        <h1 className="font-medium text-2xl text-foreground tracking-tight">
          AI Model Registry
        </h1>
        <p className="mt-2 text-muted-foreground leading-relaxed">
          Open catalog of AI models across providers. Compare specs, pricing,
          and capabilities.
        </p>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-4">
          <div className="bg-background px-4 py-4">
            <div className="font-medium font-mono text-2xl text-foreground">
              {allModels.length}
            </div>
            <div className="mt-1 text-muted-foreground text-xs">Models</div>
          </div>
          <div className="bg-background px-4 py-4">
            <div className="font-medium font-mono text-2xl text-foreground">
              {providers.length}
            </div>
            <div className="mt-1 text-muted-foreground text-xs">Providers</div>
          </div>
          <div className="bg-background px-4 py-4">
            <div className="font-medium font-mono text-2xl text-foreground">
              {families.size}
            </div>
            <div className="mt-1 text-muted-foreground text-xs">Families</div>
          </div>
          <div className="bg-background px-4 py-4">
            <div className="font-medium font-mono text-2xl text-foreground">
              {withPricing}
            </div>
            <div className="mt-1 text-muted-foreground text-xs">
              With pricing
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="mt-4 flex gap-2">
          <Link
            href="/models"
            className="rounded-md bg-muted px-3 py-1.5 text-foreground text-xs ring-1 ring-border transition-colors duration-200 hover:bg-accent"
          >
            Browse all models
          </Link>
          <Link
            href="/compare"
            className="rounded-md bg-muted px-3 py-1.5 text-foreground text-xs ring-1 ring-border transition-colors duration-200 hover:bg-accent"
          >
            Compare models
          </Link>
          <Link
            href="/docs/api"
            className="rounded-md bg-muted px-3 py-1.5 text-foreground text-xs ring-1 ring-border transition-colors duration-200 hover:bg-accent"
          >
            API Reference
          </Link>
        </div>
      </div>

      {/* Providers */}
      <div className="mb-4 text-muted-foreground text-sm">Providers</div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2 md:grid-cols-3">
        {[...providers]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => {
            const active = p.models.filter(
              (m) => m.status !== "deprecated",
            ).length;
            return (
              <a
                key={p.id}
                href={`/${p.id}`}
                className="flex items-center gap-3 bg-background px-4 py-4 transition-colors duration-200 hover:bg-accent"
              >
                <ProviderIcon provider={p} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground text-sm">
                    {p.name}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {p.models.length} models · {p.region}
                  </div>
                </div>
              </a>
            );
          })}
      </div>

      <Divider />

      {/* Recently updated */}
      <div className="mb-4 text-muted-foreground text-sm">Recently updated</div>
      <ModelList
        models={recentModels(activeModels, 20).map(toModelItem)}
        showProvider
      />
    </>
  );
}
