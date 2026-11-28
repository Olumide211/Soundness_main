import React from "react";
import { Composition } from "remotion";
import { PaperPlane } from "./Scene";
import { DURATION, FPS } from "./timeline";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="PaperPlane4x5" component={PaperPlane} durationInFrames={DURATION} fps={FPS} width={1080} height={1350} />
    <Composition id="PaperPlane9x16" component={PaperPlane} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
  </>
);
