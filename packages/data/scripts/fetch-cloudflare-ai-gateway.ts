import {
  buildPricing,
  envOrNull,
  inferFamily,
  inferModelType,
  inferParameters,
  type ModelEntry,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Cloudflare AI Gateway models from the /compat/v1/models API.
 *
 * The API returns every model the gateway can route, with per-token costs
 * and the upstream provider name (owned_by).
 *
 * Env vars:
 *   CLOUDFLARE_ACCOUNT_ID          — CF account ID
 *   CLOUDFLARE_AI_GATEWAY_ID       — CF AI Gateway ID
 *   CLOUDFLARE_AI_GATEWAY_TOKEN    — CF API token with AI Gateway permissions
 */

const PROVIDER = "cloudflare-ai-gateway";

// CF AI Gateway provider names → our internal provider IDs
const CF_TO_INTERNAL: Record<string, string | null> = {
  "aws-bedrock": "amazon",
  "azure-openai": "azure",
  "cerebras-ai": "cerebras",
  "google-ai-studio": "google",
  "google-vertex-ai": "vertex",
  grok: "xai",
  "perplexity-ai": "perplexity",
  "workers-ai": "cloudflare-workers-ai",
};

function mapProvider(cfProvider: string): string {
  const mapped = CF_TO_INTERNAL[cfProvider];
  if (mapped === null) return cfProvider;
  return mapped ?? cfProvider;
}

function mapProviderLabel(cfProvider: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    "google-ai-studio": "Google AI Studio",
    "google-vertex-ai": "Google Vertex AI",
    mistral: "Mistral",
    deepseek: "DeepSeek",
    groq: "Groq",
    grok: "xAI",
    cohere: "Cohere",
    "cerebras-ai": "Cerebras",
    "perplexity-ai": "Perplexity",
    "aws-bedrock": "Amazon Bedrock",
    "azure-openai": "Azure OpenAI",
    baseten: "Baseten",
    huggingface: "HuggingFace",
    replicate: "Replicate",
    "workers-ai": "Workers AI",
    openrouter: "OpenRouter",
    fal: "Fal AI",
    elevenlabs: "ElevenLabs",
    cartesia: "Cartesia",
    deepgram: "Deepgram",
    ideogram: "Ideogram",
    parallel: "Parallel",
  };
  return labels[cfProvider] ?? cfProvider;
}

interface CfModel {
  id: string;
  cost_in: number;
  cost_out: number;
  owned_by: string;
}

async function main() {
  const accountId = envOrNull("CLOUDFLARE_ACCOUNT_ID");
  const gatewayId = envOrNull("CLOUDFLARE_AI_GATEWAY_ID");
  const token = envOrNull("CLOUDFLARE_AI_GATEWAY_TOKEN");

  if (!accountId || !gatewayId || !token) {
    console.warn(
      "Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_AI_GATEWAY_ID / CLOUDFLARE_AI_GATEWAY_TOKEN — skipping",
    );
    runGenerate();
    return;
  }

  const apiUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat/v1/models`;
  console.log(`Fetching AI Gateway models from ${apiUrl}...`);

  const res = await fetch(apiUrl, {
    headers: { "cf-aig-authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`CF AI Gateway fetch failed: ${res.status}`);

  const data = (await res.json()) as { data: CfModel[] };
  console.log(`Got ${data.data.length} models from API`);

  const providerCounts = new Map<string, number>();
  let written = 0;

  for (const cfModel of data.data) {
    const slashIdx = cfModel.id.indexOf("/");
    if (slashIdx < 0) continue;

    const cfProvider = cfModel.id.slice(0, slashIdx);
    const bareModel = cfModel.id.slice(slashIdx + 1);
    const internalProvider = mapProvider(cfProvider);
    const providerLabel = mapProviderLabel(cfProvider);

    // Use the full CF ID as model ID (e.g. "openai/gpt-4o")
    const gatewayModelId = cfModel.id;

    const params = inferParameters(bareModel);
    const modelType = inferModelType(bareModel);

    const entry: ModelEntry = {
      id: gatewayModelId,
      name: `${providerLabel}: ${bareModel}`,
      created_by: internalProvider,
      family: inferFamily(bareModel),
      model_type: modelType,
      parameters: params?.parameters,
      active_parameters: params?.active_parameters,
    };

    // CF costs are per-token → convert to per-million-token
    if (cfModel.cost_in > 0 || cfModel.cost_out > 0) {
      entry.pricing = buildPricing({
        input: cfModel.cost_in * 1_000_000,
        output: cfModel.cost_out * 1_000_000,
      });
    }

    if (upsertModel(PROVIDER, entry)) written++;
    providerCounts.set(cfProvider, (providerCounts.get(cfProvider) ?? 0) + 1);
  }

  // Log breakdown
  const sorted = [...providerCounts.entries()].sort(([, a], [, b]) => b - a);
  for (const [p, count] of sorted) {
    console.log(`  ${p.padEnd(22)} ${String(count).padStart(4)} models`);
  }
  console.log(`\nWrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
