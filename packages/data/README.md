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

## Data Structure

### Model

Each model includes:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Model identifier used in API calls |
| `name` | `string` | Human-readable display name |
| `provider` | `string` | Provider ID (e.g. `"openai"`) |
| `created_by` | `string` | Original creator (may differ from provider) |
| `family` | `string?` | Model family/series (e.g. `"gpt-4o"`) |
| `status` | `"active" \| "deprecated" \| "preview"` | Lifecycle status |
| `context_window` | `number?` | Default context window (tokens) |
| `max_output_tokens` | `number?` | Maximum output tokens |
| `pricing` | `ModelPricing?` | Pricing per 1M tokens (input, output, cache, batch) |
| `capabilities` | `ModelCapabilities?` | vision, tool_call, streaming, reasoning, etc. |
| `modalities` | `ModelModalities?` | Input/output modality support |
| `performance` | `number?` | Intelligence rating (1-5) |
| `reasoning` | `number?` | Reasoning rating (1-5) |
| `speed` | `number?` | Speed rating (1-5) |

### Provider

Each provider includes:

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

Alibaba Cloud, Amazon Bedrock, Anthropic, Azure, Baseten, Cerebras, Cloudflare, Cohere, Cursor, DeepSeek, Fireworks, Google, Groq, Hugging Face, Meta, Minimax, Mistral, Moonshot, NVIDIA, Ollama, OpenAI, OpenCode, OpenRouter, Perplexity, Qwen, Together AI, Vercel, Vertex AI, xAI, 01.AI, and more.

## Data Updates

Model data is automatically fetched from provider APIs daily. Community contributions for additional data are welcome — see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

[MIT](../../LICENSE)
