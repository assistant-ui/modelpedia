# modelpedia

Open catalog of AI models across providers. Compare specs, pricing, and capabilities.

## Structure

```
apps/
  web/        → Next.js website (modelpedia.dev)
  api/        → Hono API (api.modelpedia.dev)
packages/
  data/       → Model data package (npm: modelpedia)
  tsconfig/   → Shared TypeScript configs
```

## Development

```bash
pnpm install
pnpm dev          # Start all apps
pnpm dev:web      # Start website only
pnpm dev:api      # Start API only
pnpm build        # Build all packages
```

## Data

```bash
pnpm generate     # Regenerate data.ts from provider JSON files
pnpm fetch:all    # Fetch latest model data from all providers
pnpm validate     # Validate data integrity
```

## License

MIT — [assistant-ui](https://github.com/assistant-ui)
