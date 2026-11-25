uniform float uTime; uniform float uFlick; uniform float uSeed;
varying vec2 vUv;
float fh(vec2 p){ p = fract(p*vec2(127.1, 311.7)); p += dot(p, p+19.19); return fract(p.x*p.y); }
float fn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fh(i),fh(i+vec2(1,0)),f.x), mix(fh(i+vec2(0,1)),fh(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 uv = vUv;
  float n = fn(vec2(uv.x * 4.0 + uSeed, uv.y * 3.0 - uTime * 2.2)) * 0.6 + fn(vec2(uv.x * 9.0 - uSeed, uv.y * 7.0 - uTime * 3.7)) * 0.4;
  float w = 1.0 - abs(uv.x - 0.5) * 2.0;
  float shape = smoothstep(0.0, 0.35, w * (1.0 - uv.y) * 1.4 + n * 0.45 - uv.y * 0.55);
  vec3 c = mix(vec3(0.71, 0.4, 0.17), vec3(1.0, 0.78, 0.45), smoothstep(0.2, 0.9, shape));
  float a = shape * smoothstep(0.0, 0.15, uv.y + 0.05) * uFlick;
  gl_FragColor = vec4(c * a * 3.0, 0.0);
}
