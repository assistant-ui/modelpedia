import { ImageResponse } from "next/og";
import { getProvider } from "@/lib/data";
import { regionFlag } from "@/lib/format";

export const runtime = "nodejs";
export const alt = "Provider";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider: id } = await params;
  const provider = getProvider(id);
  if (!provider) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          color: "#fafafa",
          fontSize: 48,
        }}
      >
        Not Found
      </div>,
      { ...size },
    );
  }

  const active = provider.models.filter(
    (m) => m.status !== "deprecated",
  ).length;
  const flag = regionFlag(provider.region);

  const stats = [
    { label: "Models", value: String(provider.models.length) },
    { label: "Active", value: String(active) },
    { label: "Region", value: `${flag} ${provider.region}` },
  ];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0b",
        color: "#fafafa",
        fontFamily: "sans-serif",
        padding: "60px 80px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "#fafafa",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            color: "#0a0a0b",
          }}
        >
          AI
        </div>
        <div style={{ display: "flex", fontSize: 18, color: "#71717a" }}>
          ai-model.dev
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: 18, color: "#71717a" }}>
          Provider
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            marginTop: 8,
          }}
        >
          {provider.name}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          borderTop: "1px solid #27272a",
          paddingTop: 32,
          gap: 64,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 600,
                fontFamily: "monospace",
              }}
            >
              {s.value}
            </div>
            <div style={{ display: "flex", fontSize: 16, color: "#71717a" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
