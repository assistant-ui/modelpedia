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
import { Logo } from "../Logo";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

const BG = "#0a0a0b";

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 200 },
  });
  const logoOpacity = interpolate(logoScale, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Glow behind logo
  const glowSize = interpolate(logoScale, [0, 1], [100, 300]);
  const glowOpacity = interpolate(logoScale, [0, 1], [0, 0.4]);

  // Wordmark typewriter
  const wordmark = "modelpedia";
  const typeStart = 15;
  const typeProgress = interpolate(
    frame,
    [typeStart, typeStart + 20],
    [0, wordmark.length],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Tagline
  const taglineOpacity = interpolate(frame, [40, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo group slides up to make room for screenshot
  const slideUp = interpolate(frame, [3 * fps, 4 * fps], [0, -280], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Screenshot fade in
  const screenshotOpacity = interpolate(frame, [3 * fps, 4.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const screenshotScale = interpolate(frame, [3 * fps, 4.5 * fps], [0.95, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      {/* Screenshot behind */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 120,
          right: 120,
          height: 600,
          opacity: screenshotOpacity,
          transform: `scale(${screenshotScale})`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
        }}
      >
        <Sequence layout="none" premountFor={fps}>
          <Img
            src={staticFile("screenshots/homepage.png")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
            }}
          />
        </Sequence>
      </div>

      {/* Logo group */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${slideUp}px)`,
          zIndex: 10,
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            width: glowSize,
            height: glowSize,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(99, 102, 241, 0.6) 0%, transparent 70%)",
            opacity: glowOpacity,
            filter: "blur(40px)",
          }}
        />

        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
          }}
        >
          <Logo size={100} color="white" />
        </div>

        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "white",
            marginTop: 20,
            letterSpacing: -2,
          }}
        >
          {wordmark.slice(0, Math.floor(typeProgress))}
          {frame >= typeStart && frame < typeStart + 25 && (
            <span
              style={{
                color: "#6366f1",
                opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
              }}
            >
              |
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: 26,
            color: "#a1a1aa",
            marginTop: 12,
            opacity: taglineOpacity,
          }}
        >
          The open catalog of AI models
        </div>
      </div>
    </AbsoluteFill>
  );
};
