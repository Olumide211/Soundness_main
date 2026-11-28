import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Sprites } from '../lib/particles';
import { makeBrushed } from '../lib/textures';
import { PlanarReflector } from '../lib/reflector';
import { rr, rnd } from '../lib/rng';
import { clamp, smoothstep, G } from '../lib/math';
import { R_ORB } from '../state';
import { Ctx, SceneObject } from './common';

const BW = 9.5, BH = 5.0, BD = 7.5;

export function createSteel(refl: PlanarReflector): SceneObject & { refl: PlanarReflector } {
  const group = new THREE.Group();
  const geo = new RoundedBoxGeometry(BW, BH, BD, 5, 0.32);
  geo.translate(0, BH / 2, 0);
  const brushed = makeBrushed(256);
  brushed.repeat.set(2, 2);
  brushed.rotation = Math.PI / 2;
  const uniforms = {
    uHeat: { value: 0 }, uC: { value: new THREE.Vector2() },
    uReflTex: { value: refl.rt.texture }, uReflMat: { value: refl.textureMatrix },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d2d6db'), metalness: 1, roughness: 0.3, roughnessMap: brushed, anisotropy: 0.55,
    envMapIntensity: 2.6, clearcoat: 0.0,
  });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc; uniform mat4 uReflMat; varying vec4 vReflCoord;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflCoord = uReflMat * (modelMatrix * vec4(transformed, 1.0));');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc; uniform float uHeat; uniform vec2 uC; uniform sampler2D uReflTex; varying vec4 vReflCoord;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dTop = length(vLoc.xz - uC);
        float topZone = smoothstep(${(BH - 0.4).toFixed(2)}, ${BH.toFixed(2)}, vLoc.y);
        // faint temper tint ring (straw -> bronze) around the contact
        float ring = exp(-pow((dTop - 2.3) / 0.9, 2.0)) * topZone * uHeat;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.8, 0.5), ring * 0.55);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.22, 0.03) * uHeat * exp(-dTop * dTop / 1.6) * topZone * 1.4;`)
      .replace('#include <opaque_fragment>', `{
          float isTop = smoothstep(0.85, 0.98, dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz))) * topZone;
          vec2 ruv = vReflCoord.xy / vReflCoord.w;
          vec3 rc = textureLod(uReflTex, ruv, 2.0).rgb * 0.6 + textureLod(uReflTex, ruv, 3.5).rgb * 0.4;
          outgoingLight += rc * diffuseColor.rgb * isTop * 0.55;
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'steelblock';
  const block = new THREE.Mesh(geo, mat);
  block.castShadow = true; block.receiveShadow = true;
  group.add(block);
  const sparks = new Sprites(70, 'spark');
  group.add(sparks.mesh);

  return {
    group, refl, reflectOn: true,
    update(c: Ctx) {
      const t = c.t;
      const o = c.orbLocal;
      uniforms.uC.value.set(o.x, o.z);
      uniforms.uHeat.value = t < 40 ? 0 : 0.25 + 0.55 * smoothstep(40, 95, t);
      for (let k = 0; k < sparks.count; k++) {
        const b = k < 44 ? 40 + rnd(3000 + k) * 4 : 46 + rnd(3000 + k) * 22;
        const age = t - b;
        const life = rr(3010 + k, 5, 13);
        if (age < 0 || age > life) { sparks.a.alpha[k] = 0; continue; }
        const a = rr(3020 + k, 0, Math.PI * 2);
        const sp = rr(3030 + k, 0.5, k < 44 ? 2.4 : 1.2);
        const vy0 = rr(3040 + k, 0.6, 2.2);
        const x0 = o.x + Math.cos(a) * 2.2, z0 = o.z + Math.sin(a) * 2.2, y0 = BH + 0.1;
        let vy = vy0 - G * age;
        let y = y0 + vy0 * age - 0.5 * G * age * age;
        const x = x0 + Math.cos(a) * sp * age, z = z0 + Math.sin(a) * sp * age;
        const onTop = Math.abs(x) < BW / 2 && Math.abs(z) < BD / 2;
        const floor = onTop ? BH : 0;
        if (y < floor) { // bounce once
          const tb = (vy0 + Math.sqrt(vy0 * vy0 + 2 * G * (y0 - floor))) / G;
          const v2 = (vy0 - G * tb) * -0.35;
          const a2 = age - tb;
          y = floor + v2 * a2 - 0.5 * G * a2 * a2;
          vy = v2 - G * a2;
          if (y < floor) y = floor;
        }
        const f = 1 - age / life;
        const I = 6 * f * f;
        sparks.set(k, x, y, z, 0.07, 1, I * 1.0, I * 0.55, I * 0.18, 0, Math.cos(a) * sp * 0.8, vy * 0.8, Math.sin(a) * sp * 0.8);
      }
      sparks.commit(c.time);
      void R_ORB; void clamp;
    },
  };
}
