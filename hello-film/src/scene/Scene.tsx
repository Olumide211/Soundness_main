import React from 'react';
import {Environment, Backdrops} from './World';
import {CameraRig} from './CameraRig';
import {Lights} from './Lights';
import {CaveWall} from './eras/CaveWall';
import {Papyrus} from './eras/Papyrus';
import {Press} from './eras/Press';
import {Telegraph} from './eras/Telegraph';
import {Phone} from './eras/Phone';
import {Smartphone} from './eras/Smartphone';
import {ReturnToFire} from './eras/ReturnToFire';
import {PigmentParticles} from './particles/PigmentParticles';
import {Embers} from './particles/Dust';
import {PostFX} from '../fx/PostFX';
import {Bridge, bridgeAlpha} from './Bridge';
import {shotCamera, bokehAt} from '../lib/camera';
import {mounted, MOUNT} from '../lib/timeline';
import {smoothstep, easeInCubic, remap} from '../lib/ease';
import {HelloProps} from '../Hello';

export const Scene: React.FC<HelloProps & {rawFrame: number}> = ({rawFrame, vertical, credit, grain, debug}) => {
  // scene time: loops; in the credit tail the world keeps evolving from frame 0 on
  const f = rawFrame % 1200;
  const cam = shotCamera(rawFrame, vertical, credit);
  const screenMix = smoothstep(846, 866, f) * (1 - smoothstep(1036, 1080, f));
  const exposure = credit && rawFrame >= 1200 ? 1 - 0.04 * easeInCubic(remap(rawFrame, 1200, 1230)) : 1;
  let bokeh = bokehAt(f);
  if (f >= 1040) bokeh = 2.0 * smoothstep(1060, 1170, f);
  bokeh *= 1 - 0.9 * bridgeAlpha(f);
  return (
    <>
      <Environment />
      <CameraRig rawFrame={rawFrame} vertical={vertical} credit={credit} />
      <Lights credit={credit} />
      <Backdrops camPos={cam.pos} />
      {mounted(f, MOUNT.cave) && <CaveWall frame={f} rawFrame={rawFrame} credit={credit} vertical={vertical} />}
      {mounted(f, MOUNT.papyrus) && <Papyrus frame={f} />}
      {mounted(f, MOUNT.press) && <Press frame={f} />}
      {mounted(f, MOUNT.telegraph) && <Telegraph frame={f} />}
      {mounted(f, MOUNT.phone) && <Phone frame={f} />}
      {mounted(f, MOUNT.smartphone) && <Smartphone frame={f} screenMix={screenMix} />}
      <Bridge frame={f} cam={cam} aspect={vertical ? 1080 / 1920 : 1} />
      <ReturnToFire frame={f} rawFrame={rawFrame} credit={credit} />
      <PigmentParticles frame={f} />
      <Embers frame={f} rawFrame={rawFrame} />
      {!debug && <PostFX s={{frame: rawFrame, grain, exposure, screenMix, focus: cam.focus, bokeh, focusRange: Math.max(0.05, cam.focus * 0.45)}} />}
    </>
  );
};
