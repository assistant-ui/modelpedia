import type { RateLimiter } from "cloudflare:workers";
import type { Model } from "@modelpedia/data";
import { allModels, getModel, getProvider, providers } from "@modelpedia/data";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { handleMcp } from "./mcp";
import {
  aggregateByKey,
  aggregateCapabilities,
  aggregateFamilies,
  comparePricing,
  filterModels,
  type SortField,
  searchAll,
  sortModels,
} from "./query";

type Env = {
  Bindings: {
    API_RATE_LIMITER: RateLimiter;
  };
};

const api = new Hono<Env>();

// Root → redirect to docs
api.get("/", (c) => c.redirect("https://modelpedia.dev/docs/api", 302));

// MCP endpoint
api.all("/mcp", handleMcp);

const app = new Hono<Env>();

app.use("*", cors());
app.use("*", prettyJSON());

// Rate limiting middleware (60 req/min per IP)
app.use("*", async (c, next) => {
  const limiter = c.env?.API_RATE_LIMITER;
  if (!limiter) return next();

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key: ip });

  if (!success) {
    return c.json(
      {
        error: {
          message: "Rate limit exceeded. Max 60 requests per minute.",
          status: 429,
        },
      },
      429,
    );
  }

  return next();
});

// ── Helpers ──

function ok(data: unknown, meta?: Record<string, unknown>) {
  return { data, ...(meta ? { meta } : {}) };
}

function err(message: string, status: number) {
  return { error: { message, status } };
}

function paginate(c: { req: { query: (k: string) => string | undefined } }) {
  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const offset = Number(c.req.query("offset")) || 0;
  return { limit, offset };
}

// ── GET /v1/stats ──

app.get("/stats", (c) => {
  const families = new Set(allModels.map((m) => m.family).filter(Boolean));
  const creators = new Set(allModels.map((m) => m.created_by).filter(Boolean));

  return c.json(
    ok({
      providers: providers.length,
      models: allModels.length,
      families: families.size,
      creators: creators.size,
    }),
  );
});

// ── GET /v1/providers ──

app.get("/providers", (c) => {
  return c.json(
    ok(
      providers.map((p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        api_url: p.api_url,
        docs_url: p.docs_url,
        pricing_url: p.pricing_url,
        model_count: p.models.length,
      })),
    ),
  );
});

// ── GET /v1/providers/compare ──

app.get("/providers/compare", (c) => {
  const ids = c.req
    .query("ids")
    ?.split(",")
    .map((s) => s.trim());
  if (!ids || ids.length < 2)
    return c.json(
      err("Provide at least 2 comma-separated provider ids", 400),
      400,
    );
  if (ids.length > 10)
    return c.json(err("Maximum 10 providers per comparison", 400), 400);

  const results = ids.map((id) => {
    const p = getProvider(id);
    if (!p) return null;

    const models = allModels.filter((m) => m.provider === id);
    const active = models.filter((m) => m.status !== "deprecated");
    const prices = models
      .map((m) => m.pricing?.input)
      .filter((v): v is number => v != null);

    const caps = new Map<string, number>();
    for (const m of models) {
      if (!m.capabilities) continue;
      for (const [k, v] of Object.entries(m.capabilities)) {
        if (v) caps.set(k, (caps.get(k) ?? 0) + 1);
      }
    }

    return {
      id: p.id,
      name: p.name,
      type: p.type,
      region: p.region,
      free_tier: p.free_tier,
      model_count: models.length,
      active_model_count: active.length,
      price_range:
        prices.length > 0
          ? { min: Math.min(...prices), max: Math.max(...prices) }
          : null,
      capabilities: Object.fromEntries(caps),
    };
  });

  const missing = ids.filter((_, i) => !results[i]);
  if (missing.length > 0)
    return c.json(err(`Providers not found: ${missing.join(", ")}`, 404), 404);

  return c.json(ok(results));
});

// ── GET /v1/providers/:id ──

app.get("/providers/:id", (c) => {
  const provider = getProvider(c.req.param("id"));
  if (!provider) return c.json(err("Provider not found", 404), 404);
  return c.json(ok(provider));
});

// ── GET /v1/models ──

