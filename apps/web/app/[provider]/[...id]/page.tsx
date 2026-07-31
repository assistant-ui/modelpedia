import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CapabilitiesGrid } from "@/components/pages/model/id/capabilities";
import { ChangesOverlay } from "@/components/pages/model/id/changes-overlay";
import {
  EndpointList,
  ToolList,
} from "@/components/pages/model/id/endpoint-list";
import { FamilyComparison } from "@/components/pages/model/id/family-comparison";
import { DetailsGrid } from "@/components/pages/model/id/fields";
import { ModelDetailHeader } from "@/components/pages/model/id/header";
import { OverviewGrid } from "@/components/pages/model/id/overview-grid";
import { PricingSection } from "@/components/pages/model/id/pricing";
import {
  type ProviderPrice,
  ProviderPricing,
} from "@/components/pages/model/id/provider-pricing";
import { SnapshotList } from "@/components/pages/model/id/snapshot-list";
import { ApiEndpoint } from "@/components/shared/api-endpoint";
import { Section } from "@/components/ui/section";
import {
  allModels,
  getChanges,
  getModel,
  getModelWithInheritance,
  getProvider,
} from "@/lib/data";
import { formatTokens } from "@/lib/format";
import { parseIdSegments } from "@/lib/parse-id";
import { priceDelta, resolvePriceHistory } from "@/lib/price-history";
import { normalizeModelId } from "@/lib/search";

export const revalidate = 3600;

