import type { Metadata } from "next";
import { ModelList } from "@/components/shared/model-list";
import { PageHeader } from "@/components/ui/page-header";
import { PROVIDER_TYPE_TIER } from "@/lib/constants";
import { allModels, getProvider } from "@/lib/data";

export const metadata: Metadata = {
  title: "Models",
  description:
    "Search and filter AI models across all providers. Compare context windows, pricing, and capabilities.",
};

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const items = allModels
    .map((m) => {
      const p = getProvider(m.provider);
      return {
        ...m,
        providerIcon: p?.icon,
        providerType: p?.type ?? "direct",
      };
    })
    .sort(
      (a, b) =>
        (PROVIDER_TYPE_TIER[b.providerType] ?? 0) -
        (PROVIDER_TYPE_TIER[a.providerType] ?? 0),
    );

  return (
    <>
      <PageHeader
        title="Models"
        count={items.length}
        sub="Browse and search all AI models across providers"
      />
      <ModelList models={items} showProvider searchable initialQuery={q} />
    </>
  );
}
