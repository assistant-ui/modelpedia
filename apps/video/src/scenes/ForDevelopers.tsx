import { loadFont } from "@remotion/google-fonts/Inter";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

const BG = "#0a0a0b";

// Syntax-highlighted tokens
type Token = { text: string; color: string };
type CodeLine = Token[];

const npmLines: CodeLine[] = [
  [
    { text: "import", color: "#c084fc" },
    { text: " { ", color: "#e4e4e7" },
    { text: "getModel", color: "#60a5fa" },
    { text: " } ", color: "#e4e4e7" },
    { text: "from", color: "#c084fc" },
    { text: ' "modelpedia"', color: "#86efac" },
    { text: ";", color: "#e4e4e7" },
  ],
  [],
  [
    { text: "const", color: "#c084fc" },
    { text: " model ", color: "#e4e4e7" },
    { text: "=", color: "#e4e4e7" },
    { text: " getModel", color: "#60a5fa" },
    { text: "(", color: "#e4e4e7" },
    { text: '"openai"', color: "#86efac" },
    { text: ", ", color: "#e4e4e7" },
    { text: '"gpt-4o"', color: "#86efac" },
    { text: ");", color: "#e4e4e7" },
  ],
  [],
  [
    { text: "model", color: "#e4e4e7" },
    { text: ".", color: "#71717a" },
    { text: "pricing", color: "#fbbf24" },
    { text: ".", color: "#71717a" },
    { text: "input", color: "#fbbf24" },
    { text: "  ", color: "#e4e4e7" },
    { text: "// 2.5", color: "#52525b" },
  ],
  [
    { text: "model", color: "#e4e4e7" },
    { text: ".", color: "#71717a" },
    { text: "capabilities", color: "#fbbf24" },
    { text: ".", color: "#71717a" },
    { text: "vision", color: "#fbbf24" },
    { text: "  ", color: "#e4e4e7" },
    { text: "// true", color: "#52525b" },
  ],
  [
    { text: "model", color: "#e4e4e7" },
    { text: ".", color: "#71717a" },
    { text: "context_window", color: "#fbbf24" },
    { text: "  ", color: "#e4e4e7" },
    { text: "// 128000", color: "#52525b" },
  ],
];

const apiLines: CodeLine[] = [
  [
    { text: "$ ", color: "#52525b" },
    { text: "curl", color: "#60a5fa" },
    { text: " api.modelpedia.dev/v1/models/openai/gpt-4o", color: "#e4e4e7" },
  ],
  [],
  [{ text: "{", color: "#e4e4e7" }],
  [
    { text: '  "id"', color: "#fbbf24" },
    { text: ": ", color: "#e4e4e7" },
    { text: '"gpt-4o"', color: "#86efac" },
    { text: ",", color: "#e4e4e7" },
  ],
  [
    { text: '  "context_window"', color: "#fbbf24" },
    { text: ": ", color: "#e4e4e7" },
    { text: "128000", color: "#c084fc" },
    { text: ",", color: "#e4e4e7" },
  ],
  [
    { text: '  "pricing"', color: "#fbbf24" },
    { text: ": { ", color: "#e4e4e7" },
    { text: '"input"', color: "#fbbf24" },
    { text: ": ", color: "#e4e4e7" },
    { text: "2.5", color: "#c084fc" },
    { text: ", ", color: "#e4e4e7" },
    { text: '"output"', color: "#fbbf24" },
    { text: ": ", color: "#e4e4e7" },
    { text: "10", color: "#c084fc" },
    { text: " },", color: "#e4e4e7" },
  ],
  [
    { text: '  "capabilities"', color: "#fbbf24" },
    { text: ": { ", color: "#e4e4e7" },
    { text: '"vision"', color: "#fbbf24" },
    { text: ": ", color: "#e4e4e7" },
    { text: "true", color: "#c084fc" },
    { text: " }", color: "#e4e4e7" },
  ],
  [{ text: "}", color: "#e4e4e7" }],
];

const CodeBlock: React.FC<{
  lines: CodeLine[];
  label: string;
  staggerDelay: number;
}> = ({ lines, label, staggerDelay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelOpacity = spring({
    frame,
    fps,
    delay: staggerDelay,
    config: { damping: 200 },
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#6366f1",
          textTransform: "uppercase",
          letterSpacing: 2,
          opacity: labelOpacity,
        }}
      >
        {label}
      </div>
      <div
        style={{
          background: "#111113",
          border: "1px solid #27272a",
          borderRadius: 12,
          padding: "24px 28px",
          flex: 1,
        }}
      >
        {lines.map((line, i) => {
          const lineDelay = staggerDelay + 5 + i * 6;
          const lineOpacity = interpolate(
            frame,
            [lineDelay, lineDelay + 8],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const lineX = interpolate(
            frame,
            [lineDelay, lineDelay + 8],
            [12, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          return (
            <div
              key={i}
              style={{
                fontFamily: "monospace",
                fontSize: 18,
                lineHeight: 1.8,
                opacity: lineOpacity,
                transform: `translateX(${lineX}px)`,
                minHeight: line.length === 0 ? 16 : undefined,
              }}
            >
              {line.map((token, j) => (
                <span key={j} style={{ color: token.color }}>
                  {token.text}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const badges = ["4,200+ models", "Daily auto-updates", "MIT Licensed"];

export const ForDevelopers: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Center label
  const centerOpacity = interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: BG,
        fontFamily,
        display: "flex",
        flexDirection: "column",
        padding: "60px 80px",
      }}
    >
      {/* Split panels */}
      <div
        style={{
          display: "flex",
          gap: 40,
          flex: 1,
        }}
      >
        <CodeBlock lines={npmLines} label="npm package" staggerDelay={0} />
        <CodeBlock lines={apiLines} label="REST API" staggerDelay={8} />
      </div>

      {/* Center label */}
      <div
        style={{
          textAlign: "center",
          fontSize: 22,
          color: "#a1a1aa",
          marginTop: 24,
          opacity: centerOpacity,
        }}
      >
        npm package · REST API · No auth required
      </div>

      {/* Badges */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 20,
          marginTop: 24,
        }}
      >
        {badges.map((badge, i) => {
          const badgeProgress = spring({
            frame,
            fps,
            delay: 4 * fps + i * 8,
            config: { damping: 15, stiffness: 200 },
          });
          return (
            <div
              key={badge}
              style={{
                padding: "12px 24px",
                borderRadius: 10,
                background:
                  i === 2
                    ? "rgba(34, 197, 94, 0.1)"
                    : "rgba(99, 102, 241, 0.1)",
                border: `1px solid ${i === 2 ? "rgba(34, 197, 94, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
                color: i === 2 ? "#86efac" : "#c7d2fe",
                fontSize: 18,
                fontWeight: 700,
                transform: `scale(${badgeProgress}) translateY(${interpolate(badgeProgress, [0, 1], [20, 0])}px)`,
                opacity: badgeProgress,
              }}
            >
              {badge}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
