import type { Model } from "../types";

/** OpenAI-specific model fields beyond base ModelData */
export interface OpenAIModel extends Model {
  /** Supported features (e.g. "streaming", "structured_outputs", "prompt_caching", "predicted_outputs") */
  supported_features?: string[];
  /** Link to OpenAI Playground for this model */
  playground_url?: string;
}
