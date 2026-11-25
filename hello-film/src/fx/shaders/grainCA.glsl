uniform float uFrame;
uniform float uGrain;
uniform float uExposure;
uniform float uScreenMix;
uniform float uCA;
uniform float uVignette;
uniform vec2 uRes;

vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 acesFilmic(vec3 color){
  const mat3 ACESInputMat = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
  color *= 1.0/0.6;
  color = ACESInputMat*color; color = RRTAndODTFit(color); color = ACESOutputMat*color;
  return clamp(color, 0.0, 1.0);
}
vec3 grade(vec3 c){
  c *= uExposure;
  vec3 t = acesFilmic(c);
  return mix(t, clamp(c, 0.0, 1.0), uScreenMix);
}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 d = uv - 0.5;
  float r = length(d * vec2(uRes.x/uRes.y, 1.0));
  // radial CA: 0 at centre, uCA px at the corners
  float rc = length(d) / 0.7071;
  vec2 off = normalize(d + 1e-6) * (uCA * rc * rc) / uRes;
  vec3 c;
  c.r = texture2D(inputBuffer, uv + off).r;
  c.g = inputColor.g;
  c.b = texture2D(inputBuffer, uv - off).b;
  vec3 col = grade(c);
  // vignette 0.28, smooth
  float vig = 1.0 - uVignette * smoothstep(0.25, 1.05, r * 1.25);
  col *= vig;
  // luminance-weighted grain (strongest in the mids), frame-seeded
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float w = 4.0 * L * (1.0 - L);
  vec2 px = floor(uv * uRes);
  float n = h12(px + vec2(uFrame * 17.0, uFrame * 31.0)) + h12(px * 1.37 + uFrame * 7.0) - 1.0;
  col += uGrain * 0.04 * w * n;
  outputColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}