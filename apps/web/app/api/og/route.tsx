import { ImageResponse } from "next/og";
import { getModel, getProvider } from "@/lib/data";
import { formatTokens } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const id = searchParams.get("id");

  if (!provider || !id) {
    return new Response("Missing provider or id", { status: 400 });
  }

  const model = getModel(provider, decodeURIComponent(id));
  const providerInfo = getProvider(provider);

  if (!model) {
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
      { width: 1200, height: 630 },
    );
  }

  const stats: { label: string; value: string }[] = [];
  if (model.context_window != null)
    stats.push({ label: "Context", value: formatTokens(model.context_window) });
  if (model.pricing?.input != null)
    stats.push({ label: "Input", value: `$${model.pricing.input}` });
  if (model.pricing?.output != null)
    stats.push({ label: "Output", value: `$${model.pricing.output}` });
  if (model.max_output_tokens != null)
    stats.push({
      label: "Max output",
      value: formatTokens(model.max_output_tokens),
    });

  const caps = model.capabilities
    ? Object.entries(model.capabilities)
        .filter(([, v]) => v)
        .map(([k]) => k.replace(/_/g, " "))
    : [];

  const desc = model.description
    ? model.description.length > 100
      ? `${model.description.slice(0, 100)}...`
      : model.description
    : null;

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
          {`${providerInfo?.name ?? provider} · ai-model.dev`}
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
        <div
          style={{
            display: "flex",
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: "-0.03em",
          }}
        >
          {model.name}
        </div>
        {desc ? (
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: "#a1a1aa",
              marginTop: 12,
            }}
          >
            {desc}
          </div>
        ) : null}
        {caps.length > 0 ? (
          <div
            style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}
          >
            {caps.slice(0, 6).map((c) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  fontSize: 14,
                  color: "#a1a1aa",
                  background: "#1c1c1e",
                  border: "1px solid #27272a",
                  padding: "6px 14px",
                  borderRadius: 6,
                }}
              >
                {c}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {stats.length > 0 ? (
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
                  fontSize: 28,
                  fontWeight: 600,
                  fontFamily: "monospace",
                }}
              >
                {s.value}
              </div>
              <div style={{ display: "flex", fontSize: 14, color: "#71717a" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>,
    { width: 1200, height: 630 },
  );
}
