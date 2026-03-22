import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/model-detail";
import { ModelList } from "@/components/model-list";
import { ProviderIcon } from "@/components/provider-icon";
import { ProviderLinks } from "@/components/provider-links";
import type { ModelData } from "@/lib/data";
import { getProvider } from "@/lib/data";
import { regionFlag } from "@/lib/format";

type Params = { provider: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { provider: id } = await params;
  const provider = getProvider(id);
  if (!provider) return { title: "Not Found" };

  const activeCount = provider.models.filter(
    (m) => m.status !== "deprecated",
  ).length;
  const description =
    (provider.description as string) ??
    `${provider.name} — ${activeCount} AI models. Browse specs, pricing, capabilities, and compare models.`;

  return {
    title: `${provider.name} Models`,
    description,
    alternates: { canonical: `/${id}` },
    openGraph: { title: `${provider.name} Models`, description },
  };
}

const TYPE_LABELS: Record<string, string> = {
  direct: "Model Provider",
  aggregator: "API Gateway",
  cloud: "Cloud Platform",
};

export default async function ProviderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ family?: string }>;
}) {
  const { provider: id } = await params;
  const { family } = await searchParams;
  const provider = getProvider(id);
  if (!provider) return notFound();

  const allProviderModels = provider.models.map((m: ModelData) => ({
    id: m.id,
    name: m.name,
    provider: provider.id,
    created_by: m.created_by,
    status: m.status,
    model_type: m.model_type,
    context_window: m.context_window,
    capabilities: m.capabilities as Record<string, boolean> | undefined,
    pricing: m.pricing,
    family: m.family,
  }));

  const models = family
    ? allProviderModels.filter((m) => m.family === family)
    : allProviderModels;

  const providerType = provider.type as string | undefined;
  const sdk = provider.sdk as Record<string, string> | undefined;
  const activeCount = provider.models.filter(
    (m) => m.status !== "deprecated",
  ).length;
  const deprecatedCount = provider.models.length - activeCount;
  const families = new Set(
    provider.models.map((m) => m.family).filter(Boolean),
  );

  return (
    <>
      <div className="mb-8 space-y-4">
        {/* Name + badges */}
        <div className="flex items-center gap-2.5">
          <ProviderIcon provider={provider} size={20} />
          <h1 className="font-medium text-foreground text-lg tracking-tight">
            {family ? `${provider.name} · ${family}` : provider.name}
          </h1>
          {providerType && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
              {TYPE_LABELS[providerType] ?? providerType}
            </span>
          )}
          {provider.free_tier && (
            <span className="rounded bg-green-500/10 px-1.5 py-0.5 font-mono text-green-600 text-xs dark:text-green-400">
              free tier
            </span>
          )}
          <span className="flex-1" />
          <ProviderLinks
            url={provider.url}
            docsUrl={provider.docs_url}
            pricingUrl={provider.pricing_url}
            statusUrl={provider.status_url as string | undefined}
            changelogUrl={provider.changelog_url as string | undefined}
            playgroundUrl={provider.playground_url as string | undefined}
            sdk={sdk}
          />
        </div>

        {/* Description */}
        {provider.description && (
          <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
            {provider.description as string}
          </p>
        )}

        {/* Overview grid */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border">
          <MetricCard
            label="Active models"
            value={String(activeCount)}
            sub={
              deprecatedCount > 0
                ? `+ ${deprecatedCount} deprecated`
                : undefined
            }
          />
          <MetricCard label="Families" value={String(families.size)} />
          <MetricCard
            label="Region"
            value={`${regionFlag(provider.region)} ${provider.region}`}
          />
        </div>

        {/* API Base URL */}
        <div className="flex items-center justify-between rounded-md px-4 py-2.5 ring-1 ring-border">
          <span className="text-muted-foreground text-sm">API Base URL</span>
          <code className="font-mono text-foreground text-sm">
            {provider.api_url}
          </code>
        </div>
      </div>

      {/* Models */}
      {provider.models.length === 0 ? (
        <p className="py-8 text-muted-foreground">No models.</p>
      ) : (
        <ModelList models={models} searchable />
      )}
    </>
  );
}
