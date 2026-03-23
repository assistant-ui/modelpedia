import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProviderDetailHeader } from "@/components/pages/provider/header";
import { ModelList } from "@/components/shared/model-list";
import { getProvider, providers } from "@/lib/data";
import { sortModels } from "@/lib/sort";

type Params = { provider: string };

export const dynamicParams = false;

export function generateStaticParams() {
  return providers.map((p) => ({ provider: p.id }));
}

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
    provider.description ??
    `${provider.name} — ${activeCount} AI models. Browse specs, pricing, capabilities, and compare models.`;

  return {
    title: `${provider.name} Models`,
    description,
    alternates: { canonical: `/${id}` },
    openGraph: { title: `${provider.name} Models`, description },
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

  const allProviderModels = sortModels(
    provider.models.map((m) => ({ ...m, provider: provider.id })),
  );

  const models = family
    ? allProviderModels.filter((m) => m.family === family)
    : allProviderModels;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://modelpedia.dev",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: provider.name,
          item: `https://modelpedia.dev/${provider.id}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: provider.name,
      url: provider.url,
      description: provider.description,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProviderDetailHeader provider={provider} family={family} />

      {provider.models.length === 0 ? (
        <p className="py-8 text-muted-foreground">No models.</p>
      ) : (
        <ModelList models={models} searchable />
      )}
    </>
  );
}
