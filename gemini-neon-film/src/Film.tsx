import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import available from './available.json';
import {CUES, SHOTS, sec, type Shot} from './edl';
import {Grade, GradeDefs} from './fx/Grade';
import {Grain} from './fx/Grain';
import {Vignette} from './fx/Vignette';
import {AppShot} from './shots/AppShot';
import {EndCard} from './shots/EndCard';
import {ImageShot} from './shots/ImageShot';
import {ShotFrame} from './shots/ShotFrame';
import {Subtitles, type SubChunk} from './shots/Subtitles';
import {VideoShot} from './shots/VideoShot';
import './fonts';

type Placed = Shot & {from: number; duration: number};

// Resolve the EDL into frame ranges. `blackBefore` frames are taken from the
// end of the previous shot, leaving pure black.
export const placeShots = (): Placed[] =>
  SHOTS.map((s, i) => {
    const from = sec(s.start);
    const next = SHOTS[i + 1];
    const end = sec(s.end) - (next?.blackBefore ?? 0);
    return {...s, from, duration: end - from};
  });

const hasAi = (id: string) => (available as Record<string, boolean>)[id] === true;

// Subtitles come from the CUES table (they can span cuts). Hard on/off.
const subtitleChunks = (): SubChunk[] =>
  CUES.map((c) => ({text: c.text, from: sec(c.at), duration: sec(c.until) - sec(c.at)}));

const Picture: React.FC<{shot: Placed}> = ({shot}) => {
  if (shot.kind === 'video') {
    return <VideoShot file={shot.file} inPoint={shot.in} rate={shot.rate} crop916={shot.crop916} />;
  }
  if (shot.kind === 'image') {
    if (shot.aiFile && hasAi(shot.id)) {
      return <VideoShot file={shot.aiFile} inPoint={0} crop916={shot.crop916} />;
    }
    if (shot.id === 'S22') {
      return (
        <ImageShot
          file={shot.file}
          fit="cover"
          srcAspect={3008 / 2008}
          flickerFrame={shot.flickerAt !== undefined ? sec(shot.flickerAt) - shot.from : undefined}
        />
      );
    }
    return <ImageShot file={shot.file} fit="contain-square" srcAspect={1} brightness={shot.brightness} />;
  }
  return null;
};

export const Film: React.FC = () => {
  const placed = placeShots();
  const pictures = placed.filter((s) => s.kind !== 'end');
  const end = placed.find((s) => s.kind === 'end')!;

  return (
    <AbsoluteFill style={{backgroundColor: 'black'}}>
      <GradeDefs saturations={[0, ...pictures.map((s) => s.saturation ?? 0)]} />

      {pictures.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.id}>
          <Grade saturation={s.saturation ?? 0}>
            {s.kind === 'app' ? (
              <ShotFrame globalFrom={s.from} duration={s.duration}>
                <AppShot file={s.file} inPoint={s.in} rate={s.rate} part={s.app!} push={s.push} duration={s.duration} />
              </ShotFrame>
            ) : (
              <ShotFrame globalFrom={s.from} duration={s.duration} push={s.push}>
                <Picture shot={s} />
              </ShotFrame>
            )}
          </Grade>
        </Sequence>
      ))}

      {/* film texture over every graded shot (not the end card) */}
      <Sequence from={0} durationInFrames={end.from} name="film-fx">
        <Vignette strength={0.25} />
        <Grain opacity={0.2} />
      </Sequence>

      <Subtitles chunks={subtitleChunks()} />

      <Sequence from={end.from} durationInFrames={end.duration} name="END">
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
