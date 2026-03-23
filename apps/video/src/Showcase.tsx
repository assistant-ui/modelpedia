import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill } from "remotion";
import { BrowseModels } from "./scenes/BrowseModels";
import { CompareModels } from "./scenes/CompareModels";
import { ForDevelopers } from "./scenes/ForDevelopers";
import { LogoReveal } from "./scenes/LogoReveal";
import { OpenSource } from "./scenes/OpenSource";
import { TabChaos } from "./scenes/TabChaos";
import { TheClose } from "./scenes/TheClose";

const FPS = 30;
const T = linearTiming({ durationInFrames: 15 });

export const SCENE_DURATIONS = {
  tabChaos: 8 * FPS, // 240
  logoReveal: 6 * FPS, // 180
  browseModels: 8 * FPS, // 240
  compareModels: 6 * FPS, // 180
  forDevelopers: 8 * FPS, // 240
  openSource: 6 * FPS, // 180
  theClose: 5 * FPS, // 150
} as const;

const TRANSITION_FRAMES = 15;
const TRANSITION_COUNT = 6;

export const TOTAL_DURATION =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) -
  TRANSITION_COUNT * TRANSITION_FRAMES;

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

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.theClose}>
          <TheClose />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
