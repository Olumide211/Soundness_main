// Shared GLSL for the dusk city: sky gradient, far haze, hashing.
export const RIVER = { z0: 1150, amp: 320, len: 1500, phase: 0.8, width: 380 };
export const riverZ = (x: number) => RIVER.z0 + RIVER.amp * Math.sin(x / RIVER.len + RIVER.phase);

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uDusk;

vec3 skyColor(vec3 dir) {
  dir = normalize(dir);
  float y = dir.y;
  vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  vec3 dH = normalize(vec3(dir.x, 0.0, dir.z) + 1e-5);
  float az = dot(dH, sunH) * 0.5 + 0.5;          // 1 toward the sun, 0 opposite
  float h = max(y, 0.0);
  vec3 zenith  = mix(vec3(0.030, 0.034, 0.115), vec3(0.016, 0.018, 0.070), uDusk);
  vec3 upper   = mix(vec3(0.090, 0.068, 0.215), vec3(0.050, 0.038, 0.140), uDusk);
  vec3 lowAway = mix(vec3(0.200, 0.105, 0.215), vec3(0.120, 0.065, 0.160), uDusk);
  vec3 lowSun  = mix(vec3(1.550, 0.560, 0.160), vec3(1.250, 0.380, 0.120), uDusk);
  vec3 low = mix(lowAway, lowSun, pow(az, 3.0));
  float bandH = mix(0.05, 0.15, pow(az, 2.0));
  vec3 col = mix(low, upper, smoothstep(0.0, bandH * 2.2, h));
  col = mix(col, zenith, smoothstep(0.2, 0.85, h));
  // thin rose layer between the orange band and the violet
  col += vec3(0.32, 0.08, 0.16) * exp(-pow((h - bandH * 1.15) / (bandH * 0.7), 2.0)) * pow(az, 2.0) * 0.55;
  // glow of the sun that has just set
  vec3 sd = normalize(uSunDir + vec3(0.0, 0.02, 0.0));
  float sunAmt = max(dot(normalize(vec3(dir.x, h, dir.z)), sd), 0.0);
  col += vec3(1.0, 0.46, 0.13) * pow(sunAmt, 16.0) * 1.7 * (1.0 - smoothstep(0.0, 0.14, h));
  col += vec3(1.0, 0.52, 0.22) * pow(sunAmt, 4.0) * 0.18;
  if (y < 0.0) {
    vec3 below = mix(vec3(0.030, 0.026, 0.050), low * 0.3, 0.5);
    col = mix(low, below, smoothstep(0.0, 0.05, -y));
  }
  return col;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}

