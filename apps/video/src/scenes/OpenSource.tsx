import { loadFont } from "@remotion/google-fonts/Inter";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from "remotion";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

const BG = "#0a0a0b";

export const OpenSource: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Heading
  const headingProgress = spring({ frame, fps, config: { damping: 200 } });

  // GitHub screenshot - left panel
  const githubProgress = spring({
    frame,
    fps,
    delay: 10,
    config: { damping: 200 },
  });
  const githubX = interpolate(githubProgress, [0, 1], [-60, 0]);

  // Changes recording - right panel
  const changesProgress = spring({
    frame,
    fps,
    delay: 20,
    config: { damping: 200 },
  });
  const changesX = interpolate(changesProgress, [0, 1], [60, 0]);

  // Bottom text
  const textOpacity = interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      {/* Heading */}
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 48,
          fontWeight: 900,
          color: "white",
          opacity: headingProgress,
        }}
      >
        Community-maintained. Always current.
      </div>

      {/* Two panels */}
      <div
        style={{
          position: "absolute",
          top: 140,
          left: 60,
          right: 60,
          bottom: 140,
          display: "flex",
          gap: 24,
        }}
      >
        {/* GitHub screenshot */}
        <div
          style={{
            flex: 1,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid #27272a",
            boxShadow: "0 15px 50px rgba(0,0,0,0.5)",
            opacity: githubProgress,
            transform: `translateX(${githubX}px)`,
          }}
        >
          <Sequence layout="none" premountFor={fps}>
            <Img
              src={staticFile("screenshots/github.png")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top",
              }}
            />
          </Sequence>
        </div>

        {/* Changes recording */}
        <div
          style={{
            flex: 1,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid #27272a",
            boxShadow: "0 15px 50px rgba(0,0,0,0.5)",
            opacity: changesProgress,
            transform: `translateX(${changesX}px)`,
          }}
        >
          <Sequence layout="none" premountFor={fps}>
            <Video
              src={staticFile("recordings/changes.webm")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </Sequence>
        </div>
      </div>

      {/* Bottom text */}
      <div
        style={{
          position: "absolute",
          bottom: 50,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: textOpacity,
        }}
      >
        <div style={{ fontSize: 22, color: "#a1a1aa" }}>
          31 provider scripts sync daily from official APIs
        </div>
        <div style={{ fontSize: 18, color: "#52525b", marginTop: 8 }}>
          Manual edits are never overwritten
        </div>
      </div>
    </AbsoluteFill>
  );
};
