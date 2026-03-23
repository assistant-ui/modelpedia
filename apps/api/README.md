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

## MCP

The API supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing AI assistants to query Modelpedia data directly.

**Endpoint:** `https://api.modelpedia.dev/mcp`

### Setup

Add the MCP server to your client:

#### Claude Code

```bash
claude mcp add modelpedia --transport http https://api.modelpedia.dev/mcp
```

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "modelpedia": {
      "type": "url",
      "url": "https://api.modelpedia.dev/mcp"
    }
  }
}
```

#### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "modelpedia": {
      "type": "url",
      "url": "https://api.modelpedia.dev/mcp"
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_stats` | Get overall statistics (providers, models, families, creators) |
| `list_providers` | List all AI model providers |
| `get_provider` | Get detailed provider info by ID |
| `list_models` | List/filter/sort models by provider, family, capability, etc. |
| `get_model` | Get detailed model info by provider and model ID |
| `compare_models` | Compare multiple models side by side |
| `recommend_models` | Get recommendations by capability, price, modality |
| `compare_pricing` | Compare pricing across models |
| `search` | Search across providers and models |
| `list_capabilities` | List all capabilities with model counts |
| `list_families` | List all model families |

## REST API

All REST endpoints are under the `/v1` prefix and are rate-limited to **60 requests per minute** per IP.

### Endpoints

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