type Params = { provider: string; id: string[] };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { provider, id } = await params;
  const { modelId, isChanges } = parseIdSegments(id);
  const model = getModel(provider, modelId);
  if (!model) return { title: "Not Found" };

  const providerInfo = getProvider(provider);
  const providerName = providerInfo?.name ?? provider;

  if (isChanges) {
    return {
      title: `Changes — ${model.name} (${providerName})`,
      description: `Change history for ${model.name} on ${providerName}.`,
    };
  }

  const ogUrl = `/api/og?provider=${provider}&id=${encodeURIComponent(modelId)}`;

  const caps = model.capabilities
    ? Object.entries(model.capabilities)
        .filter(([, v]) => v)
        .map(([k]) => k.replace(/_/g, " "))
    : [];
  const capsStr = caps.length > 0 ? ` Supports ${caps.join(", ")}.` : "";

  const priceParts: string[] = [];
  if (model.pricing?.input != null)
    priceParts.push(`$${model.pricing.input}/M input`);
  if (model.pricing?.output != null)
    priceParts.push(`$${model.pricing.output}/M output`);
  const priceStr = priceParts.length > 0 ? ` ${priceParts.join(", ")}.` : "";
  const ctxStr =
    model.context_window != null
      ? ` ${formatTokens(model.context_window)} context.`
      : "";

  const description =
    model.description ??
    `${model.name} by ${providerName}.${ctxStr}${priceStr}${capsStr}`;

  const title = `${model.name} — ${providerName}`;
  const ogImages = [{ url: ogUrl, width: 1200, height: 630 }];

  // Canonical: alias/snapshot → main model; deprecated → noindex
  const canonicalId = model.alias ?? modelId;

  return {
    title,
    description,
    alternates: { canonical: `/${provider}/${canonicalId}` },
    openGraph: { title, description, images: ogImages },
    twitter: { title, description, images: ogImages },
    ...(model.status === "deprecated" && {
      robots: { index: false, follow: true },
    }),
  };
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { provider, id: idSegments } = await params;
  const { modelId, isChanges } = parseIdSegments(idSegments);
  const model = getModelWithInheritance(provider, modelId);
  if (!model) return notFound();

  const providerInfo = getProvider(model.provider);
  const modelChanges = getChanges().filter(
    (e) => e.provider === provider && e.model === modelId,
  );

  const aliasOf =
    model.alias ??
    allModels.find(
      (m) =>
        m.provider === model.provider &&
        normalizeModelId(m.id) !== normalizeModelId(model.id) &&
        m.snapshots?.includes(model.id),
    )?.id ??
    null;

  const snapshots = model.snapshots?.filter(
    (s) => normalizeModelId(s) !== normalizeModelId(model.id),
  );

  const inherited = model.inheritedFields;
  const inh = (field: string) =>
    inherited?.has(field) ? model.inheritedFrom : undefined;

  const creatorProvider =
    model.created_by !== model.provider ? getProvider(model.created_by) : null;

  const originalMatch = creatorProvider
    ? allModels.find(
        (m) =>
          m.provider === model.created_by &&
          (m.name === model.name ||
            normalizeModelId(m.id) === normalizeModelId(model.id) ||
            normalizeModelId(m.id) === normalizeModelId(model.name)),
      )
    : null;
  const originalModel = originalMatch
    ? { provider: originalMatch.provider, id: originalMatch.id }
    : null;

  const familyModels = model.family
    ? allModels
        .filter(
          (m) =>
            m.family === model.family &&
            m.provider === model.provider &&
            !m.alias,
        )
        .sort((a, b) => (a.pricing?.input ?? 0) - (b.pricing?.input ?? 0))
    : [];

  const today = new Date().toISOString().slice(0, 10);
  const priceHistory = resolvePriceHistory(provider, modelId, model.alias);

  // Same model listed by other providers: prices diverge and the change log is
  // recorded per listing, so a cut on one provider is invisible on the others.
  const normalized = normalizeModelId(model.id);
  const providerPrices: ProviderPrice[] = allModels
    .filter(
      (m) =>
        m.created_by === model.created_by &&
        normalizeModelId(m.id) === normalized &&
        m.pricing?.input != null,
    )
    .map((m) => {
      const info = getProvider(m.provider);
      const points = resolvePriceHistory(m.provider, m.id, m.alias)?.points;
      return {
        provider: m.provider,
        name: info?.name ?? m.provider,
        icon: info?.icon,
        id: m.id,
        input: m.pricing?.input,
        output: m.pricing?.output,
        delta: points ? priceDelta(points, "input") : null,
        isCurrent: m.provider === model.provider && m.id === model.id,
      };
    })
    .sort((a, b) => (a.input ?? 0) - (b.input ?? 0));

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
          name: providerInfo?.name ?? provider,
          item: `https://modelpedia.dev/${provider}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: model.name,
          item: `https://modelpedia.dev/${provider}/${modelId}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: model.name,
      description: model.description,
      applicationCategory: "AI Model",
      operatingSystem: "API",
      ...(providerInfo && {
        author: {
          "@type": "Organization",
          name: providerInfo.name,
          url: providerInfo.url,
        },
      }),
      ...(model.pricing && {
        offers: {
          "@type": "Offer",
          priceCurrency: "USD",
          description: [
            model.pricing.input != null &&
              `$${model.pricing.input}/M input tokens`,
            model.pricing.output != null &&
              `$${model.pricing.output}/M output tokens`,
          ]
            .filter(Boolean)
            .join(", "),
        },
      }),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-8 space-y-4">
        <ModelDetailHeader
          model={model}
          providerInfo={providerInfo}
          provider={provider}
          modelId={modelId}
          changesCount={modelChanges.length}
        />

        <OverviewGrid model={model} inh={inh} />

        {(aliasOf || (snapshots?.length ?? 0) > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {aliasOf && (
              <>
                <span className="text-muted-foreground/60">
                  {model.alias ? "Alias of" : "Snapshot of"}
                </span>
                <a
                  href={`/${model.provider}/${aliasOf}`}
                  className="bg-muted text-muted-foreground ring-border hover:text-foreground rounded px-2 py-1 font-mono ring-1 transition-colors duration-200"
                >
                  {aliasOf}
                </a>
              </>
            )}
            {(snapshots?.length ?? 0) > 0 && (
              <SnapshotList
                provider={model.provider}
                snapshots={snapshots!.map((s) => ({
                  id: s,
                  deprecated:
                    allModels.find(
                      (m) => m.provider === model.provider && m.id === s,
                    )?.status === "deprecated",
                }))}
              />
            )}
          </div>
        )}
      </div>

      <CapabilitiesGrid model={model} inherited={inherited} />

      <DetailsGrid
        model={model}
        providerInfo={providerInfo}
        creatorProvider={creatorProvider}
        originalModel={originalModel}
        inh={inh}
      />

      {model.tools && model.tools.length > 0 && (
        <Section id="tools" title="Tools">
          <ToolList tools={model.tools} />
        </Section>
      )}

      {model.endpoints && model.endpoints.length > 0 && (
        <Section id="endpoints" title="Endpoints">
          <EndpointList
            endpoints={model.endpoints}
            apiUrl={providerInfo?.api_url}
          />
        </Section>
      )}

      {model.pricing && (
        <PricingSection
          pricing={model.pricing}
          pricingNotes={model.pricing_notes}
          fastModePricing={
            model.fast_mode_pricing as
              | { input: number; output: number }
              | undefined
          }
          history={priceHistory}
          provider={provider}
          today={today}
        />
      )}

      {providerPrices.length > 1 && (
        <Section id="providers" title="Price across providers">
          <ProviderPricing rows={providerPrices} />
        </Section>
      )}

      {familyModels.length > 1 && (
        <Section id="family" title={`Family Comparison: ${model.family}`}>
          <FamilyComparison
            models={familyModels}
            currentId={model.id}
            provider={model.provider}
          />
        </Section>
      )}

      <Section id="api" title="API">
        <ApiEndpoint
          path={`/v1/models/${model.provider}/${model.id}`}
          tryPath={`https://api.modelpedia.dev/v1/models/${model.provider}/${model.id}`}
        />
      </Section>

      {isChanges && (
        <ChangesOverlay
          model={model}
          provider={provider}
          providerInfo={providerInfo}
          modelId={modelId}
          changes={modelChanges}
        />
      )}
    </>
  );
}
