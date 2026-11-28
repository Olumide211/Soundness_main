import { useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ThreeCanvas } from "@remotion/three";
import { ToneMappingMode } from "postprocessing";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { Paper } from "./paper/Paper";
import { cameraAt, LAND_FRAME, paperTransform, sunState } from "./timeline";
import { World } from "./world/World";

// horizontal field of view kept constant across aspect ratios
const HFOV_4x5 = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(38) / 2) * 0.8);

const Rig: React.FC<{ dofRef: React.RefObject<any> }> = ({ dofRef }) => {
  const frame = useCurrentFrame();
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const aspect = size.width / size.height;
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HFOV_4x5 / 2) / aspect));

  const sun = useMemo(() => new THREE.DirectionalLight("#ffb070", 2.6), []);
  const fill = useMemo(() => new THREE.DirectionalLight("#fff1e2", 1.0), []);
  const rim = useMemo(() => new THREE.DirectionalLight("#ffcf9a", 0.0), []);

  const c = cameraAt(frame);
  cam.fov = vfov;
  cam.aspect = aspect;
  cam.near = 0.05;
  cam.far = 7000;
  cam.position.copy(c.position);
  cam.up.set(0, 1, 0);
  cam.lookAt(c.target);
  // gentle roll following the bank during the chase
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  const s = sunState(frame);
  const { pos } = paperTransform(frame);
  sun.position.copy(pos).addScaledVector(s.dir, 50);
  sun.target.position.copy(pos);
  sun.intensity = 2.8 * (1 - 0.45 * s.dusk);
  sun.color.setRGB(1.0, 0.66 - 0.12 * s.dusk, 0.4 - 0.1 * s.dusk);
  sun.target.updateMatrixWorld();
  // soft key from the camera side keeps the print readable when backlit
  const toCam = c.position.clone().sub(pos).normalize();
  fill.position.copy(pos).addScaledVector(toCam, 10).add(new THREE.Vector3(0, 4, 0));
  fill.target.position.copy(pos);
  fill.target.updateMatrixWorld();
  fill.intensity = interpolate(frame, [300, 340], [0.95, 1.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // golden back light during the finale
  rim.position.copy(pos).addScaledVector(s.dir, 20).add(new THREE.Vector3(0, 3, 0));
  rim.target.position.copy(pos);
  rim.target.updateMatrixWorld();
  rim.intensity = interpolate(frame, [300, 330], [0, 2.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // focus on the paper
  const dist = c.position.distanceTo(pos);
  if (dofRef.current) {
    const coc = dofRef.current.cocMaterial;
    coc.worldFocusDistance = dist;
    coc.worldFocusRange = Math.max(0.9, dist * 0.55);
  }

  return (
    <>
      <primitive object={sun} />
      <primitive object={sun.target} />
      <primitive object={fill} />
      <primitive object={fill.target} />
      <primitive object={rim} />
      <primitive object={rim.target} />
      <hemisphereLight args={["#9fb0d8", "#3a2a22", 0.25]} />
    </>
  );
};

const FX = (process.env.REMOTION_FX ?? "dof,bloom").split(",");
const Effects: React.FC<{ dofRef: React.RefObject<any> }> = ({ dofRef }) => {
  return (
    <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
      {FX.includes("dof") ? (
        <DepthOfField ref={dofRef} worldFocusDistance={3} worldFocusRange={2} bokehScale={3.2} resolutionScale={0.5} />
      ) : (
        <></>
      )}
      {FX.includes("bloom") ? <Bloom mipmapBlur intensity={0.75} luminanceThreshold={1.0} luminanceSmoothing={0.3} radius={0.78} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
};

const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.22 }}>
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
  const o = interpolate(frame, [330, 343], [0, 0.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [330, 345], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < 330) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90 }}>
      <div
        style={{
          fontFamily: "InterUI, Inter, sans-serif",
          fontWeight: 500,
          fontSize: 44,
          letterSpacing: "0.02em",
          color: "white",
          opacity: o,
          transform: `translateY(${y}px)`,
          textShadow: "0 2px 18px rgba(0,0,0,0.35)",
        }}
      >
        made with code.
      </div>
    </AbsoluteFill>
  );
};

export const PaperPlane: React.FC = () => {
  const { width, height } = useVideoConfig();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [handle] = useState(() => delayRender("Loading paper assets"));
  const dofRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = staticFile("paper.jpg");
    const fonts = [
      new FontFace("InterPaper", `url(${staticFile("fonts/Inter-SemiBold.otf")})`, { weight: "600" }),
      new FontFace("InterUI", `url(${staticFile("fonts/Inter-Medium.otf")})`, { weight: "500" }),
    ];
    Promise.all([
      img.decode(),
      ...fonts.map((f) =>
        f.load().then((ff) => {
          document.fonts.add(ff);
        })
      ),
    ])
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
    <AbsoluteFill style={{ backgroundColor: "#0b0f1a" }}>
      {image ? (
        <ThreeCanvas
          width={width}
          height={height}
          gl={{ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NoToneMapping;
            gl.toneMappingExposure = 0.62;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
          camera={{ fov: 38, near: 0.05, far: 7000, position: [0, 304, 3.4] }}
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
          background: "radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)",
        }}
      />
      <Grain />
      <EndText />
    </AbsoluteFill>
  );
};
