import type { Model } from "../types";

/**
 * Anthropic thinking mode identifiers.
 * - `extended`: fixed-budget chain-of-thought with thinking tokens
 * - `adaptive`: model decides when/how much to think
 * Add new values here (e.g. `"radical"`) as Anthropic introduces them.
 */
export type AnthropicThinkingMode = "extended" | "adaptive";

/** Anthropic-specific model fields beyond base ModelData */
export interface AnthropicModel extends Model {
  /** Supported thinking modes. Empty/absent means no thinking support. */
  thinking_modes?: AnthropicThinkingMode[];
  /** Maximum thinking/reasoning budget tokens */
  max_thinking_tokens?: number;
  /** Supports computer use tool */
  computer_use?: boolean;
  /** Supports prompt caching */
  prompt_caching?: boolean;
  /** Supports citation extraction */
  citations?: boolean;
  /** Supports PDF file input */
  pdf_input?: boolean;
  /** Supports priority tier service */
  priority_tier?: boolean;
  /** Training data cutoff date (broader than knowledge_cutoff) */
  training_data_cutoff?: string;
  /** AWS Bedrock model identifier */
  bedrock_id?: string;
  /** GCP Vertex AI model identifier */
  vertex_id?: string;
  /** Fast mode premium pricing (per 1M tokens). Beta research preview on select models. */
  fast_mode_pricing?: { input: number; output: number };
}
