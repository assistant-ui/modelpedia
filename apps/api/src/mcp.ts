import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Model } from "@modelpedia/data";
import { allModels, getModel, getProvider, providers } from "@modelpedia/data";
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  aggregateCapabilities,
  aggregateFamilies,
  comparePricing,
  filterModels,
  type SortField,
  searchAll,
  sortModels,
} from "./query";

function createMcpServer() {
  const server = new McpServer({
    name: "modelpedia",
    version: "0.0.0",
  });

  // ── get_stats ──

  server.tool(
    "get_stats",
    "Get overall Modelpedia statistics",
    {},
    async () => {
      const families = new Set(allModels.map((m) => m.family).filter(Boolean));
      const creators = new Set(
        allModels.map((m) => m.created_by).filter(Boolean),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              providers: providers.length,
              models: allModels.length,
              families: families.size,
              creators: creators.size,
            }),
          },
        ],
      };
    },
  );

  // ── list_providers ──

  server.tool("list_providers", "List all AI model providers", {}, async () => {
    const data = providers.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      api_url: p.api_url,
      docs_url: p.docs_url,
      pricing_url: p.pricing_url,
      model_count: p.models.length,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
    };
  });

  // ── get_provider ──

  server.tool(
    "get_provider",
    "Get detailed information about a specific provider",
    { id: z.string().describe("Provider ID (e.g. 'openai', 'anthropic')") },
    async ({ id }) => {
      const provider = getProvider(id);
      if (!provider) {
        return {
          content: [{ type: "text", text: `Provider '${id}' not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(provider) }],
      };
    },
  );

  // ── list_models ──

  server.tool(
    "list_models",
    "List and filter AI models. Supports filtering by provider, family, creator, status, capability, model type, and text search.",
    {
      provider: z.optional(z.string().describe("Filter by provider ID")),
      family: z.optional(z.string().describe("Filter by model family")),
      creator: z.optional(z.string().describe("Filter by creator")),
      status: z.optional(
        z
          .enum(["active", "deprecated", "preview"])
          .describe("Filter by status"),
      ),
      capability: z.optional(
        z
          .string()
          .describe(
            "Filter by capability (e.g. 'vision', 'tool_call', 'reasoning')",
          ),
      ),
      model_type: z.optional(
        z.string().describe("Filter by model type (e.g. 'chat', 'embed')"),
      ),
      q: z.optional(z.string().describe("Text search query")),
      sort: z.optional(
        z
          .enum(["price_input", "price_output", "context_window", "name"])
          .describe("Sort field"),
      ),
      order: z.optional(z.enum(["asc", "desc"]).describe("Sort order")),
      limit: z.optional(
        z.number().describe("Max results (default 20, max 100)"),
      ),
      offset: z.optional(z.number().describe("Offset for pagination")),
    },
    async (params) => {
      const models = filterModels([...allModels], {
        provider: params.provider,
        family: params.family,
        creator: params.creator,
        status: params.status,
        capability: params.capability,
        model_type: params.model_type,
        q: params.q,
      });

      if (params.sort) {
        const order = params.order === "desc" ? -1 : 1;
        sortModels(models, params.sort as SortField, order as 1 | -1);
      }

      const limit = Math.min(params.limit ?? 20, 100);
      const offset = params.offset ?? 0;
      const slice = models.slice(offset, offset + limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              models: slice,
              total: models.length,
              limit,
              offset,
            }),
          },
        ],
      };
    },
  );

  // ── get_model ──

  server.tool(
    "get_model",
    "Get detailed information about a specific model",
    {
      provider: z.string().describe("Provider ID (e.g. 'openai')"),
      model_id: z.string().describe("Model ID (e.g. 'gpt-4o')"),
    },
    async ({ provider, model_id }) => {
      const model = getModel(provider, model_id);
      if (!model) {
        return {
          content: [
            {
              type: "text",
              text: `Model '${provider}/${model_id}' not found`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(model) }],
      };
    },
  );

  // ── compare_models ──

  server.tool(
    "compare_models",
    "Compare multiple models side by side. Provide IDs in 'provider/model' format.",
    {
      ids: z
        .array(z.string())
        .describe(
          "Model IDs to compare in 'provider/model' format (e.g. ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514'])",
        ),
    },
    async ({ ids }) => {
      if (ids.length < 2) {
        return {
          content: [
            { type: "text", text: "Provide at least 2 model IDs to compare" },
          ],
          isError: true,
        };
      }

      const models = ids.map((id) => {
        const [provider, ...rest] = id.split("/");
        return getModel(provider, rest.join("/"));
      });

      const missing = ids.filter((_, i) => !models[i]);
      if (missing.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Models not found: ${missing.join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(models) }],
      };
    },
  );

  // ── recommend_models ──

  server.tool(
    "recommend_models",
    "Get model recommendations based on requirements (capabilities, price, context window, modalities)",
    {
      capability: z.optional(
        z
          .array(z.string())
          .describe("Required capabilities (e.g. ['vision', 'tool_call'])"),
      ),
      model_type: z.optional(
        z.string().describe("Model type (e.g. 'chat', 'embed')"),
      ),
      min_context_window: z.optional(
        z.number().describe("Minimum context window in tokens"),
      ),
      max_price_input: z.optional(
        z.number().describe("Maximum input price per 1M tokens (USD)"),
      ),
      input_modality: z.optional(
        z
          .enum(["text", "image", "audio", "video"])
          .describe("Required input modality"),
      ),
      output_modality: z.optional(
        z
          .enum(["text", "image", "audio", "video"])
          .describe("Required output modality"),
      ),
      limit: z.optional(z.number().describe("Max results (default 10)")),
    },
    async (params) => {
      let models = allModels.filter((m) => m.status !== "deprecated");

      if (params.capability) {
        models = models.filter((m) =>
          params.capability!.every(
            (cap) =>
              m.capabilities?.[cap.trim() as keyof typeof m.capabilities],
          ),
        );
      }

      if (params.model_type)
        models = models.filter((m) => m.model_type === params.model_type);

      if (params.min_context_window) {
        models = models.filter(
          (m) => (m.context_window ?? 0) >= params.min_context_window!,
        );
      }

      if (params.max_price_input) {
        models = models.filter(
          (m) =>
            m.pricing?.input != null &&
            m.pricing.input <= params.max_price_input!,
        );
      }

      if (params.input_modality) {
        models = models.filter((m) =>
          m.modalities?.input?.includes(params.input_modality!),
        );
      }

      if (params.output_modality) {
        models = models.filter((m) =>
          m.modalities?.output?.includes(params.output_modality!),
        );
      }

      sortModels(models, "price_input");

      const limit = Math.min(params.limit ?? 10, 50);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              models: models.slice(0, limit),
              total: models.length,
            }),
          },
        ],
      };
    },
  );

  // ── compare_pricing ──

  server.tool(
    "compare_pricing",
    "Compare pricing across models. Optionally filter by price range or specific model IDs.",
    {
      ids: z.optional(
        z
          .array(z.string())
          .describe("Specific model IDs in 'provider/model' format"),
      ),
      min_price_input: z.optional(
        z.number().describe("Minimum input price per 1M tokens"),
      ),
      max_price_input: z.optional(
        z.number().describe("Maximum input price per 1M tokens"),
      ),
      sort: z.optional(
        z
          .enum(["price_input", "price_output"])
          .describe("Sort field (default: price_input)"),
      ),
      order: z.optional(z.enum(["asc", "desc"]).describe("Sort order")),
      limit: z.optional(z.number().describe("Max results (default 20)")),
    },
    async (params) => {
      let models: Model[];

      if (params.ids && params.ids.length > 0) {
        models = params.ids
          .map((id) => {
            const [provider, ...rest] = id.split("/");
            return getModel(provider, rest.join("/"));
          })
          .filter((m): m is Model => m != null);
      } else {
        models = allModels.filter(
          (m) => m.pricing?.input != null || m.pricing?.output != null,
        );
      }

      const limit = Math.min(params.limit ?? 20, 100);
      const result = comparePricing(models, {
        min_price_input: params.min_price_input,
        max_price_input: params.max_price_input,
        sort: params.sort,
        order: (params.order === "desc" ? -1 : 1) as 1 | -1,
        limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ models: result.items, total: result.total }),
          },
        ],
      };
    },
  );

  // ── search ──

  server.tool(
    "search",
    "Search across providers and models by name, ID, or family",
    {
      q: z.string().describe("Search query (min 2 characters)"),
      limit: z.optional(z.number().describe("Max model results (default 20)")),
    },
    async ({ q, limit: maxResults }) => {
      if (q.length < 2) {
        return {
          content: [
            { type: "text", text: "Query must be at least 2 characters" },
          ],
          isError: true,
        };
      }

      const limit = Math.min(maxResults ?? 20, 50);
      const result = searchAll(q, limit);

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  // ── list_capabilities ──

  server.tool(
    "list_capabilities",
    "List all available model capabilities with counts",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(aggregateCapabilities(allModels)),
          },
        ],
      };
    },
  );

  // ── list_families ──

  server.tool(
    "list_families",
    "List all model families with model counts and associated providers",
    {},
    async () => {
      return {
        content: [
          { type: "text", text: JSON.stringify(aggregateFamilies(allModels)) },
        ],
      };
    },
  );

  return server;
}

const mcpServer = createMcpServer();

export async function handleMcp(c: Context) {
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
}
