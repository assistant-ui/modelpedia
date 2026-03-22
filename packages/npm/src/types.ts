/** Model lifecycle status */
export type ModelStatus = "active" | "deprecated" | "preview";

/** Data source: "official" (auto-fetched, scripts can overwrite) or "community" (manual, scripts skip) */
export type ModelSource = "official" | "community";

/** Supported input/output data types */
export type Modality = "text" | "image" | "audio" | "video";

/**
 * Model capabilities.
 * All fields optional — omit if unknown, present if known.
 */
export interface ModelCapabilities {
  /** Can process image inputs */
  vision?: boolean;
  /** Supports function/tool calling */
  tool_call?: boolean;
  /** Supports structured JSON output (schema-constrained) */
  structured_output?: boolean;
  /** Uses chain-of-thought reasoning (o1/o3-style) */
  reasoning?: boolean;
  /** Supports JSON mode output */
  json_mode?: boolean;
  /** Supports streaming responses */
  streaming?: boolean;
  /** Available for fine-tuning */
  fine_tuning?: boolean;
  /** Supports batch API */
  batch?: boolean;
  /** Supports prompt caching */
  prompt_caching?: boolean;
}

/** Input and output modality support */
export interface ModelModalities {
  /** Accepted input types (e.g. ["text", "image"]) */
  input?: Modality[];
  /** Produced output types (e.g. ["text"]) */
  output?: Modality[];
}

/**
 * Pricing in USD per 1M tokens.
 * - field omitted = price unknown
 * - null = not supported / not applicable
 * - number = known price
 */
export interface ModelPricing {
  /** Cost per 1M input tokens */
  input?: number | null;
  /** Cost per 1M output tokens */
  output?: number | null;
  /** Cost per 1M cached input tokens (cache read) */
  cached_input?: number | null;
  /** Cost per 1M tokens written to cache (cache write) */
  cache_write?: number | null;
  /** Cost per 1M batch input tokens */
  batch_input?: number | null;
  /** Cost per 1M batch output tokens */
  batch_output?: number | null;
  /** Cost per 1M cached output tokens (reasoning models) */
  cached_output?: number | null;
  /** Detailed pricing breakdown by category (text/audio/image tokens, per-image, etc.) */
  tiers?: PricingTier[];
}

/** A pricing section for a specific category (e.g. "Text tokens", "Image generation") */
export interface PricingTier {
  /** Section label (e.g. "Text tokens", "Audio tokens", "Image generation") */
  label: string;
  /** Pricing unit (e.g. "Per 1M tokens", "Per image") */
  unit: string;
  /** Column headers (e.g. ["Input", "Cached input", "Output"] or ["1024x1024", "1024x1536"]) */
  columns: string[];
  /** Rows of pricing data (e.g. Standard, Batch, Flex, Priority or Low, Medium, High) */
  rows: PricingTierRow[];
}

/** A single row in a pricing tier table */
export interface PricingTierRow {
  /** Row label (e.g. "Standard", "Batch", "Low quality") */
  label: string;
  /** Values aligned with columns, null if not applicable */
  values: (number | null)[];
}

/**
 * Raw model data as stored in JSON files.
 * Optional fields: omit if unknown, null if not applicable.
 */
export interface ModelData {
  /** Unique model identifier used in API calls (e.g. "gpt-5.4", "anthropic/claude-opus-4.6") */
  id: string;
  /** Human-readable display name (e.g. "GPT-5.4", "Claude Opus 4.6") */
  name: string;
  /** Original model creator (e.g. "openai", "anthropic"). May differ from provider for aggregators. */
  created_by: string;
  /** Data source: "official" (auto-fetched) or "community" (manual contribution) */
  source: ModelSource;
  /** Last data update date (YYYY-MM-DD) */
  last_updated: string;

