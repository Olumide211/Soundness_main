import * as THREE from 'three';
import { makeComposer } from './lib/post';
import { PlanarReflector, addReflection } from './lib/reflector';
import { makeConcrete } from './lib/textures';
import {
  NSEG, OBJ, objX, orbState, camState, applyCam, segOf, segStart, CamState, R_ORB, INTRO,
} from './state';
import { createOrb } from './objects/orb';
import { createTongs } from './objects/tongs';
import { createIce } from './objects/ice';
import { createChocolate } from './objects/chocolate';
import { createCandle } from './objects/candle';
import { createSoda } from './objects/soda';
import { createPaper } from './objects/paper';
import { createJelly } from './objects/jelly';
import { createMelon } from './objects/melon';
import { createSteel } from './objects/steel';
import { Ctx, SceneObject } from './objects/common';

function buildEnv(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.014), side: THREE.BackSide }));
  env.add(room);
  const add = (w: number, h: number, c: THREE.Color, p: THREE.Vector3) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.copy(p); m.lookAt(0, 0, 0); env.add(m);
  };
  add(70, 55, new THREE.Color(3.4, 3.4, 3.55), new THREE.Vector3(-48, 62, 34)); // big softbox top-left
  add(12, 80, new THREE.Color(2.6, 1.7, 1.0), new THREE.Vector3(55, 28, -55)); // warm rim strip back-right
  add(60, 20, new THREE.Color(0.16, 0.16, 0.17), new THREE.Vector3(0, 8, 92)); // faint front fill
  add(40, 30, new THREE.Color(0.5, 0.5, 0.52), new THREE.Vector3(60, 40, 30)); // small kicker right
  add(90, 50, new THREE.Color(0.9, 0.9, 0.95), new THREE.Vector3(0, 85, -30)); // overhead scrim
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.0).texture;
  pm.dispose();
  return tex;
}

function buildBackdrop() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() } },
    clipping: true,
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec3 uCam; varying vec3 vW;
      void main(){
        #include <clipping_planes_fragment>
        vec2 d = vec2((vW.x - uCam.x) / 140.0, (vW.y - 25.0) / 95.0);
        float pool = exp(-dot(d, d) * 2.2);
        vec3 col = mix(vec3(0.010, 0.010, 0.011), vec3(0.075, 0.074, 0.078), pool);
        col *= 0.92 + 0.08 * smoothstep(-40.0, 40.0, vW.y);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  // seamless sweep: vertical wall + curved cove into the floor (behind & below the table)
  const W = 900;
  const geo = new THREE.PlaneGeometry(W, 400, 1, 1);
  const wall = new THREE.Mesh(geo, mat);
  wall.position.set(160, 100, -170);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 400), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(160, -30, 30);
  const g = new THREE.Group();
  g.add(wall, floor);
  return { group: g, mat };
}

