# Contributing to modelpedia

Thanks for your interest in contributing! This guide covers how to fix model data, add new models/providers, and write fetch scripts.

## Getting Started

```bash
git clone https://github.com/assistant-ui/modelpedia.git
cd modelpedia
pnpm install
pnpm dev
```

Requirements: Node.js 22+, pnpm 10+, [Bun](https://bun.sh) (for data scripts).

## Fixing Model Data

Found wrong pricing, missing capabilities, or outdated info? Just edit the JSON file and submit a PR.

**Edit** `packages/data/providers/<provider>/models/<model-id>.json`, change the value, done.

Your change is automatically protected from being overwritten. Fetch scripts track what they last generated (via the `_generated` field). When they run again, they detect your manual edit and preserve it. No special annotations needed.

### How auto-protection works

Each model file has a `_generated` field recording what the script last wrote:

```json
{
  "context_window": 200000,
  "_generated": {
    "context_window": 128000
  }
}
```

When the fetch script runs next:

1. Current value `200000` != last generated `128000` → someone manually changed it
2. Script keeps `200000`, does not overwrite
3. Script updates `_generated` to track its own new value

This means scripts can still update **other** fields (pricing, capabilities, etc.) while preserving your fix.

### Data sources

| `source` | Behavior |
|----------|----------|
| `"official"` (default) | Auto-fetched by scripts. Scripts update non-manual fields. |
| `"community"` | Fully manual. Scripts skip the entire model. |

Use `"community"` only for models that no fetch script covers.

## Model JSON Schema

Files live at `packages/data/providers/<provider>/models/<id>.json`.

### Required fields

| Field | Type | Example |
|-------|------|---------|
| `id` | string | `gpt-4o`, `claude-opus-4-6` |
| `name` | string | `GPT-4o`, `Claude Opus 4.6` |
| `created_by` | string | `openai`, `anthropic` |
| `source` | `"official"` \| `"community"` | `"community"` |
| `last_updated` | string | `2026-01-01` |

### Optional fields

```json
{
  "family": "gpt-4o",
  "description": "Full description of the model.",
  "tagline": "One-line summary.",
  "status": "active",
  "model_type": "chat",
  "context_window": 128000,
  "max_output_tokens": 16384,
  "max_input_tokens": 128000,
  "knowledge_cutoff": "2024-10",
  "release_date": "2024-05-13",
  "deprecation_date": null,
  "successor": "gpt-5",
  "reasoning_tokens": false,
  "performance": 3,
  "reasoning": null,
  "speed": 3,
  "capabilities": {
    "vision": true,
    "tool_call": true,
    "structured_output": true,
    "reasoning": false,
    "json_mode": true,
    "streaming": true,
    "fine_tuning": true,
    "batch": true
  },
  "modalities": {
    "input": ["text", "image"],
    "output": ["text"]
  },
  "tools": ["function_calling", "web_search", "mcp"],
  "endpoints": ["chat_completions", "responses", "batch"],
  "pricing": {
    "input": 2.5,
    "output": 10,
    "cached_input": 1.25,
    "batch_input": 1.25,
    "batch_output": 5
  }
}
```

### Model types

`chat`, `reasoning`, `embed`, `image`, `video`, `tts`, `transcription`, `moderation`, `rerank`, `code`

Auto-inferred from model ID if not set.

### Pricing

**Flat fields** (per 1M tokens) are used for list/compare views: `input`, `output`, `cached_input`, `cache_write`, `batch_input`, `batch_output`.

**Tiers** are used for models with multiple pricing categories (image gen, audio, etc.):

```json
{
  "pricing": {
    "input": 5,
    "output": 10,
    "tiers": [
      {
        "label": "Text tokens",
        "unit": "Per 1M tokens",
        "columns": ["Input", "Cached input", "Output"],
        "rows": [
          { "label": "Standard", "values": [5, 1.25, 10] },
          { "label": "Batch", "values": [2.5, null, 5] }
        ]
      },
      {
        "label": "Image generation",
        "unit": "Per image",
        "columns": ["Quality", "1024x1024", "1024x1536"],
        "rows": [
          { "label": "Low", "values": [null, 0.009, 0.013] },
          { "label": "High", "values": [null, 0.133, 0.20] }
        ]
      }
    ]
  }
}
```

### Conventions

- Pricing is in **USD per 1M tokens**
- Dates use **YYYY-MM-DD**, knowledge cutoff uses **YYYY-MM** or **YYYY-MM-DD**
- Modalities: `text`, `image`, `audio`, `video`
- Omit unknown fields rather than guessing
- Use `null` for fields confirmed as not applicable

## Adding a New Provider

1. Create `packages/data/providers/<id>/`:

```
providers/
  example/
    _provider.json
    icon.svg          (optional)
    models/
      model-1.json
      model-2.json
```

2. Provider metadata (`_provider.json`):

```json
{
  "id": "example",
  "name": "Example AI",
  "region": "US",
  "url": "https://example.com",
  "api_url": "https://api.example.com/v1",
  "docs_url": "https://docs.example.com",
  "pricing_url": "https://example.com/pricing"
}
```

3. Icon: monochrome SVG, `viewBox="0 0 24 24"`, `fill="currentColor"`.

4. Run `pnpm generate && pnpm validate`.

## Writing a Fetch Script

Fetch scripts auto-update model data from provider docs/APIs. They live in `packages/data/scripts/fetch-<provider>.ts`.

### Key utilities

```typescript
import {
  upsertModel,          // Write model, merge with existing, protect manual edits
  upsertWithSnapshot,   // Write alias + date-stamped snapshot models
  inferFamily,          // Infer family from ID (gpt-4o → gpt-4o)
  inferModelType,       // Infer type from ID (whisper-1 → transcription)
  normalizeDate,        // Normalize dates (May 2025 → 2025-05)
  firstSentence,        // Extract first sentence for tagline
  runGenerate,          // Regenerate data.ts after writing
} from "./shared.ts";
```

### Guidelines

- **Include all model types** — don't filter out embed, image, TTS, moderation, etc.
- `model_type` and `tagline` are auto-inferred by `upsertModel` if not set
- Use `upsertWithSnapshot` for models with date-stamped versions (e.g. `gpt-4o-2024-08-06`)
- Manual user edits are automatically preserved via `_generated` tracking
- Call `runGenerate()` at the end to rebuild `data.ts`

### Running

```bash
pnpm fetch:openai      # Single provider
pnpm fetch:all         # All providers
```

## Validation

```bash
pnpm validate          # Validate model/provider JSON files
pnpm validate:changes  # Validate changes.jsonl
```

## Pull Request Guidelines

- Keep PRs focused — one provider or one feature per PR
- Include the source for data changes (official docs, API responses, etc.)
- Run `pnpm validate` before submitting

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
