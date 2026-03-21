import type { Metadata } from "next";
import { ModelCompare } from "@/components/model-compare";
import { Breadcrumb, PageHeader } from "@/components/views";
import { allModels, getProvider } from "@/lib/data";

export const metadata: Metadata = {
  title: "Compare Models — AI Model Registry",
};

export default function ComparePage() {
  const models = allModels
    .filter((m) => !m.alias)
    .map((m) => {
      const p = getProvider(m.provider);
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        providerName: p?.name ?? m.provider,
        family: m.family,
        status: m.status,
        context_window: m.context_window,
        max_output_tokens: m.max_output_tokens,
        knowledge_cutoff: m.knowledge_cutoff,
        performance: m.performance,
        speed: m.speed,
        capabilities: m.capabilities as Record<string, boolean> | undefined,
        modalities: m.modalities,
        pricing: m.pricing,
      };
    });

  return (
    <>
      <ModelCompare models={models} />
    </>
  );
}