// light atmospheric haze, only in the far distance
uniform float uFogDensity;
float hazeAmount(vec3 wp) {
  float dist = length(wp - cameraPosition);
  float d = max(dist - 1800.0, 0.0);
  float hf = mix(1.0, 0.55, smoothstep(0.0, 1200.0, wp.y));
  return clamp(1.0 - exp(-d * uFogDensity * hf), 0.0, 0.9);
}
vec3 applyHaze(vec3 col, vec3 wp) {
  vec3 dir = normalize(wp - cameraPosition);
  vec3 fc = skyColor(vec3(dir.x, 0.012, dir.z)) * 0.5;
  return mix(col, fc, hazeAmount(wp));
}
`;

export const BUILDING_VERT = /* glsl */ `
attribute vec3 aSize;
attribute vec4 aInfo; // seed, kind, litRatio, tint
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vLocal;
varying vec4 vInfo;
varying vec3 vSize;
void main() {
  vec3 p = position;
  vLocal = vec3(p.x * aSize.x, p.y * aSize.y, p.z * aSize.z);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(m) * normal);
  vInfo = aInfo;
  vSize = aSize;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const BUILDING_FRAG = /* glsl */ `
${SKY_GLSL}
uniform float uTime;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vLocal;
varying vec4 vInfo;
varying vec3 vSize;

void main() {
  vec3 n = normalize(vN);
  float seed = vInfo.x;
  float kind = vInfo.y;     // 0 windowed, 1 plain, 2 glass curtain wall
  float litRatio = vInfo.z;
  float tint = vInfo.w;
  vec3 V = normalize(vWorld - cameraPosition);
  vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));

  // dusk light: violet sky ambient + a faint warm bounce on faces toward the afterglow
  vec3 skyAmb = vec3(0.050, 0.045, 0.110) * (0.55 + 0.45 * max(n.y, 0.0));
  float toGlow = max(dot(n, sunH), 0.0);
  vec3 glow = vec3(0.30, 0.11, 0.04) * toGlow * smoothstep(60.0, 900.0, vWorld.y);
  vec3 wallBase = mix(vec3(0.030, 0.031, 0.042), vec3(0.055, 0.048, 0.050), tint);
  float ao = mix(0.45, 1.0, smoothstep(0.0, 120.0, vWorld.y));

  vec3 col;
  if (n.y > 0.5) {
    float st = fbm(vWorld.xz * 0.05 + seed) * 0.6 + 0.4;
    col = wallBase * 0.9 * st * (skyAmb * 2.0 + glow * 0.5);
  } else if (n.y < -0.5) {
    col = wallBase * 0.1;
  } else {
    vec2 fc = abs(n.x) > abs(n.z) ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
    float cw = kind > 1.5 ? 8.5 : 11.0 + floor(hash12(vec2(seed, 3.1)) * 3.0) * 1.5;
    float fh = kind > 1.5 ? 14.0 : 15.0 + hash12(vec2(seed, 7.7)) * 2.0;
    vec2 g = fc / vec2(cw, fh);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    vec2 px = fwidth(g);
    float fade = smoothstep(0.12, 0.42, max(px.x, px.y));
    float wx0 = kind > 1.5 ? 0.07 : 0.18;
    float wy0 = kind > 1.5 ? 0.12 : 0.24;
    vec2 e = px * 0.75 + 0.001;
    float win = smoothstep(wx0 - e.x, wx0 + e.x, f.x) * (1.0 - smoothstep(1.0 - wx0 - e.x, 1.0 - wx0 + e.x, f.x))
              * smoothstep(wy0 - e.y, wy0 + e.y, f.y) * (1.0 - smoothstep(0.9 - e.y, 0.9 + e.y, f.y));
    float faceId = n.x > 0.5 ? 1.0 : n.x < -0.5 ? 2.0 : n.z > 0.5 ? 3.0 : 4.0;
    vec2 cid = cell + vec2(seed * 13.1 + faceId * 7.0, seed * 3.7);
    float hl = hash12(cid);
    float floorOff = step(hash12(vec2(cell.y + faceId, seed * 5.3)), 0.12);
    float lr = litRatio * (1.0 - floorOff) * smoothstep(4.0, 16.0, vWorld.y);
    float lit = step(hl, lr);
    // random flicker off
    float flick = step(0.965, hash12(cid * 1.31 + floor(uTime * 3.0) * 1.7));
    lit *= 1.0 - flick;
    float hc = hash12(cid * 1.7 + 0.3);
    vec3 warm = mix(vec3(1.0, 0.52, 0.20), vec3(1.0, 0.70, 0.40), hash12(cid + 2.0));
    vec3 cool = vec3(0.55, 0.72, 1.0);
    vec3 lampCol = (hc > 0.8 ? cool : warm) * (0.9 + 1.25 * hash12(cid + 9.1)) * (0.7 + 0.3 * f.y);
    vec3 R = reflect(V, n);
    float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
    vec3 glass = skyColor(vec3(R.x, abs(R.y) * 0.8 + 0.02, R.z)) * (kind > 1.5 ? 0.12 : 0.08) * (0.4 + 0.6 * fres) + vec3(0.004, 0.005, 0.009);
    vec3 winCol = mix(glass, lampCol, lit);
    vec3 avgWarm = mix(vec3(1.0, 0.62, 0.34), vec3(0.62, 0.78, 1.0), 0.28) * 1.6;
    float winFrac = kind > 1.5 ? 0.75 : 0.48;
    vec3 avgWin = glass + avgWarm * lr * 0.9;
    float grime = 0.85 + 0.3 * vnoise(vec2(fc.x * 0.05, fc.y * 0.2) + seed);
    vec3 wall = wallBase * grime * (skyAmb + glow) * 4.0 * ao;
    if (kind > 0.5 && kind < 1.5) {
      col = wall;
    } else {
      vec3 detailed = mix(wall, winCol, win);
      vec3 averaged = mix(wall, avgWin, winFrac);
      col = mix(detailed, averaged, fade);
    }
    // thin warm edge on the tallest silhouettes
    col += vec3(0.5, 0.2, 0.07) * toGlow * smoothstep(vSize.y - 6.0, vSize.y, vLocal.y) * smoothstep(400.0, 1100.0, vWorld.y);
  }
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;
}
`;

