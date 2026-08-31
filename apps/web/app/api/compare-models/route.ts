import { NextResponse } from "next/server";
import { allModels, getProvider } from "@/lib/data";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keys = (searchParams.get("ids") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 2);

  const models: Record<string, unknown> = {};
  for (const key of keys) {
    const m = allModels.find(
      (model) => !model.alias && `${model.provider}/${model.id}` === key,
    );
    if (!m) continue;
    const p = getProvider(m.provider);
    const creator = m.created_by !== m.provider ? getProvider(m.created_by) : p;
    models[key] = {
      id: m.id,
      name: m.name,
      provider: m.provider,
      created_by: m.created_by,
      family: m.family,
      status: m.status,
      model_type: m.model_type,
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
      capabilities: m.capabilities,
      modalities: m.modalities,
      pricing: m.pricing,
      tools: m.tools,
      endpoints: m.endpoints,
      providerName: p?.name ?? m.provider,
      providerIcon: p?.icon,
      creatorName: creator?.name ?? m.created_by,
      creatorIcon: creator?.icon,
    };
  }

  return NextResponse.json(
    { models },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
