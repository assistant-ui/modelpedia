# @modelpedia/data

Core data package — model definitions, fetch scripts, validation, and code generation.

## Structure

```
providers/
  <provider>/
    provider.json          → Provider metadata
    models/*.json          → Individual model definitions
    overrides.json         → Manual overrides (protected from auto-fetch)
scripts/
  fetch-<provider>.ts     → Auto-fetch from provider APIs
  generate.ts             → Generate TypeScript from JSON
  validate.ts             → Data integrity checks
  detect-changes.ts       → Track model data changes
src/
  index.ts                → Exported data access API
```

## Commands

```bash
pnpm generate             # Regenerate data.ts from JSON files
pnpm validate             # Validate all model data
pnpm fetch:all            # Fetch latest from all provider APIs
pnpm fetch:<provider>     # Fetch from a specific provider
```

## Adding Data

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for details on adding or updating providers and models.