export function buildWorld(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, W: number, H: number) {
  gl.toneMapping = THREE.NoToneMapping;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFShadowMap;
  gl.localClippingEnabled = false;
  gl.setClearColor(0x050505, 1);
  camera.filmGauge = 36;
  camera.setFocalLength(50);
  camera.near = 1; camera.far = 1200;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();

  scene.environment = buildEnv(gl);
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color(0x020202);

  // ---- lights ----
  const keyDir = new THREE.Vector3(-0.55, 0.95, 0.42).normalize();
  const key = new THREE.DirectionalLight(new THREE.Color('#fff4e8'), 2.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 260;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 7;
  scene.add(key, key.target);
  const rim = new THREE.SpotLight(new THREE.Color('#ffb070'), 11000, 0, 0.4, 1.0, 2);
  scene.add(rim, rim.target);
  const fill = new THREE.HemisphereLight(new THREE.Color('#2a2d33'), new THREE.Color('#0b0b0c'), 0.35);
  scene.add(fill);

  // ---- table ----
  const reflTable = new PlanarReflector(Math.round(W / 2), Math.round(H / 2), 0);
  const reflSteel = new PlanarReflector(Math.round(W / 2), Math.round(H / 2), 5.0);
  const { map, bump } = makeConcrete(1024);
  map.repeat.set(26, 6.5); bump.repeat.set(26, 6.5);
  const tableMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6c6f74'), map, bumpMap: bump, bumpScale: 0.6, roughness: 0.88, envMapIntensity: 0.5 });
  addReflection(tableMat, reflTable, 0.05, 3.8);
  const table = new THREE.Mesh(new THREE.BoxGeometry(520, 4, 130, 1, 1, 1), tableMat);
  table.position.set(160, -2, -10);
  table.receiveShadow = true;
  // UVs: scale for the box top
  scene.add(table);
  const backdrop = buildBackdrop();
  scene.add(backdrop.group);

  // ---- orb & tongs ----
  const orb = createOrb();
  const tongs = createTongs();
  scene.add(orb.group, tongs.group);

  // ---- objects ----
  const objects: SceneObject[] = [
    createIce(), createChocolate(), createCandle(), createSoda(), createPaper(), createJelly(), createMelon(), createSteel(reflSteel),
  ];
  objects.forEach((o, i) => { o.group.position.set(objX(i), 0, 0); scene.add(o.group); });

  const { composer, dof, lens, grain } = makeComposer(gl, scene, camera, W, H);

  const cs: CamState = { pos: new THREE.Vector3(), target: new THREE.Vector3(), roll: 0, pitch: 0, yaw: 0 };
  const scratchCam = camera.clone();
  const tmpV = new THREE.Vector3();
  const orbLocal = new THREE.Vector3();
  const shimmerList: { p: THREE.Vector3; r: number; s: number }[] = [];
  const project = (cam: THREE.PerspectiveCamera, p: THREE.Vector3, out: THREE.Vector2) => {
    tmpV.copy(p).project(cam);
    out.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
    return out;
  };
  const uvA = new THREE.Vector2(), uvB = new THREE.Vector2();
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  function update(frame: number) {
    const time = frame / 30;
    const { i: seg, t } = segOf(frame);
    const os = orbState(frame);
    camState(frame, cs);
    applyCam(camera, cs);

    // lights follow the current set
    const fx = cs.target.x;
    key.target.position.set(fx, 3, 0);
    key.position.copy(key.target.position).addScaledVector(keyDir, 120);
    key.target.updateMatrixWorld();
    rim.position.set(fx + 30, 52, -56);
    rim.target.position.set(fx, 5, 0);
    rim.target.updateMatrixWorld();
    backdrop.mat.uniforms.uCam.value.copy(cs.pos);

    orb.group.position.copy(os.pos);
    orb.update(time, frame, os.heat);
    tongs.update(os.pos, os.jaw, os.lift, os.heat);

    shimmerList.length = 0;
    const ctxBase = {
      frame, time, orb: os.pos, heat: os.heat, camera,
      shimmer: (p: THREE.Vector3, r: number, s: number) => { if (s > 0) shimmerList.push({ p: p.clone(), r, s }); },
    };
    let steelVisible = false;
    objects.forEach((o, i) => {
      const lt = frame - segStart(i);
      const vis = lt >= -12 && (i === NSEG - 1 ? true : lt <= 116);
      o.group.visible = vis || (frame < INTRO && i === 0);
      if (!o.group.visible) return;
      if (i === NSEG - 1) steelVisible = true;
      orbLocal.copy(os.pos).sub(o.group.position);
      const c: Ctx = { ...ctxBase, t: lt, orbLocal };
      o.update(c);
    });

    // ---- post uniforms ----
    const L = lens.uniforms;
    L.get('uTime')!.value = time;
    L.get('uAspect')!.value = W / H;
    const srcs = L.get('uSrc')!.value as THREE.Vector4[];
    const dist = camera.position.distanceTo(os.pos);
    const orbR = R_ORB / (dist * tanHalf) * 0.5; // in uv-y units
    project(camera, tmpV.set(os.pos.x, os.pos.y + 0.5, os.pos.z), uvA);
    const orbUv = uvA.clone();
    srcs[0].set(orbUv.x, orbUv.y, orbR * 1.15, 1.0 * os.heat);
    for (let k = 1; k < 3; k++) {
      const s = shimmerList[k - 1];
      if (s) {
        project(camera, s.p, uvB);
        const d = camera.position.distanceTo(s.p);
        srcs[k].set(uvB.x, uvB.y, s.r / (d * tanHalf) * 0.5, s.s);
      } else srcs[k].set(0, 0, 0.1, 0);
    }
    L.get('uMask')!.value.set(orbUv.x, orbUv.y, orbR);
    // motion blur from camera motion between frames (180° shutter)
    if (frame > 0) {
      const prev = camState(frame - 1);
      applyCam(scratchCam, prev);
      scratchCam.projectionMatrix.copy(camera.projectionMatrix);
      const P = tmpV.set(cs.target.x, 2, 0).clone();
      project(camera, P, uvA);
      project(scratchCam, P, uvB);
      const vel = uvA.clone().sub(uvB).multiplyScalar(0.55);
      L.get('uVel')!.value.copy(vel);
    } else L.get('uVel')!.value.set(0, 0);
    // DOF on the contact point
    dof.target.set(os.pos.x, os.pos.y - R_ORB * (seg < 0 ? 0 : 0.9), os.pos.z);
    grain.uniforms.get('uFrame')!.value = frame;

    // reflections
    const hideT = [table, backdrop.group];
    reflTable.update(gl, scene, camera, hideT);
    if (steelVisible && seg === NSEG - 1) {
      const steel = objects[NSEG - 1];
      reflSteel.update(gl, scene, camera, [table, backdrop.group, steel.group]);
    }
    void t; void OBJ;
  }

  function render() {
    composer.render(1 / 30);
  }
  function setSize(w: number, h: number) {
    composer.setSize(w, h, false);
  }
  return { update, render, setSize };
}