  /** Model family/series for grouping (e.g. "gpt-5.4", "claude-opus", "gemini-2.5") */
  family?: string;
  /** Short description of the model */
  description?: string;
  /** One-line tagline / subtitle */
  tagline?: string;
  /** Current lifecycle status */
  status?: ModelStatus;
  /** Release date (YYYY-MM-DD), null if not applicable */
  release_date?: string | null;
  /** Deprecation date (YYYY-MM-DD), null if not deprecated */
  deprecation_date?: string | null;
  /** Training data cutoff (YYYY-MM or YYYY-MM-DD), null if not disclosed */
  knowledge_cutoff?: string | null;
  /** Default context window in tokens, null if unlimited */
  context_window?: number | null;
  /** Extended context window in tokens (e.g. Max Mode, long-context tier). Omit if same as context_window. */
  max_context_window?: number | null;
  /** Maximum output tokens per request, null if unlimited */
  max_output_tokens?: number | null;
  /** Maximum input tokens per request (if different from context_window), null if same */
  max_input_tokens?: number | null;
  /** Model capabilities */
  capabilities?: ModelCapabilities;
  /** Supported input/output modalities */
  modalities?: ModelModalities;
  /** Pricing per 1M tokens */
  pricing?: ModelPricing;
  /** Model type classification */
  model_type?:
    | "chat"
    | "reasoning"
    | "embed"
    | "rerank"
    | "image"
    | "video"
    | "audio"
    | "tts"
    | "transcription"
    | "moderation"
    | "code"
    | "translation"
    | "other";
  /** Supported tools and integrations (e.g. "function_calling", "web_search", "computer_use", "mcp") */
  tools?: string[];
  /** Supported API endpoints (e.g. "chat_completions", "responses", "batch") */
  endpoints?: string[];
  /** Whether output includes reasoning/thinking tokens (o-series, extended thinking) */
  reasoning_tokens?: boolean;
  /**
   * For alias models: list of snapshot IDs this alias has pointed to.
   * e.g. on "claude-opus-4-6": ["claude-opus-4-6-20260101", "claude-opus-4-6-20260701"]
   * Each snapshot has its own file with its own specs.
   */
  snapshots?: string[];
  /**
   * For snapshot models: the stable alias ID this snapshot belongs to.
   * e.g. on "claude-opus-4-6-20260101": "claude-opus-4-6"
   */
  alias?: string;
  /** Intelligence/performance rating (1-5 scale, provider-defined) */
  performance?: number;
  /** Reasoning capability level (1-5 scale, null if not supported) */
  reasoning?: number;
  /** Speed/latency rating (1-5 scale, 1=slow 5=fast) */
  speed?: number;
  /** Recommended successor model ID(s) (for deprecated models) */
  successor?: string | string[];
  /** Pricing notes/caveats (e.g. long-context surcharges, regional uplifts) */
  pricing_notes?: string[];
  /** Provider-specific extra fields (extended_thinking, training_data_cutoff, etc.) */
  [key: string]: unknown;
}

/** Model data with provider context, used at runtime */
export interface Model extends ModelData {
  /** Provider this model belongs to (directory name, e.g. "openai", "openrouter") */
  provider: string;
}

/** Provider type classification */
export type ProviderType = "direct" | "aggregator" | "cloud";

/** AI model provider / API service */
export interface Provider {
  /** Unique provider identifier (directory name, e.g. "openai", "openrouter") */
  id: string;
  /** Display name (e.g. "OpenAI", "OpenRouter") */
  name: string;
  /** Short description of the provider */
  description?: string;
  /** Provider type: direct (creates models), aggregator (resells), cloud (platform) */
  type?: ProviderType;
  /** Headquarters country, ISO 3166-1 alpha-2 (e.g. "US", "CN", "FR") */
  region: string;
  /** General training data cutoff for this provider's latest models (YYYY-MM or YYYY-MM-DD) */
  knowledge_cutoff?: string;
  /** Provider website URL */
  url: string;
  /** API base URL */
  api_url: string;
  /** Documentation URL */
  docs_url: string;
  /** Pricing page URL */
  pricing_url: string;
  /** Playground base URL */
  playground_url?: string;
  /** Status / uptime page URL */
  status_url?: string;
  /** Changelog / release notes URL */
  changelog_url?: string;
  /** Official SDK packages (e.g. { python: "openai", javascript: "@anthropic-ai/sdk" }) */
  sdk?: Record<string, string>;
  /** Whether the provider offers a free tier / free credits */
  free_tier?: boolean;
  /** Inline SVG icon (monochrome, viewBox 0 0 24 24, fill="currentColor"). Auto-read from icon.svg. */
  icon?: string;
  /** Provider-specific extra fields */
  [key: string]: unknown;
}

/** Provider with its full model list, used in generated data */
export interface ProviderWithModels extends Provider {
  /** All models under this provider */
  models: ModelData[];
}
