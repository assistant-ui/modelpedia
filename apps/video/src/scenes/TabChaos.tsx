import { loadFont } from "@remotion/google-fonts/Inter";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const BG = "#0a0a0b";

const tabs = [
  { label: "OpenAI — Pricing", color: "#10a37f" },
  { label: "Anthropic — Models", color: "#d4a27f" },
  { label: "Google AI — Gemini", color: "#4285f4" },
  { label: "Mistral — Docs", color: "#ff7000" },
  { label: "AWS Bedrock — Models", color: "#ff9900" },
  { label: "Azure OpenAI — Pricing", color: "#0078d4" },
  { label: "Cohere — Models", color: "#39594d" },
  { label: "Fireworks — API", color: "#7c3aed" },
];

const QUESTION = "Which model should I use?";
const SUBTITLE = "4,200+ models. 31 providers. Pricing changes weekly.";

export const TabChaos: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: Tabs appear (0–5s)
  const tabsPhaseEnd = 5 * fps;
  // Phase 2: Question types (5–6.5s)
  const questionStart = 5 * fps;
  const questionEnd = 6.5 * fps;
  // Phase 3: Blur + subtitle (6.5–8s)
  const blurStart = 6.5 * fps;

  const blur = interpolate(frame, [blurStart, blurStart + 15], [0, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const browserOpacity = interpolate(
    frame,
    [blurStart, blurStart + 20],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Question text typewriter
  const questionProgress = interpolate(
    frame,
    [questionStart, questionEnd],
    [0, QUESTION.length],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const questionText = QUESTION.slice(0, Math.floor(questionProgress));
  const questionOpacity = interpolate(
    frame,
    [questionStart - 5, questionStart],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Subtitle fade in
  const subtitleOpacity = interpolate(
    frame,
    [blurStart + 10, blurStart + 30],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const subtitleY = interpolate(
    frame,
    [blurStart + 10, blurStart + 30],
    [20, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Cursor position (bounces between tabs)
  const cursorTab = Math.floor(
    interpolate(frame % (2 * fps), [0, 2 * fps], [0, tabs.length - 0.01], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      {/* Browser mockup */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 160,
          right: 160,
          bottom: 120,
          background: "#1a1a1c",
          borderRadius: 16,
          border: "1px solid #2a2a2e",
          overflow: "hidden",
          filter: `blur(${blur}px)`,
          opacity: browserOpacity,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            background: "#111113",
            padding: "12px 12px 0",
            gap: 2,
            flexWrap: "wrap",
            borderBottom: "1px solid #2a2a2e",
          }}
        >
          {tabs.map((tab, i) => {
            const delay = i * 8;
            const tabProgress = spring({
              frame,
              fps,
              delay,
              config: { damping: 15, stiffness: 200 },
            });
            const isActive = i === cursorTab && frame < tabsPhaseEnd;

            return (
              <div
                key={tab.label}
                style={{
                  padding: "10px 18px 10px 14px",
                  borderRadius: "8px 8px 0 0",
                  background: isActive ? "#2a2a2e" : "#1a1a1c",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: tabProgress,
                  transform: `scale(${tabProgress}) translateY(${interpolate(tabProgress, [0, 1], [10, 0])}px)`,
                  maxWidth: 200,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: tab.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: isActive ? "#e4e4e7" : "#71717a",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {tab.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Address bar */}
        <div
          style={{
            padding: "10px 16px",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              flex: 1,
              background: "#111113",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              color: "#52525b",
            }}
          >
            {frame < tabsPhaseEnd
              ? `https://${tabs[cursorTab]?.label.split(" — ")[0]?.toLowerCase().replace(" ", "")}.com/...`
              : ""}
          </div>
        </div>

        {/* Page content placeholder */}
        <div style={{ flex: 1, padding: "24px 32px" }}>
          {Array.from({ length: 8 }, (_, i) => {
            const lineWidth = 40 + ((i * 37) % 50);
            const lineDelay = Math.max(0, frame - cursorTab * 5) * 0.02;
            return (
              <div
                key={i}
                style={{
                  height: 14,
                  width: `${lineWidth}%`,
                  background: "#27272a",
                  borderRadius: 4,
                  marginBottom: 12,
                  opacity: Math.min(1, lineDelay),
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Question overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        {frame >= questionStart - 5 && (
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "white",
              opacity: questionOpacity,
              textAlign: "center",
            }}
          >
            {questionText}
            {frame < questionEnd && (
              <span
                style={{
                  opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
                  color: "#6366f1",
                }}
              >
                |
              </span>
            )}
          </div>
        )}

        {frame >= blurStart + 10 && (
          <div
            style={{
              fontSize: 28,
              color: "#a1a1aa",
              marginTop: 24,
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
              textAlign: "center",
            }}
          >
            {SUBTITLE}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
