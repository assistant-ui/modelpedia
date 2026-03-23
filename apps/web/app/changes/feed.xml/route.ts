import { getChanges, getProvider } from "@/lib/data";

export function GET() {
  const changes = getChanges().slice(0, 100);

  const items = changes
    .map((e) => {
      const providerName = getProvider(e.provider)?.name ?? e.provider;
      const title =
        e.action === "create"
          ? `New model: ${e.model} (${providerName})`
          : e.action === "delete"
            ? `Removed: ${e.model} (${providerName})`
            : `Updated: ${e.model} (${providerName})`;

      const link = `https://modelpedia.dev/${e.provider}/${e.model}`;

      let description = title;
      if (e.action === "update" && e.changes) {
        const fields = Object.keys(e.changes).join(", ");
        description = `${title} — changed: ${fields}`;
      }

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <guid>${link}#${e.ts}</guid>
      <pubDate>${new Date(e.ts).toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>modelpedia — Changes</title>
    <link>https://modelpedia.dev/changes</link>
    <description>New models, pricing changes, and provider updates tracked by modelpedia.</description>
    <language>en</language>
    <atom:link href="https://modelpedia.dev/changes/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
