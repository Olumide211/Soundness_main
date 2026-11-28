import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo } from "react";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { mulberry32 } from "../paper/textures";
import { FPS, sunState } from "../timeline";
import { buildCars, buildCity } from "./cityData";
import {
  BUILDING_FRAG,
  BUILDING_VERT,
  CAR_FRAG,
  CAR_VERT,
  CLOUD_FRAG,
  CLOUD_VERT,
  GROUND_FRAG,
  SIMPLE_VERT,
  SKY_FRAG,
  SKY_VERT,
} from "./shaders";

const FOG = 0.00085;

const makeSkyUniforms = () => ({
  uSunDir: { value: new THREE.Vector3(0, 0.1, 1).normalize() },
  uDusk: { value: 0 },
  uFogDensity: { value: FOG },
  uTime: { value: 0 },
});

export const World: React.FC = () => {
  const frame = useCurrentFrame();
  const { gl, scene, camera } = useThree();

  const shared = useMemo(() => makeSkyUniforms(), []);

  const built = useMemo(() => {
    const { blds, lights } = buildCity();
    // ---- buildings
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const bMat = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: BUILDING_VERT,
      fragmentShader: BUILDING_FRAG,
    });
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

    // ---- aviation lights (two blink groups)
    const lightGeo = new THREE.SphereGeometry(0.55, 10, 8);
    const lightGroups = [0, 1].map((g) => {
      const list = lights.filter((_, i) => i % 2 === g);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.25, 0.12), toneMapped: false });
      const im = new THREE.InstancedMesh(lightGeo, mat, list.length);
      list.forEach((l, i) => {
        m.makeTranslation(l.x, l.y, l.z);
        im.setMatrixAt(i, m);
      });
      im.frustumCulled = false;
      return im;
    });
    // glow sprites around lights for small/far ones
    const glowTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const glowGroups = [0, 1].map((g) => {
      const list = lights.filter((_, i) => i % 2 === g);
      const pos = new Float32Array(list.length * 3);
      list.forEach((l, i) => pos.set([l.x, l.y, l.z], i * 3));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        map: glowTex,
        color: new THREE.Color(3.5, 0.18, 0.08),
        size: 9,
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
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uSunDisk: { value: 1 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;

    // ---- clouds (noise billboards)
    const rnd = mulberry32(77);
    const clouds = new THREE.Group();
    const sunAz = Math.atan2(0.17, 1);
    for (let i = 0; i < 18; i++) {
      const az = sunAz + (rnd() - 0.5) * (i < 10 ? 1.6 : 5.5);
      const dist = 2600 + rnd() * 1700;
      const elev = 0.035 + rnd() * 0.14 + (i % 3 === 0 ? 0.08 : 0);
      const y = Math.tan(elev) * dist + 120;
      const w = 900 + rnd() * 1500;
      const h = w * (0.16 + rnd() * 0.12);
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...shared, uSeed: { value: rnd() * 20 }, uOpacity: { value: 0.55 + rnd() * 0.4 } },
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
      });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      q.position.set(Math.sin(az) * dist + 80, y, Math.cos(az) * dist + 100);
      q.lookAt(80, y, 100);
      q.renderOrder = -5;
      q.frustumCulled = false;
      clouds.add(q);
    }

    // ---- ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: shared, vertexShader: SIMPLE_VERT, fragmentShader: GROUND_FRAG })
    );

    // ---- car light trails
    const { lanes, cars } = buildCars(2200);
    const carGeo = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    carGeo.index = plane.index;
    carGeo.setAttribute("position", plane.getAttribute("position"));
    carGeo.setAttribute("uv", plane.getAttribute("uv"));
    carGeo.setAttribute("aLane", new THREE.InstancedBufferAttribute(lanes, 4));
    carGeo.setAttribute("aCar", new THREE.InstancedBufferAttribute(cars, 3));
    carGeo.instanceCount = cars.length / 3;
    const carMat = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: CAR_VERT,
      fragmentShader: CAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const carMesh = new THREE.Mesh(carGeo, carMat);
    carMesh.frustumCulled = false;

    return { inst, lightGroups, glowGroups, sky, skyMat, clouds, ground, carMesh };
  }, [shared]);

  // procedural HDRI from the sky for image based lighting/reflections
  useLayoutEffect(() => {
    const envScene = new THREE.Scene();
    const u = makeSkyUniforms();
    const s = sunState(120);
    u.uSunDir.value.copy(s.dir);
    u.uDusk.value = 0.3;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...u, uSunDisk: { value: 0.15 } },
      vertexShader: SKY_VERT.replace("gl_Position.z = gl_Position.w;", ""),
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat));
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene]);

  // per-frame uniforms
  const s = sunState(frame);
  shared.uSunDir.value.copy(s.dir);
  shared.uDusk.value = s.dusk;
  shared.uTime.value = frame / FPS;
  built.sky.position.copy(camera.position);
  const blinkA = Math.sin((frame / FPS) * Math.PI * 1.25) > 0.15 ? 1 : 0.06;
  const blinkB = Math.sin((frame / FPS) * Math.PI * 1.25 + 2.1) > 0.15 ? 1 : 0.06;
  (built.lightGroups[0].material as THREE.MeshBasicMaterial).color.setRGB(6 * blinkA, 0.25 * blinkA, 0.12 * blinkA);
  (built.lightGroups[1].material as THREE.MeshBasicMaterial).color.setRGB(6 * blinkB, 0.25 * blinkB, 0.12 * blinkB);
  (built.glowGroups[0].material as THREE.PointsMaterial).color.setRGB(3.5 * blinkA, 0.18 * blinkA, 0.08 * blinkA);
  (built.glowGroups[1].material as THREE.PointsMaterial).color.setRGB(3.5 * blinkB, 0.18 * blinkB, 0.08 * blinkB);

  return (
    <>
      <primitive object={built.sky} />
      <primitive object={built.clouds} />
      <primitive object={built.ground} />
      <primitive object={built.inst} />
      <primitive object={built.carMesh} />
      {built.lightGroups.map((g, i) => (
        <primitive key={`l${i}`} object={g} />
      ))}
      {built.glowGroups.map((g, i) => (
        <primitive key={`g${i}`} object={g} />
      ))}
    </>
  );
};
