# modelpedia

Open catalog of AI model data — specs, pricing, and capabilities across 30+ providers and 2000+ models.

[![npm version](https://img.shields.io/npm/v/modelpedia.svg)](https://www.npmjs.com/package/modelpedia)
[![license](https://img.shields.io/npm/l/modelpedia.svg)](https://github.com/assistant-ui/modelpedia/blob/master/LICENSE)

## Install

```bash
npm install modelpedia
```

## Usage

```typescript
import {
  allModels,
  providers,
  getModel,
  getProvider,
  getActiveModels,
  getModelsByProvider,
  getModelsByFamily,
  getModelsByCreator,
} from "modelpedia";

// All models (2000+)
console.log(allModels.length);

// Find a specific model
const model = getModel("openai", "gpt-4o");
console.log(model?.pricing); // { input: 2.5, output: 10, ... }

// Get all active (non-deprecated) models
const active = getActiveModels();

// List models by provider
const openaiModels = getModelsByProvider("openai");

// List models by family
const gpt4oFamily = getModelsByFamily("gpt-4o");

// List models by creator (useful for aggregators like OpenRouter)
const anthropicModels = getModelsByCreator("anthropic");

// Get provider info
const provider = getProvider("anthropic");
console.log(provider?.name); // "Anthropic"
console.log(provider?.api_url); // "https://api.anthropic.com/v1"
```

### Per-provider imports

Import only the provider you need for smaller bundle size:

```typescript
import { provider, models } from "modelpedia/openai";
console.log(provider.name); // "OpenAI"
console.log(models.length); // 151

import { models as anthropicModels } from "modelpedia/anthropic";
import { models as googleModels } from "modelpedia/google";
```

Available: `modelpedia/openai`, `modelpedia/anthropic`, `modelpedia/google`, `modelpedia/mistral`, `modelpedia/deepseek`, `modelpedia/xai`, and 24 more.

## Data Structure

### Model

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Model identifier used in API calls |
| `name` | `string` | Human-readable display name |
| `provider` | `string` | Provider ID (e.g. `"openai"`) |
| `created_by` | `string` | Original creator (may differ from provider) |
| `family` | `string?` | Model family/series (e.g. `"gpt-4o"`) |
| `description` | `string?` | Model description |
| `tagline` | `string?` | One-line summary |
| `status` | `"active" \| "deprecated" \| "preview"` | Lifecycle status |
| `model_type` | `string?` | `chat`, `reasoning`, `embed`, `image`, `video`, `tts`, `transcription`, `moderation`, `rerank`, `code` |
| `context_window` | `number?` | Default context window (tokens) |
| `max_output_tokens` | `number?` | Maximum output tokens |
| `knowledge_cutoff` | `string?` | Training data cutoff (`YYYY-MM` or `YYYY-MM-DD`) |
| `pricing` | `ModelPricing?` | Pricing per 1M tokens + detailed tiers |
| `capabilities` | `ModelCapabilities?` | vision, tool_call, streaming, reasoning, etc. |
| `modalities` | `ModelModalities?` | Input/output modality support (text, image, audio, video) |
| `tools` | `string[]?` | Supported tools (function_calling, web_search, mcp, etc.) |
| `endpoints` | `string[]?` | Supported API endpoints (chat_completions, responses, batch, etc.) |
| `successor` | `string?` | Recommended replacement model (for deprecated models) |
| `performance` | `number?` | Intelligence rating (1-5) |
| `reasoning` | `number?` | Reasoning rating (1-5) |
| `speed` | `number?` | Speed rating (1-5) |

### Pricing

Flat fields for quick access:

```typescript
model.pricing?.input       // USD per 1M input tokens
model.pricing?.output      // USD per 1M output tokens
model.pricing?.cached_input // USD per 1M cached input tokens
model.pricing?.batch_input  // USD per 1M batch input tokens
```

Detailed tiers for models with multiple pricing categories:

```typescript
model.pricing?.tiers  // PricingTier[] — text tokens, audio tokens, image generation, etc.
```

### Provider

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider identifier |
| `name` | `string` | Display name |
| `region` | `string` | Country code (ISO 3166-1 alpha-2) |
| `url` | `string` | Website URL |
| `api_url` | `string` | API base URL |
| `docs_url` | `string` | Documentation URL |
| `pricing_url` | `string` | Pricing page URL |

## Providers

Alibaba Cloud, Amazon Bedrock, Anthropic, Azure, Baseten, Cerebras, Cloudflare, Cohere, Cursor, DeepSeek, Fireworks, Google, Groq, Hugging Face, Meta, Minimax, Mistral, Moonshot, NVIDIA, Ollama, OpenAI, OpenCode, OpenRouter, Perplexity, Qwen, Together AI, Vercel, Vertex AI, xAI, Z.AI, and more.

## Data Updates

Model data is automatically fetched from provider APIs daily. Community contributions are welcome — see [CONTRIBUTING.md](https://github.com/assistant-ui/modelpedia/blob/master/CONTRIBUTING.md).

## License

[MIT](https://github.com/assistant-ui/modelpedia/blob/master/LICENSE)
