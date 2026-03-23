import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill } from "remotion";
import { BrowseModels } from "./scenes/BrowseModels";
import { CompareModels } from "./scenes/CompareModels";
import { ForDevelopers } from "./scenes/ForDevelopers";
import { LogoReveal } from "./scenes/LogoReveal";
import { OpenSource } from "./scenes/OpenSource";
import {
  ScreenshotScene,
  type ScreenshotSceneProps,
} from "./scenes/ScreenshotScene";
import { TabChaos } from "./scenes/TabChaos";
import { TheClose } from "./scenes/TheClose";

const FPS = 30;
const T = linearTiming({ durationInFrames: 15 });

/**
 * Add your screenshots here. Each entry becomes a scene
 * before the final "modelpedia.dev" CTA.
 *
 * Place images in public/screenshots/ and reference them
 * relative to the public folder, e.g. "screenshots/my-image.png"
 */
export const EXTRA_SCREENSHOTS: ScreenshotSceneProps[] = [
  // { src: "screenshots/example1.png", caption: "Caption text here" },
  // { src: "screenshots/example2.png" },
];

const SCREENSHOT_DURATION = 4 * FPS; // 4s per screenshot scene

export const SCENE_DURATIONS = {
  tabChaos: 8 * FPS,
  logoReveal: 6 * FPS,
  browseModels: 8 * FPS,
  compareModels: 6 * FPS,
  forDevelopers: 8 * FPS,
  openSource: 6 * FPS,
  theClose: 5 * FPS,
} as const;

const FIXED_TRANSITION_COUNT = 6; // transitions between the fixed scenes
const SCREENSHOT_TRANSITION_COUNT =
  EXTRA_SCREENSHOTS.length > 0
    ? EXTRA_SCREENSHOTS.length + 1 // one before first screenshot + one between each + one before TheClose replaces the last fixed→close transition
    : 0;
const TRANSITION_FRAMES = 15;

// Total transitions: between fixed scenes (6) + extra for screenshots
const TOTAL_TRANSITIONS = FIXED_TRANSITION_COUNT + SCREENSHOT_TRANSITION_COUNT;

export const TOTAL_DURATION =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) +
  EXTRA_SCREENSHOTS.length * SCREENSHOT_DURATION -
  TOTAL_TRANSITIONS * TRANSITION_FRAMES;

export const Showcase: React.FC = () => {
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.tabChaos}>
          <TabChaos />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence
          durationInFrames={SCENE_DURATIONS.logoReveal}
        >
          <LogoReveal />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={T}
        />

        <TransitionSeries.Sequence
          durationInFrames={SCENE_DURATIONS.browseModels}
        >
          <BrowseModels />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence
          durationInFrames={SCENE_DURATIONS.compareModels}
        >
          <CompareModels />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={T}
        />

        <TransitionSeries.Sequence
          durationInFrames={SCENE_DURATIONS.forDevelopers}
        >
          <ForDevelopers />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence
          durationInFrames={SCENE_DURATIONS.openSource}
        >
          <OpenSource />
        </TransitionSeries.Sequence>

        {/* Extra screenshot scenes — inserted before TheClose */}
        {EXTRA_SCREENSHOTS.map((screenshot, i) => (
          <>
            <TransitionSeries.Transition
              key={`t-${i}`}
              presentation={fade()}
              timing={T}
            />
            <TransitionSeries.Sequence
              key={`s-${i}`}
              durationInFrames={SCREENSHOT_DURATION}
            >
              <ScreenshotScene
                src={screenshot.src}
                caption={screenshot.caption}
              />
            </TransitionSeries.Sequence>
          </>
        ))}

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.theClose}>
          <TheClose />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
