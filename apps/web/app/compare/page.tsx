import type { Metadata } from "next";
import { ModelCompare } from "@/components/shared/model-compare";
import { PageHeader } from "@/components/ui/page-header";
import { allModels } from "@/lib/data";

export const metadata: Metadata = {
  title: "Compare Models",
  description:
    "Side-by-side comparison of AI models. Compare specs, pricing, and capabilities across providers.",
};

export default function ComparePage() {
  const models = allModels
    .filter((m) => !m.alias)
    .map((m) => ({ id: m.id, name: m.name, provider: m.provider }));

  const aliases: Record<string, string> = {};
  for (const m of allModels) {
    if (m.alias) aliases[`${m.provider}/${m.id}`] = `${m.provider}/${m.alias}`;
  }

  return (
    <>
      <PageHeader
        title="Compare Models"
        sub="Side-by-side comparison of specs, pricing, and capabilities"
      />
      <ModelCompare models={models} aliases={aliases} />
    </>
  );
}
