import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { FLIGHT_START, foldState, LAND_FRAME, paperTransform, SHEET_H, smoothstep } from "../timeline";
import { buildCreaseMasks, buildPaperGeometry, foldPoint } from "./folding";
import { backBase, fiberNormalMap, frontBase, grainCanvas, TEX_H, TEX_W } from "./textures";

type Props = { image: HTMLImageElement };

const makeMat = (map: THREE.Texture | null, normalMap: THREE.Texture) =>
  new THREE.MeshPhysicalMaterial({
    map,
    color: map ? 0xffffff : 0xefe9de,
    roughness: 0.85,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    sheen: 0.3,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color("#fff0dc"),
    envMapIntensity: 0.75,
    side: THREE.FrontSide,
  });

export const Paper: React.FC<Props> = ({ image }) => {
  const frame = useCurrentFrame();

  const data = useMemo(() => {
    const geo = buildPaperGeometry();
    const grain = grainCanvas(512, 724);
    const front0 = frontBase(image, grain);
    const back0 = backBase(grain);
    const MW = 768;
    const MH = Math.round((MW * TEX_H) / TEX_W);
    const masksFront = buildCreaseMasks(MW, MH, false);
    const masksBack = buildCreaseMasks(MW, MH, true);
    const mk = (base: HTMLCanvasElement) => {
      const c = document.createElement("canvas");
      c.width = TEX_W;
      c.height = TEX_H;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return { c, t, base };
    };
    const front = mk(front0);
    const back = mk(back0);
    const normal = fiberNormalMap();
    const mats = [makeMat(front.t, normal), makeMat(back.t, normal), makeMat(null, normal)];
    const mesh = new THREE.Mesh(geo.geometry, mats);
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.add(mesh);

    // wing-tip air streaks
    const STREAK_N = 14;
    const streakGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(2 * 2 * STREAK_N * 3);
    const sAlpha = new Float32Array(2 * 2 * STREAK_N);
    const sIdx: number[] = [];
    for (let s = 0; s < 2; s++) {
      const o = s * STREAK_N * 2;
      for (let i = 0; i < STREAK_N - 1; i++) {
        const a = o + i * 2;
        sIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    streakGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    streakGeo.setAttribute("alpha", new THREE.BufferAttribute(sAlpha, 1));
    streakGeo.setIndex(sIdx);
    const streakMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha * smoothstep(0.8, 1.8, distance(position, cameraPosition)); gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0);} `,
      fragmentShader: `uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0,0.93,0.85)*1.2, vA*uOpacity);} `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const streaks = new THREE.Mesh(streakGeo, streakMat);
    streaks.frustumCulled = false;
    return { geo, front, back, masksFront, masksBack, mats, mesh, group, streaks, sPos, sAlpha, STREAK_N };
  }, [image]);

  // ---- per-frame update (pure function of the frame)
  const st = foldState(frame);
  data.geo.update(st, frame);

  const paint = (
    target: { c: HTMLCanvasElement; t: THREE.CanvasTexture; base: HTMLCanvasElement },
    masks: HTMLCanvasElement[]
  ) => {
    const ctx = target.c.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(target.base, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    // the center crease is made by both the first fold and the final half-fold
    const weights = st.creases.slice();
    weights[0] = Math.max(weights[0], weights[7], weights[8]);
    weights[7] = 0;
    weights[8] = 0;
    weights.forEach((w, k) => {
      if (w <= 0.001) return;
      ctx.globalAlpha = Math.min(1, w);
      ctx.drawImage(masks[k], 0, 0, TEX_W, TEX_H);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    target.t.needsUpdate = true;
  };
  paint(data.front, data.masksFront);
  paint(data.back, data.masksBack);

  const { pos, quat } = paperTransform(frame);
  data.group.position.copy(pos);
  data.group.quaternion.copy(quat);
  data.group.updateMatrixWorld(true);

  // streaks from the two trailing wing tips over recent frames
  const flightAmt = smoothstep(FLIGHT_START + 6, FLIGHT_START + 16, frame) * (1 - smoothstep(LAND_FRAME - 16, LAND_FRAME - 4, frame));
  (data.streaks.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.32 * flightAmt;
  if (flightAmt > 0) {
    const v = new THREE.Vector3();
    const tips: [number, number][] = [
      [0.5, -SHEET_H / 2],
      [-0.5, -SHEET_H / 2],
    ];
    const local = tips.map(([x, y]) => foldPoint(x, y, 0, st, frame, new THREE.Vector3()));
    tips.forEach((_, s) => {
      for (let i = 0; i < data.STREAK_N; i++) {
        const fPast = frame - i * 0.07;
        const tr = paperTransform(fPast);
        v.copy(local[s]).applyQuaternion(tr.quat).add(tr.pos);
        // ribbon width perpendicular to motion, mostly vertical
        const wdt = 0.0035 * (1 - i / data.STREAK_N);
        const o = (s * data.STREAK_N + i) * 2;
        data.sPos.set([v.x, v.y + wdt, v.z], o * 3);
        data.sPos.set([v.x, v.y - wdt, v.z], (o + 1) * 3);
        const a = Math.pow(1 - i / (data.STREAK_N - 1), 1.6) * (i === 0 ? 0 : 1);
        data.sAlpha[o] = a;
        data.sAlpha[o + 1] = a;
      }
    });
    (data.streaks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (data.streaks.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  return (
    <>
      <primitive object={data.group} />
      <primitive object={data.streaks} />
    </>
  );
};
