import type { RateLimiter } from "cloudflare:workers";
import type { Model } from "@modelpedia/data";
import { allModels, getModel, getProvider, providers } from "@modelpedia/data";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { handleMcp } from "./mcp";

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
  let models: Model[] = [...allModels];

  const provider = c.req.query("provider");
  if (provider) models = models.filter((m) => m.provider === provider);

  const family = c.req.query("family");
  if (family) models = models.filter((m) => m.family === family);

  const creator = c.req.query("creator");
  if (creator) models = models.filter((m) => m.created_by === creator);

  const status = c.req.query("status");
  if (status) models = models.filter((m) => m.status === status);

  const capability = c.req.query("capability");
  if (capability) {
    models = models.filter(
      (m) => m.capabilities?.[capability as keyof typeof m.capabilities],
    );
  }

  const q = c.req.query("q")?.toLowerCase();
  if (q) {
    models = models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.family?.toLowerCase().includes(q) ||
        m.created_by?.toLowerCase().includes(q),
    );
  }

  // Sort
  const sort = c.req.query("sort");
  const order = c.req.query("order") === "desc" ? -1 : 1;
  if (sort) {
    models.sort((a, b) => {
      let va: number | string | undefined;
      let vb: number | string | undefined;
      if (sort === "price_input") {
        va = a.pricing?.input ?? undefined;
        vb = b.pricing?.input ?? undefined;
      } else if (sort === "price_output") {
        va = a.pricing?.output ?? undefined;
        vb = b.pricing?.output ?? undefined;
      } else if (sort === "context_window") {
        va = a.context_window ?? undefined;
        vb = b.context_window ?? undefined;
      } else if (sort === "name") {
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va < vb ? -order : va > vb ? order : 0;
    });
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

  // Sort: prefer models with pricing info, then by price (cheapest first)
  models.sort((a, b) => {
    const pa = a.pricing?.input;
    const pb = b.pricing?.input;
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });

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
  const typeMap = new Map<string, { count: number; providers: Set<string> }>();

  for (const m of allModels) {
    const t = m.model_type ?? "unknown";
    const entry = typeMap.get(t) ?? { count: 0, providers: new Set() };
    entry.count++;
    entry.providers.add(m.provider);
    typeMap.set(t, entry);
  }

  const types = [...typeMap.entries()]
    .map(([name, info]) => ({
      name,
      model_count: info.count,
      provider_count: info.providers.size,
    }))
    .sort((a, b) => b.model_count - a.model_count);

  return c.json(ok(types));
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
    // Compare specific models
    models = ids
      .map((id) => {
        const [provider, ...rest] = id.split("/");
        return getModel(provider, rest.join("/"));
      })
      .filter((m): m is Model => m != null);
  } else {
    // Filter all models with pricing data
    models = allModels.filter(
      (m) => m.pricing?.input != null || m.pricing?.output != null,
    );
  }

  // Optional price range filters
  const minInput = Number(c.req.query("min_price_input")) || 0;
  const maxInput = Number(c.req.query("max_price_input")) || 0;
  if (minInput > 0) {
    models = models.filter((m) => (m.pricing?.input ?? 0) >= minInput);
  }
  if (maxInput > 0) {
    models = models.filter(
      (m) => m.pricing?.input != null && m.pricing.input <= maxInput,
    );
  }

  // Sort by input price ascending by default
  const sort = c.req.query("sort") ?? "price_input";
  const order = c.req.query("order") === "desc" ? -1 : 1;
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

  const { limit, offset } = paginate(c);

  const result = models.slice(offset, offset + limit).map((m) => ({
    id: `${m.provider}/${m.id}`,
    name: m.name,
    provider: m.provider,
    model_type: m.model_type,
    pricing: m.pricing,
    context_window: m.context_window,
  }));

  return c.json(
    ok(result, {
      total: models.length,
      limit,
      offset,
    }),
  );
});

// ── GET /v1/capabilities ──

app.get("/capabilities", (c) => {
  const capMap = new Map<string, { count: number; providers: Set<string> }>();

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

  return c.json(ok(capabilities));
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
  const toolMap = new Map<string, { count: number; providers: Set<string> }>();

  for (const m of allModels) {
    if (!m.tools) continue;
    for (const tool of m.tools) {
      const entry = toolMap.get(tool) ?? { count: 0, providers: new Set() };
      entry.count++;
      entry.providers.add(m.provider);
      toolMap.set(tool, entry);
    }
  }

  const tools = [...toolMap.entries()]
    .map(([name, info]) => ({
      name,
      model_count: info.count,
      provider_count: info.providers.size,
    }))
    .sort((a, b) => b.model_count - a.model_count);

  return c.json(ok(tools));
});

// ── GET /v1/search ──

app.get("/search", (c) => {
  const q = c.req.query("q")?.toLowerCase();
  if (!q || q.length < 2)
    return c.json(err("Query must be at least 2 characters", 400), 400);

  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);

  const matchedProviders = providers
    .filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    )
    .slice(0, 5)
    .map((p) => ({
      type: "provider",
      id: p.id,
      name: p.name,
      url: `/${p.id}`,
    }));

  const matchedModels = allModels
    .filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.family?.toLowerCase().includes(q),
    )
    .slice(0, limit)
    .map((m) => ({
      type: "model",
      id: `${m.provider}/${m.id}`,
      name: m.name,
      provider: m.provider,
      url: `/${m.provider}/${m.id}`,
    }));

  return c.json(ok({ providers: matchedProviders, models: matchedModels }));
});

// ── GET /v1/families ──

app.get("/families", (c) => {
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

  return c.json(ok(families));
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
