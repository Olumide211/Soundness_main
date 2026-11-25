// injected after <emissivemap_fragment> in the smartphone screen material
{
  vec2 pt = vec2(vScrUv.x * 390.0, (1.0 - vScrUv.y) * 844.0);
  // rounded screen corners (9 mm ~ 51 pt)
  vec2 q = abs(pt - vec2(195.0, 422.0)) - vec2(195.0, 422.0) + 51.0;
  float sdScr = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 51.0;
  if (sdScr > 0.0) discard;
  // ragged rock-edge reveal (1040-1110): visible where mask < 0
  if (uRagAmp > 0.0 || uRagHalf < 900.0) {
    vec2 rq = abs(pt - uRagCentre) - vec2(uRagHalf) + 40.0;
    float sd = length(max(rq, 0.0)) + min(max(rq.x, rq.y), 0.0) - 40.0;
    float n = rfbm(vScrUv * 6.0 * vec2(1.0, 2.16)) - 0.5;
    float mask = sd + n * uRagAmp;
    if (mask > 0.0) discard;
  }
  float lcd = 1.0 - uLcd * 0.04 * step(0.5, fract(vScrUv.y * 1080.0));
  totalEmissiveRadiance *= uPower * lcd;
}