app.get("/models", (c) => {
  const models = filterModels([...allModels], {
    provider: c.req.query("provider"),
    family: c.req.query("family"),
    creator: c.req.query("creator"),
    status: c.req.query("status"),
    capability: c.req.query("capability"),
    q: c.req.query("q"),
  });

  const sort = c.req.query("sort") as SortField | undefined;
  if (sort) {
    const order = c.req.query("order") === "desc" ? -1 : 1;
    sortModels(models, sort, order as 1 | -1);
  }

  const { limit, offset } = paginate(c);

  return c.json(
    ok(models.slice(offset, offset + limit), {
      total: models.length,
      limit,
      offset,
    }),
  );
});

// ── GET /v1/models/compare ── (must be before :provider/:id catch-all)

app.get("/models/compare", (c) => {
  const ids = c.req
    .query("ids")
    ?.split(",")
    .map((s) => s.trim());
  if (!ids || ids.length < 2)
    return c.json(
      err("Provide at least 2 comma-separated ids (provider/model)", 400),
      400,
    );
  if (ids.length > 10)
    return c.json(err("Maximum 10 models per comparison", 400), 400);

  const models = ids.map((id) => {
    const [provider, ...rest] = id.split("/");
    return getModel(provider, rest.join("/"));
  });

  const missing = ids.filter((_, i) => !models[i]);
  if (missing.length > 0)
    return c.json(err(`Models not found: ${missing.join(", ")}`, 404), 404);

  return c.json(ok(models));
});

// ── GET /v1/models/latest ──

app.get("/models/latest", (c) => {
  const { limit, offset } = paginate(c);
  const sorted = [...allModels].sort((a, b) =>
    (b.last_updated ?? "").localeCompare(a.last_updated ?? ""),
  );

  return c.json(
    ok(sorted.slice(offset, offset + limit), {
      total: sorted.length,
      limit,
      offset,
    }),
  );
});

// ── GET /v1/models/recommend ──

app.get("/models/recommend", (c) => {
  let models: Model[] = allModels.filter((m) => m.status !== "deprecated");

  // Filter by required capabilities
  const caps = c.req.query("capability")?.split(",");
  if (caps) {
    models = models.filter((m) =>
      caps.every(
        (cap) => m.capabilities?.[cap.trim() as keyof typeof m.capabilities],
      ),
    );
  }

  // Filter by model type
  const modelType = c.req.query("model_type");
  if (modelType) models = models.filter((m) => m.model_type === modelType);

  // Filter by minimum context window
  const minContext = Number(c.req.query("min_context_window")) || 0;
  if (minContext > 0) {
    models = models.filter((m) => (m.context_window ?? 0) >= minContext);
  }

  // Filter by maximum input price (per 1M tokens)
  const maxPrice = Number(c.req.query("max_price_input"));
  if (maxPrice > 0) {
    models = models.filter(
      (m) => m.pricing?.input != null && m.pricing.input <= maxPrice,
    );
  }

  // Filter by input modality
  const inputModality = c.req.query("input_modality");
  if (inputModality) {
    models = models.filter((m) =>
      m.modalities?.input?.includes(
        inputModality as "text" | "image" | "audio" | "video",
      ),
    );
  }

  // Filter by output modality
  const outputModality = c.req.query("output_modality");
  if (outputModality) {
    models = models.filter((m) =>
      m.modalities?.output?.includes(
        outputModality as "text" | "image" | "audio" | "video",
      ),
    );
  }

  sortModels(models, "price_input");

  const { limit, offset } = paginate(c);

  return c.json(
    ok(models.slice(offset, offset + limit), {
      total: models.length,
      limit,
      offset,
    }),
  );
});

// ── GET /v1/models/types ──

app.get("/models/types", (c) => {
  return c.json(
    ok(aggregateByKey(allModels, (m) => m.model_type ?? "unknown")),
  );
});

// ── GET /v1/models/:provider/:id ──

app.get("/models/:provider/:id{.+}", (c) => {
  const provider = c.req.param("provider");
  const id = c.req.param("id");
  const model = getModel(provider, id);
  if (!model) return c.json(err("Model not found", 404), 404);
  return c.json(ok(model));
});

// ── GET /v1/creators ──

app.get("/creators", (c) => {
  const creatorMap = new Map<
    string,
    { count: number; providers: Set<string>; families: Set<string> }
  >();

  for (const m of allModels) {
    if (!m.created_by) continue;
    const entry = creatorMap.get(m.created_by) ?? {
      count: 0,
      providers: new Set(),
      families: new Set(),
    };
    entry.count++;
    entry.providers.add(m.provider);
    if (m.family) entry.families.add(m.family);
    creatorMap.set(m.created_by, entry);
  }

  const creators = [...creatorMap.entries()]
    .map(([name, info]) => ({
      name,
      model_count: info.count,
      providers: [...info.providers],
      families: [...info.families],
    }))
    .sort((a, b) => b.model_count - a.model_count);

  return c.json(ok(creators));
});

