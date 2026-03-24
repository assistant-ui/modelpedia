import type { MetadataRoute } from "next";
import { providers } from "@/lib/data";

const BASE = "https://modelpedia.dev";

export async function generateSitemaps() {
  return [{ id: "main" }, ...providers.map((p) => ({ id: p.id }))];
}

export default async function sitemap({
  id,
}: {
  id: string;
}): Promise<MetadataRoute.Sitemap> {
  if (id === "main") {
    return [
      { url: BASE, changeFrequency: "daily", priority: 1.0 },
      { url: `${BASE}/models`, changeFrequency: "daily", priority: 0.9 },
      { url: `${BASE}/providers`, changeFrequency: "weekly", priority: 0.8 },
      { url: `${BASE}/compare`, changeFrequency: "weekly", priority: 0.7 },
      { url: `${BASE}/changes`, changeFrequency: "daily", priority: 0.7 },
      { url: `${BASE}/docs/api`, changeFrequency: "monthly", priority: 0.6 },
      ...providers.map((p) => ({
        url: `${BASE}/${p.id}`,
        changeFrequency: "weekly" as const,
        priority: p.type === "direct" ? 0.8 : 0.6,
      })),
    ];
  }

  const provider = providers.find((p) => p.id === id);
  if (!provider) return [];

  const priority = provider.type === "direct" ? 0.7 : 0.5;

  return provider.models
    .filter((m) => m.status !== "deprecated" && !m.alias)
    .map((m) => ({
      url: `${BASE}/${provider.id}/${m.id}`,
      changeFrequency: "weekly" as const,
      priority,
    }));
}
