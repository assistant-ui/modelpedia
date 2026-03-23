import { loadFont } from "@remotion/google-fonts/Inter";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from "remotion";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const BG = "#0a0a0b";

export const BrowseModels: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Video container entrance
  const containerScale = spring({
    frame,
    fps,
    config: { damping: 200 },
  });
  const containerOpacity = interpolate(containerScale, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Text overlay
  const textOpacity = interpolate(frame, [2 * fps, 2.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textY = interpolate(frame, [2 * fps, 2.5 * fps], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      {/* Video container */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 80,
          right: 80,
          bottom: 140,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #27272a",
          boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
          opacity: containerOpacity,
          transform: `scale(${interpolate(containerScale, [0, 1], [0.95, 1])})`,
        }}
      >
        <Sequence layout="none" premountFor={fps}>
          <Video
            src={staticFile("recordings/models-browse.webm")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </Sequence>
      </div>

      {/* Text overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 50,
          left: 100,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            background: "rgba(99, 102, 241, 0.15)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: 12,
            padding: "14px 28px",
            fontSize: 24,
            fontWeight: 700,
            color: "#c7d2fe",
          }}
        >
          Search. Filter. Find exactly what you need.
        </div>
      </div>
    </AbsoluteFill>
  );
};
