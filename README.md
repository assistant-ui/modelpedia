# modelpedia

Open catalog of AI models across providers. Compare specs, pricing, and capabilities.

[![CI](https://github.com/assistant-ui/modelpedia/actions/workflows/check.yml/badge.svg)](https://github.com/assistant-ui/modelpedia/actions/workflows/check.yml)
[![npm version](https://img.shields.io/npm/v/modelpedia.svg)](https://www.npmjs.com/package/modelpedia)
[![license](https://img.shields.io/npm/l/modelpedia.svg)](./LICENSE)

**Website:** [modelpedia.dev](https://modelpedia.dev) | **API:** [api.modelpedia.dev](https://api.modelpedia.dev) | **npm:** [modelpedia](https://www.npmjs.com/package/modelpedia)

## Features

- 2000+ models across 30+ providers
- Specs, pricing, capabilities, and modalities
- Daily auto-updated from official provider APIs
- Compare models side-by-side
- Free REST API
- npm package for programmatic access

## npm Package

```bash
npm install modelpedia
```

```typescript
import { allModels, getModel, getProvider } from "modelpedia";

const model = getModel("openai", "gpt-4o");
console.log(model?.pricing); // { input: 2.5, output: 10, ... }
```

See [packages/data/README.md](./packages/data/README.md) for full API docs.

## Project Structure

```
apps/
  web/        → Next.js website (modelpedia.dev)
  api/        → Hono API on Cloudflare Workers (api.modelpedia.dev)
packages/
  data/       → Model data & npm package (modelpedia)
  tsconfig/   → Shared TypeScript configs
```

## Development

```bash
pnpm install
pnpm dev          # Start all apps
pnpm dev:web      # Website only
pnpm dev:api      # API only
pnpm build        # Build all packages
pnpm lint         # Lint with Biome
```

## Data

Model data lives in `packages/data/providers/<provider>/models/*.json`.

```bash
pnpm fetch:all    # Fetch latest from all provider APIs
pnpm generate     # Regenerate data.ts from JSON files
pnpm validate     # Validate data integrity
```

### Adding a provider or model

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details on adding providers, models, or improving existing data.

## License

[MIT](./LICENSE) — [assistant-ui](https://github.com/assistant-ui)
