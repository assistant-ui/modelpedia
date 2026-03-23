import { ImageResponse } from "next/og";
import { Logo } from "@/components/shared/logo";
import { allModels, providers } from "@/lib/data";

export const runtime = "nodejs";
export const alt = "modelpedia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const families = new Set(allModels.map((m) => m.family).filter(Boolean));

const stats = [
  { label: "Models", value: String(allModels.length) },
  { label: "Providers", value: String(providers.length) },
  { label: "Families", value: String(families.size) },
];

export default function OGImage() {
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
        <Logo size={36} color="#fafafa" />
        <div style={{ display: "flex", fontSize: 18, color: "#71717a" }}>
          modelpedia.dev
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
            fontSize: 56,
            fontWeight: 600,
            letterSpacing: "-0.03em",
          }}
        >
          modelpedia
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#a1a1aa",
            marginTop: 12,
          }}
        >
          Open catalog of AI models across providers
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
    size,
  );
}
