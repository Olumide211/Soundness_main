import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo } from "react";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { mulberry32 } from "../paper/textures";
import { FPS, LEDGE, ROOF_A, ROOF_B, sunState, TABLE } from "../timeline";
import { buildCars, buildCity } from "./cityData";
import {
  BUILDING_FRAG,
  BUILDING_VERT,
  CAR_FRAG,
  CAR_VERT,
  CLOUD_FRAG,
  CLOUD_VERT,
  GROUND_FRAG,
  RIVER,
  RIVER_FRAG,
  SIMPLE_VERT,
  SKY_FRAG,
  SKY_VERT,
} from "./shaders";
import { concreteTexture, stoneTexture, woodTexture } from "./surfaces";

const FOG = 0.00009;

const makeSkyUniforms = () => ({
  uSunDir: { value: new THREE.Vector3(0, -0.02, 1).normalize() },
  uDusk: { value: 0 },
  uFogDensity: { value: FOG },
  uTime: { value: 0 },
});

/** Box with UVs in world units / tile so textures keep their real scale on every face. */
const texturedBox = (w: number, h: number, d: number, tile: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    let u: number;
    let v: number;
    if (ay > 0.5) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax > 0.5) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
};

export const World: React.FC = () => {
  const frame = useCurrentFrame();
  const { gl, scene, camera } = useThree();
  const shared = useMemo(() => makeSkyUniforms(), []);

  const built = useMemo(() => {
    const { blds, lights } = buildCity();
    // ---- buildings (instanced)
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const bMat = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: BUILDING_VERT, fragmentShader: BUILDING_FRAG });
    const inst = new THREE.InstancedMesh(box, bMat, blds.length);
    const size = new Float32Array(blds.length * 3);
    const info = new Float32Array(blds.length * 4);
    const m = new THREE.Matrix4();
    blds.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y0 ?? 0, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      inst.setMatrixAt(i, m);
      size.set([b.w, b.h, b.d], i * 3);
      info.set([b.seed, b.kind, b.lit, b.tint], i * 4);
    });
    box.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 3));
    box.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;

    // ---- aviation lights (two blink groups, drawn as glowing points)
    const glowTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.22, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const glowGroups = [0, 1].map((gi) => {
      const list = lights.filter((_, i) => i % 2 === gi);
      const pos = new Float32Array(list.length * 3);
      list.forEach((l, i) => pos.set([l.x, l.y, l.z], i * 3));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        map: glowTex,
        color: new THREE.Color(5, 0.25, 0.1),
        size: 10,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      return pts;
    });

    // ---- sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(36000, 48, 24),
      new THREE.ShaderMaterial({ uniforms: shared, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;

    // ---- thin afterglow clouds
    const rnd = mulberry32(77);
    const clouds = new THREE.Group();
    const sunAz = THREE.MathUtils.degToRad(8);
    for (let i = 0; i < 12; i++) {
      const az = sunAz + (rnd() - 0.5) * (i < 8 ? 1.4 : 4.5);
      const dist = 16000 + rnd() * 12000;
      const elev = 0.03 + rnd() * 0.09;
      const y = Math.tan(elev) * dist + 600;
      const w = 7000 + rnd() * 9000;
      const h = w * (0.08 + rnd() * 0.08);
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...shared, uSeed: { value: rnd() * 20 }, uOpacity: { value: 0.45 + rnd() * 0.35 } },
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
      });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      q.position.set(Math.sin(az) * dist, y, Math.cos(az) * dist);
      q.lookAt(0, y, 0);
      q.renderOrder = -5;
      q.frustumCulled = false;
      clouds.add(q);
    }

    // ---- ground + river
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: shared, vertexShader: SIMPLE_VERT, fragmentShader: GROUND_FRAG })
    );
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(26000, 2 * (RIVER.amp + RIVER.width), 1, 1).rotateX(-Math.PI / 2).translate(0, 0.8, RIVER.z0),
      new THREE.ShaderMaterial({ uniforms: shared, vertexShader: SIMPLE_VERT, fragmentShader: RIVER_FRAG })
    );

    // ---- car light trails: emissive points along the streets
    const { lanes, cars, n } = buildCars(5200);
    const carGeo = new THREE.BufferGeometry();
    carGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    carGeo.setAttribute("aLane", new THREE.BufferAttribute(lanes, 4));
    carGeo.setAttribute("aCar", new THREE.BufferAttribute(cars, 4));
    const carMat = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: CAR_VERT,
      fragmentShader: CAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const carPts = new THREE.Points(carGeo, carMat);
    carPts.frustumCulled = false;

    // ---- hero surfaces: rooftop deck + walnut table (A), stone ledge + terrace (B)
    const wood = woodTexture();
    const concrete = concreteTexture();
    const stone = stoneTexture();
    const near = new THREE.Group();
    const deckMat = new THREE.MeshStandardMaterial({ map: concrete.map, bumpMap: concrete.bump, bumpScale: 0.6, roughness: 0.92, color: 0x8a8a90 });
    const deckA = new THREE.Mesh(texturedBox(ROOF_A.x1 - ROOF_A.x0, 0.3, ROOF_A.z1 - ROOF_A.z0, 6), deckMat);
    deckA.position.set((ROOF_A.x0 + ROOF_A.x1) / 2, ROOF_A.h + 0.15, (ROOF_A.z0 + ROOF_A.z1) / 2);
    deckA.receiveShadow = true;
    near.add(deckA);
    const woodMat = new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.35, roughness: 0.78, metalness: 0 });
    const top = new THREE.Mesh(texturedBox(TABLE.x1 - TABLE.x0, TABLE.thick, TABLE.z1 - TABLE.z0, 4.2), woodMat);
    top.position.set((TABLE.x0 + TABLE.x1) / 2, TABLE.top - TABLE.thick / 2, (TABLE.z0 + TABLE.z1) / 2);
    top.receiveShadow = true;
    top.castShadow = true;
    near.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.7 });
    const legH = TABLE.top - TABLE.thick - ROOF_A.h - 0.3;
    for (const [lx, lz] of [
      [TABLE.x0 + 0.35, TABLE.z0 + 0.35],
      [TABLE.x1 - 0.35, TABLE.z0 + 0.35],
      [TABLE.x0 + 0.35, TABLE.z1 - 0.35],
      [TABLE.x1 - 0.35, TABLE.z1 - 0.35],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, legH, 0.16), legMat);
      leg.position.set(lx, ROOF_A.h + 0.3 + legH / 2, lz);
      near.add(leg);
    }
    const terraceMat = new THREE.MeshStandardMaterial({ map: concrete.map, bumpMap: concrete.bump, bumpScale: 0.6, roughness: 0.92, color: 0x77777e });
    const terrace = new THREE.Mesh(texturedBox(ROOF_B.x1 - ROOF_B.x0, 0.3, LEDGE.z0 - ROOF_B.z0, 6), terraceMat);
    terrace.position.set((ROOF_B.x0 + ROOF_B.x1) / 2, ROOF_B.h + 0.15, (ROOF_B.z0 + LEDGE.z0) / 2);
    terrace.receiveShadow = true;
    near.add(terrace);
    const stoneMat = new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 0.5, roughness: 0.88 });
    const ledge = new THREE.Mesh(texturedBox(LEDGE.x1 - LEDGE.x0, LEDGE.top - ROOF_B.h, LEDGE.z1 - LEDGE.z0, 3.4), stoneMat);
    ledge.position.set((LEDGE.x0 + LEDGE.x1) / 2, (LEDGE.top + ROOF_B.h) / 2, (LEDGE.z0 + LEDGE.z1) / 2);
    ledge.receiveShadow = true;
    near.add(ledge);

    return { inst, glowGroups, sky, clouds, ground, river, carPts, near };
  }, [shared]);

  // procedural HDRI of the dusk sky for image based lighting / reflections
  useLayoutEffect(() => {
    const envScene = new THREE.Scene();
    const u = makeSkyUniforms();
    const s = sunState(150);
    u.uSunDir.value.copy(s.dir);
    u.uDusk.value = s.dusk;
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: SKY_VERT.replace("gl_Position.z = gl_Position.w;", ""),
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat));
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene]);

  const s = sunState(frame);
  shared.uSunDir.value.copy(s.dir);
  shared.uDusk.value = s.dusk;
  shared.uTime.value = frame / FPS;
  built.sky.position.copy(camera.position);
  const blink = (ph: number) => (Math.sin((frame / FPS) * Math.PI * 1.25 + ph) > 0.2 ? 1 : 0.05);
  (built.glowGroups[0].material as THREE.PointsMaterial).color.setRGB(5 * blink(0), 0.25 * blink(0), 0.1 * blink(0));
  (built.glowGroups[1].material as THREE.PointsMaterial).color.setRGB(5 * blink(2.1), 0.25 * blink(2.1), 0.1 * blink(2.1));

  return (
    <>
      <primitive object={built.sky} />
      <primitive object={built.clouds} />
      <primitive object={built.ground} />
      <primitive object={built.river} />
      <primitive object={built.inst} />
      <primitive object={built.carPts} />
      <primitive object={built.near} />
      {built.glowGroups.map((g, i) => (
        <primitive key={`g${i}`} object={g} />
      ))}
    </>
  );
};
