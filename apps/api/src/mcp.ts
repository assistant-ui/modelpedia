import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Model } from "@modelpedia/data";
import { allModels, getModel, getProvider, providers } from "@modelpedia/data";
import type { Context } from "hono";
import { z } from "zod/v4";

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
      let models: Model[] = [...allModels];

      if (params.provider)
        models = models.filter((m) => m.provider === params.provider);
      if (params.family)
        models = models.filter((m) => m.family === params.family);
      if (params.creator)
        models = models.filter((m) => m.created_by === params.creator);
      if (params.status)
        models = models.filter((m) => m.status === params.status);
      if (params.model_type)
        models = models.filter((m) => m.model_type === params.model_type);
      if (params.capability) {
        models = models.filter(
          (m) =>
            m.capabilities?.[params.capability as keyof typeof m.capabilities],
        );
      }

      if (params.q) {
        const q = params.q.toLowerCase();
        models = models.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            m.description?.toLowerCase().includes(q) ||
            m.family?.toLowerCase().includes(q) ||
            m.created_by?.toLowerCase().includes(q),
        );
      }

      if (params.sort) {
        const order = params.order === "desc" ? -1 : 1;
        models.sort((a, b) => {
          let va: number | string | undefined;
          let vb: number | string | undefined;
          if (params.sort === "price_input") {
            va = a.pricing?.input ?? undefined;
            vb = b.pricing?.input ?? undefined;
          } else if (params.sort === "price_output") {
            va = a.pricing?.output ?? undefined;
            vb = b.pricing?.output ?? undefined;
          } else if (params.sort === "context_window") {
            va = a.context_window ?? undefined;
            vb = b.context_window ?? undefined;
          } else if (params.sort === "name") {
            va = a.name.toLowerCase();
            vb = b.name.toLowerCase();
          }
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          return va < vb ? -order : va > vb ? order : 0;
        });
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

      // Sort by price ascending
      models.sort((a, b) => {
        const pa = a.pricing?.input;
        const pb = b.pricing?.input;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });

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

      if (params.min_price_input) {
        models = models.filter(
          (m) => (m.pricing?.input ?? 0) >= params.min_price_input!,
        );
      }
      if (params.max_price_input) {
        models = models.filter(
          (m) =>
            m.pricing?.input != null &&
            m.pricing.input <= params.max_price_input!,
        );
      }

      const sort = params.sort ?? "price_input";
      const order = params.order === "desc" ? -1 : 1;
      models.sort((a, b) => {
        const va =
          sort === "price_output"
            ? (a.pricing?.output ?? undefined)
            : (a.pricing?.input ?? undefined);
        const vb =
          sort === "price_output"
            ? (b.pricing?.output ?? undefined)
            : (b.pricing?.input ?? undefined);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return va < vb ? -order : va > vb ? order : 0;
      });

      const limit = Math.min(params.limit ?? 20, 100);
      const result = models.slice(0, limit).map((m) => ({
        id: `${m.provider}/${m.id}`,
        name: m.name,
        provider: m.provider,
        model_type: m.model_type,
        pricing: m.pricing,
        context_window: m.context_window,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ models: result, total: models.length }),
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

      const query = q.toLowerCase();
      const limit = Math.min(maxResults ?? 20, 50);

      const matchedProviders = providers
        .filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.id.toLowerCase().includes(query),
        )
        .slice(0, 5)
        .map((p) => ({ type: "provider", id: p.id, name: p.name }));

      const matchedModels = allModels
        .filter(
          (m) =>
            m.id.toLowerCase().includes(query) ||
            m.name.toLowerCase().includes(query) ||
            m.family?.toLowerCase().includes(query),
        )
        .slice(0, limit)
        .map((m) => ({
          type: "model",
          id: `${m.provider}/${m.id}`,
          name: m.name,
          provider: m.provider,
        }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              providers: matchedProviders,
              models: matchedModels,
            }),
          },
        ],
      };
    },
  );

  // ── list_capabilities ──

  server.tool(
    "list_capabilities",
    "List all available model capabilities with counts",
    {},
    async () => {
      const capMap = new Map<
        string,
        { count: number; providers: Set<string> }
      >();

      for (const m of allModels) {
        if (!m.capabilities) continue;
        for (const [key, val] of Object.entries(m.capabilities)) {
          if (!val) continue;
          const entry = capMap.get(key) ?? { count: 0, providers: new Set() };
          entry.count++;
          entry.providers.add(m.provider);
          capMap.set(key, entry);
        }
      }

      const capabilities = [...capMap.entries()]
        .map(([name, info]) => ({
          name,
          model_count: info.count,
          provider_count: info.providers.size,
        }))
        .sort((a, b) => b.model_count - a.model_count);

      return {
        content: [{ type: "text", text: JSON.stringify(capabilities) }],
      };
    },
  );

  // ── list_families ──

  server.tool(
    "list_families",
    "List all model families with model counts and associated providers",
    {},
    async () => {
      const familyMap = new Map<
        string,
        { count: number; providers: Set<string>; creators: Set<string> }
      >();

      for (const m of allModels) {
        if (!m.family) continue;
        const entry = familyMap.get(m.family) ?? {
          count: 0,
          providers: new Set(),
          creators: new Set(),
        };
        entry.count++;
        entry.providers.add(m.provider);
        if (m.created_by) entry.creators.add(m.created_by);
        familyMap.set(m.family, entry);
      }

      const families = [...familyMap.entries()]
        .map(([name, info]) => ({
          name,
          model_count: info.count,
          providers: [...info.providers],
          creators: [...info.creators],
        }))
        .sort((a, b) => b.model_count - a.model_count);

      return {
        content: [{ type: "text", text: JSON.stringify(families) }],
      };
    },
  );

  return server;
}

export async function handleMcp(c: Context) {
  const server = createMcpServer();
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
}
