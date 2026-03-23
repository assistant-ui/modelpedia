import { NextResponse } from "next/server";
import {
  allModels,
  getChanges,
  getModel,
  getProvider,
  providers,
} from "@/lib/data";
import { formatTokens } from "@/lib/format";

function formatChangeDetail(
  changes: Record<string, { from: unknown; to: unknown }> | undefined,
): string {
  if (!changes) return "—";
  return Object.entries(changes)
    .map(
      ([k, { from, to }]) =>
        `${k}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`,
    )
    .join("; ");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const pathname = `/${(path ?? []).join("/")}`;

  let md: string | null = null;

  if (pathname === "/") {
    md = renderHome();
  } else if (pathname === "/models") {
    md = renderModels();
  } else if (pathname === "/providers") {
    md = renderProviders();
  } else if (pathname === "/compare") {
    md = renderCompare();
  } else if (pathname === "/changes") {
    md = renderChanges();
  } else if (pathname === "/docs/api") {
    md = renderApiDocs();
  } else {
    const changesMatch = pathname.match(/^\/([^/]+)\/(.+)\/changes$/);
    if (changesMatch) {
      md = renderModelChanges(changesMatch[1], changesMatch[2]);
    }
    if (!md) {
      const modelMatch = pathname.match(/^\/([^/]+)\/(.+)$/);
      if (modelMatch) {
        md = renderModel(modelMatch[1], modelMatch[2]);
      }
    }
    if (!md) {
      const providerMatch = pathname.match(/^\/([^/]+)$/);
      if (providerMatch) {
        md = renderProvider(providerMatch[1]);
      }
    }
  }

  if (md === null) {
    return new Response("Not found", { status: 404 });
  }

  return new NextResponse(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

function renderHome(): string {
  return [
    "# modelpedia",
    "",
    `${allModels.length} models across ${providers.length} providers.`,
    "",
    "## Providers",
    "",
    ...providers.map(
      (p) =>
        `- **${p.name}** (${p.region}) — ${p.models.length} models — ${p.url}`,
    ),
    "",
    `Browse: /<provider>, /<provider>/<model_id>, /docs/api`,
    `API: https://api.modelpedia.dev/v1/models, https://api.modelpedia.dev/v1/providers, https://api.modelpedia.dev/v1/stats`,
  ].join("\n");
}

function renderProvider(id: string): string | null {
  const provider = getProvider(id);
  if (!provider) return null;

  const lines = [
    `# ${provider.name}`,
    "",
    `- Region: ${provider.region}`,
    `- URL: ${provider.url}`,
    `- API: ${provider.api_url}`,
    `- Docs: ${provider.docs_url}`,
    `- Models: ${provider.models.length}`,
    "",
    "## Models",
    "",
    "| Model | Context | Input $/1M | Output $/1M |",
    "|-------|---------|-----------|------------|",
  ];

  for (const m of provider.models) {
    const ctx = m.context_window != null ? formatTokens(m.context_window) : "—";
    const inp = m.pricing?.input != null ? `$${m.pricing.input}` : "—";
    const out = m.pricing?.output != null ? `$${m.pricing.output}` : "—";
    lines.push(`| ${m.name} | ${ctx} | ${inp} | ${out} |`);
  }

  return lines.join("\n");
}

function renderModels(): string {
  const active = allModels.filter((m) => m.status !== "deprecated");
  const lines = [
    "# Models",
    "",
    `${allModels.length} models (${active.length} active) across ${providers.length} providers.`,
    "",
    "| Model | Provider | Context | Input $/1M | Output $/1M |",
    "|-------|----------|---------|-----------|------------|",
  ];

  for (const m of active) {
    const p = getProvider(m.provider);
    const ctx = m.context_window != null ? formatTokens(m.context_window) : "—";
    const inp = m.pricing?.input != null ? `$${m.pricing.input}` : "—";
    const out = m.pricing?.output != null ? `$${m.pricing.output}` : "—";
    lines.push(
      `| ${m.name} | ${p?.name ?? m.provider} | ${ctx} | ${inp} | ${out} |`,
    );
  }

  return lines.join("\n");
}

function renderProviders(): string {
  const lines = [
    "# Providers",
    "",
    `${providers.length} providers.`,
    "",
    "| Provider | Region | Models | URL |",
    "|----------|--------|--------|-----|",
  ];

  for (const p of [...providers].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`| ${p.name} | ${p.region} | ${p.models.length} | ${p.url} |`);
  }

  return lines.join("\n");
}

function renderCompare(): string {
  return [
    "# Compare Models",
    "",
    "Use the API to compare models:",
    "",
    "```",
    "GET https://api.modelpedia.dev/v1/models/compare?ids=openai/gpt-4o,anthropic/claude-sonnet-4-6",
    "```",
    "",
    "Or browse the compare page at https://modelpedia.dev/compare",
  ].join("\n");
}

function renderChanges(): string {
  const changes = getChanges();
  const lines = [
    "# Changes",
    "",
    `${changes.length} total entries.`,
    "",
    "| Date | Provider | Model | Action | Changes |",
    "|------|----------|-------|--------|---------|",
  ];

  for (const entry of changes.slice(0, 100)) {
    const date = new Date(entry.ts).toISOString().slice(0, 10);
    const provider = getProvider(entry.provider);
    const provName = provider?.name ?? entry.provider;
    const detail = formatChangeDetail(entry.changes);
    lines.push(
      `| ${date} | ${provName} | ${entry.model} | ${entry.action} | ${detail} |`,
    );
  }

  if (changes.length > 100) {
    lines.push("", `_Showing 100 of ${changes.length} entries._`);
  }

  return lines.join("\n");
}

function renderApiDocs(): string {
  return [
    "# API Reference",
    "",
    "Base URL: `https://api.modelpedia.dev/v1`",
    "",
    "JSON · No authentication · CORS enabled",
    "",
    "## Endpoints",
    "",
    "| Endpoint | Description |",
    "|----------|-------------|",
    "| GET /v1/stats | Registry statistics |",
    "| GET /v1/search?q= | Unified search |",
    "| GET /v1/providers | All providers |",
    "| GET /v1/providers/:id | Single provider with models |",
    "| GET /v1/models | List models (filterable, sortable, paginated) |",
    "| GET /v1/models/:provider/:id | Single model |",
    "| GET /v1/models/compare?ids= | Compare models |",
    "| GET /v1/families | Model families |",
    "| GET /v1/capabilities | All capabilities |",
    "",
    "## Query Parameters for /v1/models",
    "",
    "| Param | Description |",
    "|-------|-------------|",
    "| provider | Filter by provider id |",
    "| family | Filter by model family |",
    "| creator | Filter by original creator |",
    "| status | active, deprecated, preview |",
    "| capability | reasoning, vision, tool_call, etc. |",
    "| q | Search across id, name, description |",
    "| sort | name, context_window, price_input, price_output |",
    "| order | asc (default), desc |",
    "| limit | Max 500, default 100 |",
    "| offset | Default 0 |",
    "",
    "## Response Format",
    "",
    "- Success: `{ data, meta: { total, limit, offset } }`",
    "- Error: `{ error: { message, status } }`",
  ].join("\n");
}

function renderModelChanges(
  providerId: string,
  modelId: string,
): string | null {
  const model = getModel(providerId, modelId);
  if (!model) return null;
  const provider = getProvider(providerId);
  const changes = getChanges().filter(
    (e) => e.provider === providerId && e.model === modelId,
  );

  const lines = [
    `# Changes — ${model.name}`,
    "",
    `Provider: ${provider?.name ?? providerId}`,
    `${changes.length} entries.`,
    "",
  ];

  if (changes.length === 0) {
    lines.push("No changes recorded for this model.");
  } else {
    lines.push("| Date | Action | Changes |", "|------|--------|---------|");
    for (const entry of changes) {
      const date = new Date(entry.ts).toISOString().slice(0, 10);
      const detail = formatChangeDetail(entry.changes);
      lines.push(`| ${date} | ${entry.action} | ${detail} |`);
    }
  }

  return lines.join("\n");
}

function renderModel(provider: string, id: string): string | null {
  const model = getModel(provider, id);
  if (!model) return null;

  const providerInfo = getProvider(provider);

  const lines = [
    `# ${model.name}`,
    "",
    `> ${model.description ?? "No description available."}`,
    "",
    "## Overview",
    "",
    `- **ID**: \`${model.id}\``,
    `- **Provider**: ${providerInfo?.name ?? provider} (${providerInfo?.region ?? "?"})`,
    `- **Creator**: ${model.created_by}`,
    `- **Family**: ${model.family ?? "—"}`,
    `- **Status**: ${model.status ?? "—"}`,
    `- **Source**: ${model.source}`,
    "",
    "## Specifications",
    "",
    `- **Context window**: ${model.context_window != null ? `${formatTokens(model.context_window)} tokens` : "—"}`,
    `- **Max context window**: ${model.max_context_window != null ? `${formatTokens(model.max_context_window)} tokens` : "—"}`,
    `- **Max output**: ${model.max_output_tokens != null ? `${formatTokens(model.max_output_tokens)} tokens` : "—"}`,
    `- **Max input**: ${model.max_input_tokens != null ? `${formatTokens(model.max_input_tokens)} tokens` : "—"}`,
    `- **Input modalities**: ${model.modalities?.input?.join(", ") ?? "—"}`,
    `- **Output modalities**: ${model.modalities?.output?.join(", ") ?? "—"}`,
    `- **Knowledge cutoff**: ${model.knowledge_cutoff ?? "—"}`,
    `- **Release date**: ${model.release_date ?? "—"}`,
  ];

  if (model.pricing && Object.values(model.pricing).some((v) => v != null)) {
    lines.push("", "## Pricing (USD per 1M tokens)", "");
    lines.push("| Type | Price |", "|------|-------|");
    if (model.pricing.input != null)
      lines.push(`| Input | $${model.pricing.input} |`);
    if (model.pricing.output != null)
      lines.push(`| Output | $${model.pricing.output} |`);
    if (model.pricing.cache_write != null)
      lines.push(`| Cache write | $${model.pricing.cache_write} |`);
    if (model.pricing.cached_input != null)
      lines.push(`| Cache read | $${model.pricing.cached_input} |`);
    if (model.pricing.batch_input != null)
      lines.push(`| Batch input | $${model.pricing.batch_input} |`);
    if (model.pricing.batch_output != null)
      lines.push(`| Batch output | $${model.pricing.batch_output} |`);
  }

  if (model.capabilities) {
    lines.push("", "## Capabilities", "");
    const caps = [
      "vision",
      "tool_call",
      "structured_output",
      "reasoning",
      "json_mode",
      "streaming",
      "fine_tuning",
      "batch",
    ] as const;
    for (const key of caps) {
      const val = model.capabilities[key];
      let icon = "?";
      if (val === true) icon = "✓";
      else if (val === false) icon = "✗";
      lines.push(`- ${icon} ${key.replace(/_/g, " ")}`);
    }
  }

  lines.push(
    "",
    "## API",
    "",
    "```",
    `GET https://api.modelpedia.dev/v1/models/${model.provider}/${model.id}`,
    "```",
  );

  return lines.join("\n");
}
