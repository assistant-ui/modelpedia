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
  /** Cost per 1M cached input tokens */
  cached_input?: number | null;
  /** Cost per 1M batch input tokens */
  batch_input?: number | null;
  /** Cost per 1M batch output tokens */
  batch_output?: number | null;
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
  /** Current lifecycle status */
  status?: ModelStatus;
  /** Release date (YYYY-MM-DD), null if not applicable */
  release_date?: string | null;
  /** Deprecation date (YYYY-MM-DD), null if not deprecated */
  deprecation_date?: string | null;
  /** Training data cutoff (YYYY-MM or YYYY-MM-DD), null if not disclosed */
  knowledge_cutoff?: string | null;
  /** Maximum context window in tokens, null if unlimited */
  context_window?: number | null;
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
    | "audio"
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
  /** Speed/latency rating (1-5 scale, 1=slow 5=fast) */
  speed?: number;
}

/** Model data with provider context, used at runtime */
export interface Model extends ModelData {
  /** Provider this model belongs to (directory name, e.g. "openai", "openrouter") */
  provider: string;
}

/** AI model provider / API service */
export interface Provider {
  /** Unique provider identifier (directory name, e.g. "openai", "openrouter") */
  id: string;
  /** Display name (e.g. "OpenAI", "OpenRouter") */
  name: string;
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
  /** Inline SVG icon (monochrome, viewBox 0 0 24 24, fill="currentColor"). Auto-read from icon.svg. */
  icon?: string;
}

/** Provider with its full model list, used in generated data */
export interface ProviderWithModels extends Provider {
  /** All models under this provider */
  models: ModelData[];
}
