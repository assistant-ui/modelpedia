import { loadFont } from "@remotion/google-fonts/Inter";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Logo } from "../Logo";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

const BG = "#0a0a0b";

// Deterministic particles
const particles = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 137.5) % 100,
  y: (i * 73.7) % 100,
  size: 2 + (i % 3),
  speed: 0.015 + (i % 5) * 0.005,
  offset: i * 1.2,
}));

export const TheClose: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance
  const logoProgress = spring({ frame, fps, config: { damping: 200 } });

  // Glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [0.2, 0.5],
  );

  // URL button
  const urlProgress = spring({
    frame,
    fps,
    delay: 15,
    config: { damping: 15, stiffness: 200 },
  });

  // Subtitle
  const subtitleOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // GitHub link
  const githubOpacity = interpolate(frame, [40, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily }}>
      {/* Particles */}
      {particles.map((p, i) => {
        const y = p.y + Math.sin(frame * p.speed + p.offset) * 8;
        const opacity = interpolate(
          Math.sin(frame * p.speed * 2 + p.offset),
          [-1, 1],
          [0.05, 0.2],
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: "#6366f1",
              opacity,
            }}
          />
        );
      })}

      {/* Glow */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "45%",
          transform: "translate(-50%, -50%)",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(99, 102, 241, ${glowIntensity}) 0%, transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        <div
          style={{
            opacity: logoProgress,
            transform: `scale(${logoProgress})`,
          }}
        >
          <Logo size={80} color="white" />
        </div>

        {/* URL button */}
        <div
          style={{
            marginTop: 40,
            padding: "18px 48px",
            borderRadius: 14,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            fontSize: 36,
            fontWeight: 900,
            color: "white",
            transform: `scale(${urlProgress})`,
            opacity: urlProgress,
            letterSpacing: -0.5,
          }}
        >
          modelpedia.dev
        </div>

        <div
          style={{
            fontSize: 22,
            color: "#a1a1aa",
            marginTop: 24,
            opacity: subtitleOpacity,
          }}
        >
          Browse 4,200+ AI models from 31 providers
        </div>

        <div
          style={{
            fontSize: 16,
            color: "#52525b",
            marginTop: 32,
            opacity: githubOpacity,
          }}
        >
          github.com/assistant-ui/modelpedia
        </div>
      </div>
    </AbsoluteFill>
  );
};