// ── GET /v1/pricing/compare ──

app.get("/pricing/compare", (c) => {
  const ids = c.req
    .query("ids")
    ?.split(",")
    .map((s) => s.trim());

  let models: Model[];

  if (ids && ids.length > 0) {
    models = ids
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

  const { limit, offset } = paginate(c);
  const result = comparePricing(models, {
    min_price_input: Number(c.req.query("min_price_input")) || undefined,
    max_price_input: Number(c.req.query("max_price_input")) || undefined,
    sort:
      (c.req.query("sort") as "price_input" | "price_output") ?? "price_input",
    order: (c.req.query("order") === "desc" ? -1 : 1) as 1 | -1,
    limit,
    offset,
  });

  return c.json(ok(result.items, { total: result.total, limit, offset }));
});

// ── GET /v1/capabilities ──

app.get("/capabilities", (c) => {
  return c.json(ok(aggregateCapabilities(allModels)));
});

// ── GET /v1/modalities ──

app.get("/modalities", (c) => {
  const modalityMap = new Map<
    string,
    { count: number; providers: Set<string> }
  >();

  for (const m of allModels) {
    if (!m.modalities) continue;
    const key = `${(m.modalities.input ?? []).sort().join("+")} → ${(m.modalities.output ?? []).sort().join("+")}`;
    const entry = modalityMap.get(key) ?? { count: 0, providers: new Set() };
    entry.count++;
    entry.providers.add(m.provider);
    modalityMap.set(key, entry);
  }

  const modalities = [...modalityMap.entries()]
    .map(([combination, info]) => ({
      combination,
      model_count: info.count,
      provider_count: info.providers.size,
    }))
    .sort((a, b) => b.model_count - a.model_count);

  return c.json(ok(modalities));
});

// ── GET /v1/tools ──

app.get("/tools", (c) => {
  return c.json(
    ok(aggregateByKey(allModels, (m) => m.tools as string[] | undefined)),
  );
});

// ── GET /v1/search ──

app.get("/search", (c) => {
  const q = c.req.query("q");
  if (!q || q.length < 2)
    return c.json(err("Query must be at least 2 characters", 400), 400);

  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);
  const result = searchAll(q, limit);

  return c.json(
    ok({
      providers: result.providers.map((p) => ({ ...p, url: `/${p.id}` })),
      models: result.models.map((m) => ({
        ...m,
        url: `/${m.provider}/${m.id.split("/").slice(1).join("/")}`,
      })),
    }),
  );
});

// ── GET /v1/families ──

app.get("/families", (c) => {
  return c.json(ok(aggregateFamilies(allModels)));
});

// ── Export ──

app.get("/export", (c) => {
  const format = c.req.query("format") ?? "json";
  const provider = c.req.query("provider");
  const modelId = c.req.query("model");

  let models = allModels.filter((m) => m.status !== "deprecated");
  if (provider) models = models.filter((m) => m.provider === provider);
  if (modelId) models = models.filter((m) => m.id === modelId);

  if (format === "csv") {
    const headers = [
      "id",
      "name",
      "provider",
      "created_by",
      "model_type",
      "context_window",
      "max_output_tokens",
      "pricing_input",
      "pricing_output",
      "license",
      "parameters",
      "family",
    ];
    const rows = models.map((m) => [
      m.id,
      m.name,
      m.provider,
      m.created_by,
      m.model_type ?? "",
      m.context_window ?? "",
      m.max_output_tokens ?? "",
      m.pricing?.input ?? "",
      m.pricing?.output ?? "",
      m.license ?? "",
      m.parameters ?? "",
      m.family ?? "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=modelpedia-models.csv",
      },
    });
  }

  const data = models.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    created_by: m.created_by,
    family: m.family,
    model_type: m.model_type,
    status: m.status,
    context_window: m.context_window,
    max_output_tokens: m.max_output_tokens,
    pricing: m.pricing
      ? { input: m.pricing.input, output: m.pricing.output }
      : undefined,
    license: m.license,
    parameters: m.parameters,
    capabilities: m.capabilities,
  }));

  return c.json(ok(data, { total: data.length }));
});

api.route("/v1", app);

export default api;
