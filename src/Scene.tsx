import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { ToneMappingMode } from "postprocessing";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { Paper } from "./paper/Paper";
import { CAM_FAR, CAM_NEAR, cameraAt, LAUNCH, LANDED, paperTransform, smoothstep, sunState, vfovFor } from "./timeline";
import { World } from "./world/World";

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DofRef = React.RefObject<any>;

const Rig: React.FC<{ dofRef: DofRef }> = ({ dofRef }) => {
  const frame = useCurrentFrame();
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const aspect = size.width / size.height;

  const key = useMemo(() => {
    const l = new THREE.DirectionalLight("#ffa564", 2.4);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const sc = l.shadow.camera as THREE.OrthographicCamera;
    sc.left = -2.6;
    sc.right = 2.6;
    sc.top = 2.6;
    sc.bottom = -2.6;
    sc.near = 0.5;
    sc.far = 40;
    l.shadow.bias = -0.0002;
    l.shadow.normalBias = 0.004;
    l.shadow.radius = 3;
    return l;
  }, []);
  const fill = useMemo(() => new THREE.DirectionalLight("#dfe6ff", 0.5), []);

  const c = cameraAt(frame);
  cam.fov = THREE.MathUtils.radToDeg(vfovFor(aspect));
  cam.aspect = aspect;
  cam.near = CAM_NEAR;
  cam.far = CAM_FAR;
  cam.position.copy(c.position);
  cam.up.copy(c.up);
  cam.lookAt(c.target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  const s = sunState(frame);
  const { pos } = paperTransform(frame);
  key.position.copy(pos).addScaledVector(s.key, 20);
  key.target.position.copy(pos);
  key.target.updateMatrixWorld();
  // warm key: on the table, softer in flight, "last warm light" on the ledge
  key.intensity = interpolate(frame, [0, 170, 200, 280, 305, 360], [2.5, 2.4, 1.6, 1.8, 3.0, 3.0], clampOpts);
  const toCam = c.position.clone().sub(pos).normalize();
  fill.position.copy(pos).addScaledVector(toCam, 10).add(new THREE.Vector3(0, 3, 0));
  fill.target.position.copy(pos);
  fill.target.updateMatrixWorld();
  fill.intensity = interpolate(frame, [0, 170, 200, 290, 320], [0.75, 0.75, 1.35, 1.35, 0.7], clampOpts);

  return (
    <>
      <primitive object={key} />
      <primitive object={key.target} />
      <primitive object={fill} />
      <primitive object={fill.target} />
      <hemisphereLight args={["#6a6cb0", "#2a1e1c", 1.15]} />
    </>
  );
};

const FX = (process.env.REMOTION_FX ?? "dof,bloom").split(",");
const Effects: React.FC<{ dofRef: DofRef }> = ({ dofRef }) => {
  const frame = useCurrentFrame();
  // focus is set right before the composer renders this frame
  useFrame(({ camera }) => {
    const dof = dofRef.current;
    if (!dof) return;
    const { pos } = paperTransform(frame);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const depth = pos.clone().sub(camera.position).dot(dir);
    const coc = dof.cocMaterial;
    coc.worldFocusDistance = depth;
    // NB: postprocessing subtracts the near plane from the world range
    const onTable = frame < LAUNCH + 6 || frame > LANDED;
    coc.worldFocusRange = CAM_NEAR + (onTable ? 0.75 : Math.max(1.1, depth * 0.35));
    dof.bokehScale = interpolate(frame, [0, 175, 200, 300, 320], [5.5, 5.5, 3.6, 3.6, 4.5], clampOpts);
  }, 0);
  return (
  <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
    {FX.includes("dof") ? <DepthOfField ref={dofRef} worldFocusDistance={3} worldFocusRange={1} bokehScale={5} resolutionScale={0.5} /> : <></>}
    {FX.includes("bloom") ? <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1.9} luminanceSmoothing={0.25} radius={0.72} /> : <></>}
    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
  </EffectComposer>
  );
};

const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.16 }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

const EndText: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (frame < 330) return null;
  const tall = height / width > 1.5;
  const t = smoothstep(330, 345, frame);
  const y = (1 - t) * 10;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: height * (5 / 6),
          transform: `translateY(-50%) translateY(${y}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontFamily: "InterUI, Inter, sans-serif",
          color: "white",
          textShadow: "0 2px 16px rgba(0,0,0,0.45)",
          opacity: t,
        }}
      >
        <div style={{ fontWeight: 500, fontSize: tall ? 52 : 44, letterSpacing: "0.01em", opacity: 0.9 }}>made with code.</div>
        <div style={{ fontWeight: 500, fontSize: 28, marginTop: tall ? 16 : 12, opacity: 0.6, letterSpacing: "0.02em" }}>Breeze × Opus 5.6</div>
      </div>
    </AbsoluteFill>
  );
};

export const PaperPlane: React.FC = () => {
  const { width, height } = useVideoConfig();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [handle] = useState(() => delayRender("Loading paper assets"));
  const dofRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = staticFile("paper.jpg");
    const fonts = [
      new FontFace("InterPaper", `url(${staticFile("fonts/Inter-SemiBold.otf")})`, { weight: "600" }),
      new FontFace("InterUI", `url(${staticFile("fonts/Inter-Medium.otf")})`, { weight: "500" }),
    ];
    Promise.all([img.decode(), ...fonts.map((f) => f.load().then((ff) => void document.fonts.add(ff)))])
      .then(() => {
        if (!cancelled) {
          setImage(img);
          continueRender(handle);
        }
      })
      .catch((e) => {
        console.error(e);
        continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#07070d" }}>
      {image ? (
        <ThreeCanvas
          width={width}
          height={height}
          shadows="soft"
          gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NoToneMapping;
            gl.toneMappingExposure = 0.62;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
          camera={{ fov: 46, near: CAM_NEAR, far: CAM_FAR, position: [0, 530, -3] }}
        >
          <Rig dofRef={dofRef} />
          <World />
          <Paper image={image} />
          {process.env.REMOTION_NOFX ? null : <Effects dofRef={dofRef} />}
        </ThreeCanvas>
      ) : null}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.38) 100%)",
        }}
      />
      <Grain />
      <EndText />
    </AbsoluteFill>
  );
};
