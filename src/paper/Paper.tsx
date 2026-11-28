import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { flightAmount, foldState, paperTransform, SHEET_H, sunState } from "../timeline";
import { buildCreaseMasks, buildPaperGeometry, CreaseMasks, foldPoint } from "./folding";
import { backBase, fiberNormalMap, frontBase, grainCanvas, TEX_H, TEX_W } from "./textures";

type Props = { image: HTMLImageElement };

type TransUniforms = { uTransDir: { value: THREE.Vector3 } };

const makeMat = (map: THREE.Texture | null, normalMap: THREE.Texture, trans: TransUniforms, amount: number) => {
  const m = new THREE.MeshPhysicalMaterial({
    map,
    color: map ? 0xffffff : 0xece6da,
    roughness: 0.85,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.16, 0.16),
    sheen: 0.3,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color("#fff0dc"),
    envMapIntensity: 0.55,
    side: THREE.FrontSide,
  });
  // slight translucency: light hitting the other side glows through the sheet
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTransDir = trans.uTransDir;
    shader.uniforms.uTransAmt = { value: amount };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uTransDir;\nuniform float uTransAmt;")
      .replace(
        "#include <opaque_fragment>",
        `float transl = pow(max(dot(-normal, uTransDir), 0.0), 1.4);
        outgoingLight += diffuseColor.rgb * vec3(1.0, 0.70, 0.42) * transl * uTransAmt;
        #include <opaque_fragment>`
      );
  };
  m.customProgramCacheKey = () => `paper-trans-${amount}`;
  return m;
};

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
    const trans: TransUniforms = { uTransDir: { value: new THREE.Vector3(0, 1, 0) } };
    const mats = [makeMat(front.t, normal, trans, 0.22), makeMat(back.t, normal, trans, 0.3), makeMat(null, normal, trans, 0.2)];
    const mesh = new THREE.Mesh(geo.geometry, mats);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const keyWorld = new THREE.Vector3();
    mesh.onBeforeRender = (_r, _s, camera) => {
      trans.uTransDir.value.copy(keyWorld).transformDirection(camera.matrixWorldInverse);
    };
    const group = new THREE.Group();
    group.add(mesh);

    // faint motion-blur trail: ghost copies at sub-frame past positions
    const ghostMats = (o: number) =>
      [front.t, back.t, null].map(
        (t) =>
          new THREE.MeshBasicMaterial({
            map: t,
            color: new THREE.Color(0.42, 0.4, 0.42),
            transparent: true,
            opacity: o,
            depthWrite: false,
          })
      );
    const ghosts = [0.05, 0.03, 0.015].map((o) => {
      const g = new THREE.Mesh(geo.geometry, ghostMats(o));
      g.frustumCulled = false;
      g.renderOrder = 2;
      return { mesh: g, opacity: o };
    });

    // wing-tip air streaks
    const STREAK_N = 12;
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
      fragmentShader: `uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0,0.93,0.85), vA*uOpacity);} `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const streaks = new THREE.Mesh(streakGeo, streakMat);
    streaks.frustumCulled = false;
    return { geo, front, back, masksFront, masksBack, mesh, group, ghosts, streaks, sPos, sAlpha, STREAK_N, keyWorld };
  }, [image]);

  // ---- per-frame update (pure function of the frame)
  const st = foldState(frame);
  const { pos, quat } = paperTransform(frame);
  const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(quat.clone().invert());
  data.geo.update(st, frame, upLocal);
  data.keyWorld.copy(sunState(frame).key);

  const paint = (
    target: { c: HTMLCanvasElement; t: THREE.CanvasTexture; base: HTMLCanvasElement },
    masks: CreaseMasks
  ) => {
    const ctx = target.c.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(target.base, 0, 0);
    // the center crease is made by both the first fold and the final half-fold
    const weights = st.creases.slice();
    weights[0] = Math.max(weights[0], weights[7], weights[8]);
    weights[7] = 0;
    weights[8] = 0;
    ctx.globalCompositeOperation = "multiply";
    weights.forEach((w, k) => {
      if (w <= 0.001) return;
      ctx.globalAlpha = Math.min(1, w);
      ctx.drawImage(masks.dark[k], 0, 0, TEX_W, TEX_H);
    });
    ctx.globalCompositeOperation = "screen";
    weights.forEach((w, k) => {
      if (w <= 0.001) return;
      ctx.globalAlpha = Math.min(1, w);
      ctx.drawImage(masks.light[k], 0, 0, TEX_W, TEX_H);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    target.t.needsUpdate = true;
  };
  paint(data.front, data.masksFront);
  paint(data.back, data.masksBack);

  data.group.position.copy(pos);
  data.group.quaternion.copy(quat);
  data.group.updateMatrixWorld(true);

  const fa = flightAmount(frame);
  data.ghosts.forEach((g, i) => {
    const tr = paperTransform(frame - (i + 1) * 0.22);
    g.mesh.position.copy(tr.pos);
    g.mesh.quaternion.copy(tr.quat);
    g.mesh.visible = fa > 0.01;
    (g.mesh.material as THREE.MeshBasicMaterial[]).forEach((m) => (m.opacity = g.opacity * fa));
  });

  (data.streaks.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.22 * fa;
  if (fa > 0) {
    const v = new THREE.Vector3();
    const tips: [number, number][] = [
      [0.5, -SHEET_H / 2],
      [-0.5, -SHEET_H / 2],
    ];
    const local = tips.map(([x, y]) => foldPoint(x, y, 0, st, frame, new THREE.Vector3()));
    tips.forEach((_, s) => {
      for (let i = 0; i < data.STREAK_N; i++) {
        const tr = paperTransform(frame - i * 0.08);
        v.copy(local[s]).applyQuaternion(tr.quat).add(tr.pos);
        const wdt = 0.003 * (1 - i / data.STREAK_N);
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
      {data.ghosts.map((g, i) => (
        <primitive key={i} object={g.mesh} />
      ))}
      <primitive object={data.streaks} />
    </>
  );
};
