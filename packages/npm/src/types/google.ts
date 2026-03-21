import type { Model } from "../types";

/** Google AI-specific model fields beyond base ModelData */
export interface GoogleModel extends Model {
  /** Supports Google Search grounding */
  grounding?: boolean;
  /** Supports code execution sandbox */
  code_execution?: boolean;
  /** Supported generation methods from API */
  generation_methods?: string[];
}
