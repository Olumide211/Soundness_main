export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash12(i), b = hash12(i+vec2(1.,0.)), c = hash12(i+vec2(0.,1.)), d = hash12(i+vec2(1.,1.));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float vnoise3(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  float n000 = hash13(i), n100 = hash13(i+vec3(1,0,0)), n010 = hash13(i+vec3(0,1,0)), n110 = hash13(i+vec3(1,1,0));
  float n001 = hash13(i+vec3(0,0,1)), n101 = hash13(i+vec3(1,0,1)), n011 = hash13(i+vec3(0,1,1)), n111 = hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y), mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<4;i++){ s += a*vnoise2(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for(int i=0;i<4;i++){ s += a*vnoise3(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.9375; }
`;
