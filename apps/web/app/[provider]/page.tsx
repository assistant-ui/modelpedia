import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelList } from "@/components/model-list";
import { ProviderLinks } from "@/components/provider-links";
import {
  Breadcrumb,
  PageHeader,
  ProviderIcon,
  regionFlag,
} from "@/components/views";
import type { ModelData } from "@/lib/data";
import { getProvider } from "@/lib/data";

type Params = { provider: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { provider: id } = await params;
  const provider = getProvider(id);
  return {
    title: provider ? `${provider.name} — AI Model Registry` : "Not Found",
  };
}

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
    status: m.status,
    context_window: m.context_window,
    capabilities: m.capabilities as Record<string, boolean> | undefined,
    pricing: m.pricing,
    family: m.family,
  }));

  const models = family
    ? allProviderModels.filter((m) => m.family === family)
    : allProviderModels;

  return (
    <>
      <PageHeader
        title={family ? `${provider.name} · ${family}` : provider.name}
        count={models.length}
        icon={<ProviderIcon provider={provider} size={18} />}
        trailing={
          <>
            <span className="text-sm" title={provider.region}>
              {regionFlag(provider.region)}
            </span>
            <ProviderLinks
              url={provider.url}
              docsUrl={provider.docs_url}
              pricingUrl={provider.pricing_url}
            />
          </>
        }
      />
      {provider.models.length === 0 ? (
        <p className="py-8 text-muted-foreground">No models.</p>
      ) : (
        <ModelList models={models} searchable />
      )}
    </>
  );
}
