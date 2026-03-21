import type { Metadata } from "next";
import { ProviderIcon } from "@/components/provider-icon";
import { ButtonLink } from "@/components/ui/button";
import { allModels, providers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Open catalog of AI models",
  description:
    "Browse, compare, and search AI models across providers. Specs, pricing, and capabilities in one place.",
};

export default function HomePage() {
  const families = new Set(allModels.map((m) => m.family).filter(Boolean));

  return (
    <>
      <div className="mb-10">
        <h1 className="text-balance font-medium text-2xl text-foreground tracking-tight">
          modelpedia
        </h1>
        <p className="mt-2 text-balance text-muted-foreground leading-relaxed">
          Open catalog of AI models across providers. Compare specs, pricing,
          and capabilities.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border">
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
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href="/models" size="sm">
            Browse all models
          </ButtonLink>
          <ButtonLink href="/compare" size="sm">
            Compare models
          </ButtonLink>
          <ButtonLink href="/changes" size="sm">
            Recent changes
          </ButtonLink>
          <ButtonLink href="/docs/api" size="sm">
            API Reference
          </ButtonLink>
        </div>
      </div>

      <div className="mb-4 text-muted-foreground text-sm">Providers</div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border sm:grid-cols-2 md:grid-cols-3">
        {[...providers]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => {
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
    </>
  );
}
