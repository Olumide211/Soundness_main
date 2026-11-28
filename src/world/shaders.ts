// Shared GLSL: sky gradient, haze, hashing
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uDusk;

vec3 skyColor(vec3 dir) {
  dir = normalize(dir);
  float y = dir.y;
  vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  vec3 dH = normalize(vec3(dir.x, 0.0, dir.z) + 1e-5);
  float az = dot(dH, sunH) * 0.5 + 0.5;          // 1 toward the sun, 0 opposite
  float sunAmt = max(dot(dir, uSunDir), 0.0);

  vec3 zenith = mix(vec3(0.06, 0.12, 0.30), vec3(0.02, 0.045, 0.15), uDusk);
  vec3 upper  = mix(vec3(0.20, 0.28, 0.52), vec3(0.08, 0.11, 0.28), uDusk);
  vec3 horWarm = mix(vec3(1.45, 0.66, 0.26), vec3(1.10, 0.42, 0.18), uDusk);
  vec3 horCool = mix(vec3(0.80, 0.56, 0.52), vec3(0.40, 0.30, 0.42), uDusk);
  vec3 horizon = mix(horCool, horWarm, pow(az, 2.2));
  // pink/peach band above the horizon on the sun side
  vec3 band = mix(vec3(0.95, 0.52, 0.48), vec3(0.55, 0.30, 0.42), uDusk);

  float h = max(y, 0.0);
  vec3 col = mix(horizon, band, smoothstep(0.0, 0.10, h) * pow(az, 1.5) * 0.6);
  col = mix(col, upper, smoothstep(0.04, 0.35, h));
  col = mix(col, zenith, smoothstep(0.25, 0.95, h));
  // below the horizon: haze fades into the dark city glow
  if (y < 0.0) {
    vec3 low = mix(horizon * 0.55, vec3(0.10, 0.10, 0.16), uDusk * 0.5);
    col = mix(horizon, low, smoothstep(0.0, 0.25, -y));
  }
  // sun glow (mie-ish)
  col += vec3(1.0, 0.50, 0.20) * pow(sunAmt, 6.0) * 0.55 * (1.0 - 0.35 * uDusk);
  col += vec3(1.0, 0.62, 0.30) * pow(sunAmt, 48.0) * 1.4;
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

uniform float uFogDensity;
vec3 applyHaze(vec3 col, vec3 worldPos) {
  vec3 d = worldPos - cameraPosition;
  float dist = length(d);
  vec3 dir = d / dist;
  // denser near the ground, thinner up high
  float hf = mix(1.0, 0.35, smoothstep(40.0, 420.0, worldPos.y));
  float azs = dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-5), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))) * 0.5 + 0.5;
  float fog = 1.0 - exp(-pow(dist * uFogDensity * hf * mix(0.6, 1.15, azs), 1.35));
  vec3 fogCol = skyColor(vec3(dir.x, max(dir.y, 0.015) * 0.6 + 0.01, dir.z)) * mix(0.62, 0.95, azs);
  return mix(col, fogCol, clamp(fog, 0.0, 0.97));
}
float hazeAmount(vec3 worldPos) {
  vec3 d = worldPos - cameraPosition;
  float dist = length(d);
  float hf = mix(1.0, 0.35, smoothstep(40.0, 420.0, worldPos.y));
  return clamp(1.0 - exp(-pow(dist * uFogDensity * hf, 1.35)), 0.0, 0.97);
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
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normal;
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
  float kind = vInfo.y;     // 0 windowed, 1 plain concrete, 2 glass curtain wall
  float litRatio = vInfo.z;
  float tint = vInfo.w;
  vec3 V = normalize(vWorld - cameraPosition);

  vec3 sunCol = mix(vec3(1.0, 0.62, 0.34) * 1.9, vec3(1.0, 0.45, 0.28) * 0.8, uDusk);
  float ndl = max(dot(n, uSunDir), 0.0);
  // long golden-hour shadows: lower floors sit in the shadow of the city
  float shadowLine = 55.0 + 120.0 * vnoise(vWorld.xz * 0.0035 + seed);
  float sunVis = smoothstep(shadowLine - 35.0, shadowLine + 45.0, vWorld.y);
  vec3 skyAmb = mix(vec3(0.15, 0.19, 0.32), vec3(0.06, 0.08, 0.19), uDusk);
  vec3 bounce = mix(vec3(0.17, 0.10, 0.07), vec3(0.06, 0.045, 0.06), uDusk);
  vec3 amb = mix(bounce, skyAmb, n.y * 0.5 + 0.5);
  float ao = mix(0.35, 1.0, smoothstep(0.0, 70.0, vWorld.y));

  vec3 wallBase;
  if (tint < 0.33) wallBase = vec3(0.23, 0.23, 0.24);
  else if (tint < 0.66) wallBase = vec3(0.32, 0.27, 0.22);
  else wallBase = vec3(0.11, 0.12, 0.15);

  vec3 col;
  if (n.y > 0.5) {
    // roof
    vec2 rp = vWorld.xz;
    float tiles = (1.0 - smoothstep(0.0, 0.02, min(fract(rp.x / 1.5), fract(rp.y / 1.5)))) * 0.25;
    float stain = fbm(rp * 0.15 + seed) * 0.6 + 0.4 * fbm(rp * 1.3);
    vec3 roof = vec3(0.30, 0.29, 0.28) * (0.7 + 0.45 * stain) * (1.0 - tiles);
    col = roof * (amb * 1.1 + sunCol * ndl * sunVis);
  } else if (n.y < -0.5) {
    col = wallBase * amb * 0.3;
  } else {
    vec2 fc = abs(n.x) > 0.5 ? vec2(vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y);
    // facade grid
    float cw = kind > 1.5 ? 3.2 : 4.2 + floor(hash12(vec2(seed, 3.1)) * 3.0) * 0.6;
    float fh = kind > 1.5 ? 4.2 : 5.6 + hash12(vec2(seed, 7.7)) * 1.2;
    vec2 g = fc / vec2(cw, fh);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    vec2 px = fwidth(g);
    float fade = smoothstep(0.10, 0.38, max(px.x, px.y));
    float wx0 = kind > 1.5 ? 0.06 : 0.16;
    float wy0 = kind > 1.5 ? 0.10 : 0.24;
    vec2 e = px * 0.75 + 0.001;
    float win = smoothstep(wx0 - e.x, wx0 + e.x, f.x) * (1.0 - smoothstep(1.0 - wx0 - e.x, 1.0 - wx0 + e.x, f.x))
              * smoothstep(wy0 - e.y, wy0 + e.y, f.y) * (1.0 - smoothstep(0.9 - e.y, 0.9 + e.y, f.y));
    // window lighting
    float faceId = n.x > 0.5 ? 1.0 : n.x < -0.5 ? 2.0 : n.z > 0.5 ? 3.0 : 4.0;
    float hl = hash12(cell + vec2(seed * 13.1 + faceId * 7.0, seed * 3.7));
    float floorOff = step(hash12(vec2(cell.y + faceId, seed * 5.3)), 0.18);
    float lr = litRatio * mix(0.16, 0.7, uDusk) * (1.0 - floorOff) * smoothstep(1.0, 8.0, vWorld.y);
    float lit = step(hl, lr);
    float hc = hash12(cell * 1.7 + seed);
    vec3 warm = mix(vec3(1.0, 0.66, 0.36), vec3(1.0, 0.80, 0.55), hc);
    vec3 cool = vec3(0.72, 0.86, 1.0);
    vec3 lampCol = (hc > 0.82 ? cool : warm) * (0.7 + 1.6 * hash12(cell + 9.1 + seed)) * mix(0.8, 1.3, uDusk);
    // glass reflection
    vec3 R = reflect(V, n);
    float fres = 0.06 + 0.94 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
    vec3 glass = skyColor(vec3(R.x, abs(R.y) * 0.8 + 0.02, R.z)) * (kind > 1.5 ? 0.26 : 0.18) * (0.3 + 0.7 * fres);
    glass += vec3(0.010, 0.014, 0.022);
    glass += sunCol * pow(max(dot(R, uSunDir), 0.0), 80.0) * 2.0 * sunVis;
    vec3 winCol = mix(glass, lampCol, lit);
    float avgLit = lr * 2.6;
    vec3 avgWin = mix(glass, warm * 1.1 * mix(0.8, 1.3, uDusk), clamp(lr * 0.9, 0.0, 1.0));
    // wall
    float grime = 0.85 + 0.3 * vnoise(vec2(fc.x * 0.05, fc.y * 0.4) + seed);
    vec3 wall = wallBase * grime * (amb + sunCol * ndl * sunVis * 0.9) * ao;
    if (kind > 0.5 && kind < 1.5) {
      // plain concrete (parapets, rooftop units, landmark crowns)
      col = wall;
    } else {
      float winFrac = kind > 1.5 ? 0.78 : 0.5;
      vec3 detailed = mix(wall, winCol, win);
      vec3 averaged = mix(wall, avgWin, winFrac);
      col = mix(detailed, averaged, fade);
      // warm sun sheen on glass towers
      if (kind > 1.5) col += sunCol * ndl * sunVis * 0.06;
    }
    // top edge highlight
    float top = smoothstep(vSize.y - 1.2, vSize.y, vLocal.y);
    col += sunCol * 0.05 * top * ndl;
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
  gl_Position.z = gl_Position.w; // at the far plane
}
`;

export const SKY_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
uniform float uSunDisk;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyColor(d);
  float s = dot(d, uSunDir);
  float disk = smoothstep(0.99955, 0.99975, s);
  // squash sun disk near horizon + fade below
  col += vec3(1.0, 0.72, 0.42) * disk * 26.0 * uSunDisk * smoothstep(-0.01, 0.004, d.y);
  // gentle dithering
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
  vec2 p = vUv * vec2(5.0, 1.6) + vec2(uSeed * 3.1 + uTime * 0.004, uSeed);
  float n = fbm(p) * 0.7 + fbm(p * 2.7 + 4.0) * 0.3;
  vec2 c = (vUv - 0.5) * vec2(2.0, 2.0);
  float mask = 1.0 - smoothstep(0.35, 1.0, length(c * vec2(1.0, 1.1)));
  // flatter bottoms
  mask *= smoothstep(0.0, 0.25, vUv.y);
  float a = smoothstep(0.42, 0.78, n * mask + mask * 0.25) * uOpacity;
  vec3 dir = normalize(vWorld - cameraPosition);
  float toSun = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0);
  vec3 lit = mix(vec3(1.25, 0.62, 0.40), vec3(0.95, 0.42, 0.38), uDusk);
  vec3 shade = mix(vec3(0.38, 0.32, 0.45), vec3(0.16, 0.15, 0.27), uDusk);
  float edge = smoothstep(0.55, 0.95, n) ;
  vec3 col = mix(shade, lit, clamp(vUv.y * 0.6 + toSun * 0.7 - edge * 0.25, 0.0, 1.0));
  col += vec3(1.0, 0.6, 0.3) * pow(max(dot(dir, uSunDir), 0.0), 20.0) * 1.5 * (1.0 - a);
  vec3 sky = skyColor(dir);
  col = mix(col, sky, 0.35);
  gl_FragColor = vec4(col, a);
}
`;

export const GROUND_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  vec2 st = abs(fract((p - 21.0) / 42.0 + 0.5) - 0.5) * 42.0; // distance to street center
  float street = 1.0 - smoothstep(4.0, 7.0, min(st.x, st.y));
  vec3 col = vec3(0.025, 0.026, 0.03);
  vec3 lamp = vec3(1.0, 0.55, 0.25);
  float lamps = street * (0.35 + 0.65 * smoothstep(0.6, 1.0, vnoise(p * 0.08)));
  col += lamp * lamps * mix(0.25, 0.6, uDusk);
  col = applyHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
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

export const CAR_VERT = /* glsl */ `
attribute vec4 aLane;   // x0, z0, axis (0 = along x, 1 = along z), direction (+1/-1)
attribute vec3 aCar;    // phase, speed, kind (0 tail red, 1 head white)
uniform float uTime;
varying vec3 vWorld;
varying vec2 vUv;
varying float vKind;
void main() {
  float L = 3400.0;
  float along = mod(aCar.x + aCar.y * uTime * aLane.w, L) - L * 0.5;
  vec3 base = aLane.z < 0.5 ? vec3(along, 0.7, aLane.y) : vec3(aLane.x, 0.7, along);
  vec3 ax = aLane.z < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 side = aLane.z < 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  float len = 14.0;
  vec3 p = base + ax * position.x * len * aLane.w + side * position.y * 0.9;
  vUv = uv;
  vKind = aCar.z;
  vec4 wp = vec4(p, 1.0);
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CAR_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vWorld;
varying vec2 vUv;
varying float vKind;
void main() {
  // streak: bright head fading tail
  float t = vUv.x;
  float a = pow(t, 2.2) * (1.0 - smoothstep(0.9, 1.0, t)) + smoothstep(0.88, 1.0, t) * (1.0 - smoothstep(0.98, 1.0, t)) * 1.5;
  float w = 1.0 - abs(vUv.y - 0.5) * 2.0;
  a *= smoothstep(0.0, 0.6, w);
  vec3 col = vKind > 0.5 ? vec3(1.0, 0.86, 0.62) * 4.0 : vec3(1.0, 0.12, 0.06) * 3.5;
  float h = hazeAmount(vWorld);
  gl_FragColor = vec4(col * a * (1.0 - h * 0.9), 1.0);
}
`;
