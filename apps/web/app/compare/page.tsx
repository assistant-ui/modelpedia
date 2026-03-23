import type { Metadata } from "next";
import { ModelCompare } from "@/components/shared/model-compare";
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
        ...m,
        providerName: p?.name ?? m.provider,
        providerIcon: p?.icon,
        creatorName: creator?.name ?? m.created_by,
        creatorIcon: creator?.icon,
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
