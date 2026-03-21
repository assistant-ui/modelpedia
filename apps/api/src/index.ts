import type { Model } from "ai-model";
import { allModels, getModel, getProvider, providers } from "ai-model";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";

const api = new Hono();

// Root → redirect to docs
api.get("/", (c) => c.redirect("https://ai-model.dev/docs/api", 302));

const app = new Hono();

app.use("*", cors());
app.use("*", prettyJSON());

// ── Helpers ──

function ok(data: unknown, meta?: Record<string, unknown>) {
  return { data, ...(meta ? { meta } : {}) };
}

function err(message: string, status: number) {
  return { error: { message, status } };
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

  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const offset = Number(c.req.query("offset")) || 0;

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

// ── GET /v1/models/:provider/:id ──

app.get("/models/:provider/:id{.+}", (c) => {
  const provider = c.req.param("provider");
  const id = c.req.param("id");
  const model = getModel(provider, id);
  if (!model) return c.json(err("Model not found", 404), 404);
  return c.json(ok(model));
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

api.route("/v1", app);

export default api;
