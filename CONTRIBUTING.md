# Contributing to modelpedia

Thanks for your interest in contributing! This guide covers how to add or improve model data, fix bugs, and submit changes.

## Getting Started

```bash
git clone https://github.com/assistant-ui/modelpedia.git
cd modelpedia
pnpm install
pnpm dev
```

Requirements: Node.js 22+, pnpm 10+, [Bun](https://bun.sh) (for data scripts).

## Adding or Updating Model Data

Model data lives in `packages/data/providers/<provider>/models/<model-id>.json`.

### Add a new model to an existing provider

1. Create a JSON file at `packages/data/providers/<provider>/models/<model-id>.json`
2. Follow this structure:

```json
{
  "id": "model-id",
  "name": "Model Display Name",
  "created_by": "creator-id",
  "source": "community",
  "last_updated": "2026-01-01",
  "family": "model-family",
  "status": "active",
  "context_window": 128000,
  "max_output_tokens": 16384,
  "pricing": {
    "input": 2.5,
    "output": 10
  },
  "capabilities": {
    "streaming": true,
    "tool_call": true,
    "vision": true
  },
  "modalities": {
    "input": ["text", "image"],
    "output": ["text"]
  }
}
```

3. Set `"source": "community"` for manually contributed data (auto-fetch scripts will skip it)
4. Set `"source": "official"` only if the data comes from a fetch script
5. Run `pnpm validate` to check your data

### Add a new provider

1. Create `packages/data/providers/<provider-id>/`
2. Add `_provider.json`:

```json
{
  "id": "provider-id",
  "name": "Provider Name",
  "region": "US",
  "url": "https://provider.com",
  "api_url": "https://api.provider.com/v1",
  "docs_url": "https://docs.provider.com",
  "pricing_url": "https://provider.com/pricing"
}
```

3. Optionally add `icon.svg` (monochrome, `viewBox="0 0 24 24"`, `fill="currentColor"`)
4. Add model JSON files in `models/`
5. Run `pnpm generate && pnpm validate`

### Data conventions

- Pricing is in **USD per 1M tokens**
- Dates use **YYYY-MM-DD** format
- Knowledge cutoff uses **YYYY-MM** or **YYYY-MM-DD**
- Omit unknown fields rather than guessing
- Use `null` for fields that are confirmed as not applicable

## Code Changes

1. Fork the repo and create a branch
2. Make your changes
3. Run `pnpm lint` and `pnpm build` to verify
4. Submit a pull request

## Pull Request Guidelines

- Keep PRs focused — one provider or one feature per PR
- Include the source for any data you add (official docs, API responses, etc.)
- For model data PRs, run `pnpm validate` and confirm it passes

## Reporting Issues

Use [GitHub Issues](https://github.com/assistant-ui/modelpedia/issues) for:

- Incorrect or outdated model data
- Missing providers or models
- Bug reports
- Feature requests

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
