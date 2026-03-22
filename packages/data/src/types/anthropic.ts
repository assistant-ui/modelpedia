import type { Model } from "../types";

/** Anthropic-specific model fields beyond base ModelData */
export interface AnthropicModel extends Model {
  /** Supports extended thinking (chain-of-thought with thinking tokens) */
  extended_thinking?: boolean;
  /** Supports adaptive thinking */
  adaptive_thinking?: boolean;
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
}
