import type { MetadataRoute } from "next";
import { providers } from "@/lib/data";

const BASE = "https://modelpedia.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/models`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/providers`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/compare`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/changes`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/docs/api`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const providerPages: MetadataRoute.Sitemap = providers.map((p) => ({
    url: `${BASE}/${p.id}`,
    changeFrequency: "weekly",
    priority: p.type === "direct" ? 0.8 : 0.6,
  }));

  return [...staticPages, ...providerPages];
}
