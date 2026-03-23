# @modelpedia/api

REST API for [api.modelpedia.dev](https://api.modelpedia.dev) — query AI model data programmatically.

## Stack

- [Hono](https://hono.dev) on [Cloudflare Workers](https://workers.cloudflare.com)

## Development

From the monorepo root:

```bash
pnpm dev:api
```

Or from this directory:

```bash
pnpm dev
```

The dev server starts at `http://localhost:8787`.

## Deployment

```bash
pnpm deploy
```

Deploys to Cloudflare Workers via [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

## Endpoints

All endpoints are under the `/v1` prefix.

| Path | Description |
|------|-------------|
| `/stats` | Aggregate statistics |
| `/providers` | List all providers |
| `/providers/compare` | Compare providers |
| `/providers/:id` | Get provider details |
| `/models` | List all models (with filtering) |
| `/models/compare` | Compare models |
| `/models/latest` | Recently added models |
| `/models/recommend` | Model recommendations |
| `/models/types` | List model types |
| `/models/:provider/:id` | Get model details |
| `/creators` | List model creators |
| `/pricing/compare` | Compare pricing |
| `/capabilities` | List capabilities |
| `/modalities` | List modalities |
| `/tools` | List tools |
| `/search` | Search models |
| `/families` | List model families |
| `/export` | Export all data |

See [API docs](https://modelpedia.dev/docs/api) for full details.
