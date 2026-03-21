import type { Metadata } from "next";
import { ModelCompare } from "@/components/model-compare";
import { PageHeader } from "@/components/ui/page-header";
import { allModels, getProvider } from "@/lib/data";

export const metadata: Metadata = {
  title: "Compare Models",
  description:
    "Side-by-side comparison of AI models. Compare specs, pricing, and capabilities across providers.",
};

export default function ComparePage() {
  const models = allModels
    .filter((m) => !m.alias)
    .map((m) => {
      const p = getProvider(m.provider);
      const creator =
        m.created_by !== m.provider ? getProvider(m.created_by) : p;
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        providerName: p?.name ?? m.provider,
        providerIcon: p?.icon,
        created_by: m.created_by,
        creatorName: creator?.name ?? m.created_by,
        creatorIcon: creator?.icon,
        family: m.family,
        model_type: m.model_type,
        status: m.status,
        release_date: m.release_date,
        context_window: m.context_window,
        max_context_window: m.max_context_window,
        max_output_tokens: m.max_output_tokens,
        max_input_tokens: m.max_input_tokens,
        knowledge_cutoff: m.knowledge_cutoff,
        reasoning_tokens: m.reasoning_tokens,
        performance: m.performance,
        reasoning: m.reasoning,
        speed: m.speed,
        capabilities: m.capabilities as Record<string, boolean> | undefined,
        modalities: m.modalities,
        pricing: m.pricing,
      };
    });

  return (
    <>
      <PageHeader
        title="Compare Models"
        sub="Side-by-side comparison of specs, pricing, and capabilities"
      />
      <ModelCompare models={models} />
    </>
  );
}
