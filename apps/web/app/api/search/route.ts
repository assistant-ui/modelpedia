import { NextResponse } from "next/server";
import { PROVIDER_TYPE_TIER } from "@/lib/constants";
import { allModels, getProvider } from "@/lib/data";
import { multiSearch } from "@/lib/search";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ models: [] });
  }

  const items = allModels
    .filter((m) => m.status !== "deprecated")
    .map((m) => {
      const p = getProvider(m.provider);
      return {
        type: "model" as const,
        id: `${m.provider}/${m.id}`,
        name: m.name,
        href: `/${m.provider}/${m.id}`,
        sub: p?.name ?? m.provider,
        icon: p?.icon,
        providerType: p?.type ?? "direct",
      };
    });

  const results = multiSearch(items, q, {
    target: (m) => `${m.name} ${m.sub ?? ""} ${m.id}`,
    bonus: (m) => {
      let b = 0;
      if (m.name.toLowerCase() === q.toLowerCase()) b += 30;
      b += PROVIDER_TYPE_TIER[m.providerType] ?? 0;
      return b;
    },
    limit: 20,
  });

  return NextResponse.json({
    models: results.map(({ providerType, ...rest }) => rest),
  });
}
