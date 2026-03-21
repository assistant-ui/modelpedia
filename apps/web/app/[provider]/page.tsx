import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelList } from "@/components/model-list";
import { ProviderIcon } from "@/components/provider-icon";
import { ProviderLinks } from "@/components/provider-links";
import { PageHeader } from "@/components/ui/page-header";
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
  return {
    title: provider.name,
    description: `${provider.name} — ${provider.models.length} AI models. Compare specs, pricing, and capabilities.`,
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
        icon={<ProviderIcon provider={provider} size={18} />}
        sub={
          <>
            <span>{models.length} models</span>
            <span>
              {regionFlag(provider.region)} {provider.region}
            </span>
          </>
        }
        trailing={
          <ProviderLinks
            url={provider.url}
            docsUrl={provider.docs_url}
            pricingUrl={provider.pricing_url}
          />
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
