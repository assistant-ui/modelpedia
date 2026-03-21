import type { Metadata } from "next";
import { ModelList } from "@/components/model-list";
import { Breadcrumb, PageHeader } from "@/components/views";
import { allModels, getProvider } from "@/lib/data";

export const metadata: Metadata = {
  title: "Models — AI Model Registry",
};

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const items = allModels.map((m) => {
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
  });

  return (
    <>
      <ModelList models={items} showProvider searchable initialQuery={q} />
    </>
  );
}