export const SKY_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyColor(d);
  // a few early stars high up, away from the afterglow
  vec2 sp = d.xz / max(d.y, 0.05) * 140.0;
  float star = step(0.9984, hash12(floor(sp))) * smoothstep(0.3, 0.65, d.y);
  col += vec3(0.9, 0.9, 1.0) * star * 0.6;
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CLOUD_FRAG = /* glsl */ `
${SKY_GLSL}
uniform float uSeed;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 p = vUv * vec2(6.0, 1.4) + vec2(uSeed * 3.1 + uTime * 0.004, uSeed);
  float n = fbm(p) * 0.7 + fbm(p * 2.7 + 4.0) * 0.3;
  vec2 c = (vUv - 0.5) * 2.0;
  float mask = 1.0 - smoothstep(0.3, 1.0, length(c * vec2(1.0, 1.2)));
  float a = smoothstep(0.45, 0.8, n * mask + mask * 0.22) * uOpacity;
  vec3 dir = normalize(vWorld - cameraPosition);
  float toSun = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 4.0);
  // lit from below by the afterglow, violet on top
  vec3 lit = vec3(1.25, 0.42, 0.20);
  vec3 shade = vec3(0.075, 0.055, 0.12);
  vec3 col = mix(shade, lit, clamp((1.0 - vUv.y) * 0.9 * toSun + toSun * 0.25, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}
`;

export const SIMPLE_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const GROUND_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  vec2 st = abs(fract((p - 100.0) / 200.0 + 0.5) - 0.5) * 200.0; // distance to street centerline
  float d = min(st.x, st.y);
  float street = 1.0 - smoothstep(10.0, 22.0, d);
  vec3 col = vec3(0.010, 0.010, 0.014);
  float lamps = street * (0.5 + 0.5 * smoothstep(0.55, 0.95, vnoise(p * 0.03)));
  col += vec3(0.07, 0.033, 0.011) * lamps;
  // sidewalk lamp pools
  float pole = (1.0 - smoothstep(0.0, 6.0, abs(d - 21.0))) * step(0.6, fract(dot(p, vec2(0.0125, 0.0125))));
  col += vec3(0.35, 0.17, 0.06) * pole * 0.4;
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const RIVER_FRAG = /* glsl */ `
${SKY_GLSL}
uniform float uTime;
varying vec3 vWorld;
void main() {
  float rz = ${RIVER.z0.toFixed(1)} + ${RIVER.amp.toFixed(1)} * sin(vWorld.x / ${RIVER.len.toFixed(1)} + ${RIVER.phase.toFixed(2)});
  float dz = vWorld.z - rz;
  float hw = ${(RIVER.width / 2).toFixed(1)};
  if (abs(dz) > hw) discard;
  vec3 V = normalize(vWorld - cameraPosition);
  vec2 p = vWorld.xz * 0.02;
  float n1 = fbm(p * vec2(1.0, 3.0) + vec2(uTime * 0.05, 0.0));
  float n2 = fbm(p * vec2(2.5, 6.0) - vec2(0.0, uTime * 0.08));
  vec3 nn = normalize(vec3((n1 - 0.5) * 0.10, 1.0, (n2 - 0.5) * 0.22));
  vec3 R = reflect(V, nn);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, nn), 0.0), 5.0);
  vec3 refl = skyColor(vec3(R.x, max(R.y, 0.0), R.z));
  vec3 col = vec3(0.004, 0.006, 0.012) + refl * mix(0.45, 1.0, fres);
  // broken reflections of the city lights
  float fl = smoothstep(0.78, 0.95, fbm(vec2(vWorld.x * 0.045, vWorld.z * 0.004) + uTime * 0.03));
  col += vec3(1.0, 0.66, 0.36) * fl * 1.1 * smoothstep(hw, hw * 0.55, abs(dz));
  col *= 0.35 + 0.65 * smoothstep(hw, hw - 18.0, abs(dz));
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const CAR_VERT = /* glsl */ `
attribute vec4 aLane;   // street coordinate x0, z0, axis (0 = along x, 1 = along z), direction
attribute vec4 aCar;    // phase, speed, kind (0 tail red, 1 head white), trail index
uniform float uTime;
varying float vA;
varying float vKind;
varying vec3 vWorld;
void main() {
  float L = 22000.0;
  float along = mod(aCar.x + aCar.y * uTime * aLane.w - aCar.w * 3.0 * aLane.w, L) - L * 0.5;
  vec3 p = aLane.z < 0.5 ? vec3(along, 2.2, aLane.y) : vec3(aLane.x, 2.2, along);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 1.0);
  gl_PointSize = clamp(3200.0 / dist, 1.3, 5.5) * (1.0 - aCar.w * 0.11);
  vA = 1.0 - aCar.w / 6.0;
  vKind = aCar.z;
  vWorld = p;
}
`;

export const CAR_FRAG = /* glsl */ `
${SKY_GLSL}
varying float vA;
varying float vKind;
varying vec3 vWorld;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.08, length(c)) * vA;
  vec3 col = vKind > 0.5 ? vec3(1.0, 0.86, 0.62) * 5.0 : vec3(1.0, 0.11, 0.05) * 4.5;
  float h = hazeAmount(vWorld);
  gl_FragColor = vec4(col * a * (1.0 - h * 0.85), 1.0);
}
`;
