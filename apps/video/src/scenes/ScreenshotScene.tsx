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
} from "remotion";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const BG = "#0a0a0b";

export type ScreenshotSceneProps = {
  src: string;
  caption?: string;
};

export const ScreenshotScene: React.FC<ScreenshotSceneProps> = ({
  src,
  caption,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerScale = spring({
    frame,
    fps,
    config: { damping: 200 },
  });
  const containerOpacity = interpolate(containerScale, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  const captionOpacity = interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionY = interpolate(frame, [1.5 * fps, 2 * fps], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 70,
          right: 70,
          bottom: caption ? 130 : 50,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #27272a",
          boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
          opacity: containerOpacity,
          transform: `scale(${interpolate(containerScale, [0, 1], [0.95, 1])})`,
        }}
      >
        <Sequence layout="none" premountFor={fps}>
          <Img
            src={staticFile(src)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
            }}
          />
        </Sequence>
      </div>

      {caption && (
        <div
          style={{
            position: "absolute",
            bottom: 45,
            left: 90,
            opacity: captionOpacity,
            transform: `translateY(${captionY}px)`,
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
            {caption}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
