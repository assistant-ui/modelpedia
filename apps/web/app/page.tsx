import type { Metadata } from "next";
import { Disclaimer } from "@/components/pages/home/disclaimer";
import { ProviderGrid } from "@/components/pages/home/provider-grid";
import { SearchBar } from "@/components/pages/home/search-bar";
import { StatsGrid } from "@/components/pages/home/stats-grid";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { allModels, getProvider, providers } from "@/lib/data";

export const metadata: Metadata = {
  title: "modelpedia - Open catalog of AI models",
  description:
    "Browse, compare, and search AI models across providers. Specs, pricing, and capabilities in one place.",
};

export default function HomePage() {
  const families = new Set(allModels.map((m) => m.family).filter(Boolean));

  const directProviders = [...providers]
    .filter((p) => p.type === "direct")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="mb-10 space-y-6">
        <div>
          <h1 className="text-balance font-medium text-2xl text-foreground tracking-tight">
            modelpedia
          </h1>
          <p className="mt-2 text-balance text-muted-foreground leading-relaxed">
            Open catalog of AI models across providers. Compare specs, pricing,
            and capabilities.
          </p>
        </div>

        <SearchBar
          items={[
            ...providers.map((p) => ({
              id: `p-${p.id}`,
              name: p.name,
              href: `/${p.id}`,
              sub: `${p.models.length} models`,
              icon: p.icon,
              type: "provider" as const,
            })),
            ...allModels
              .filter((m) => m.status !== "deprecated" && !m.alias)
              .map((m) => {
                const p = getProvider(m.provider);
                return {
                  id: `${m.provider}/${m.id}`,
                  name: m.name,
                  href: `/${m.provider}/${m.id}`,
                  sub: p?.name ?? m.provider,
                  icon: p?.icon,
                  type: "model" as const,
                  providerType: (p?.type as string) ?? "direct",
                };
              }),
          ]}
        />

        <StatsGrid
          items={[
            { label: "Models", value: allModels.length },
            { label: "Providers", value: providers.length },
            { label: "Families", value: families.size },
          ]}
        />

        <div className="flex flex-wrap gap-2">
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

      <Section title="Providers">
        <ProviderGrid providers={directProviders} total={providers.length} />
      </Section>

      <Disclaimer />
    </>
  );
}
