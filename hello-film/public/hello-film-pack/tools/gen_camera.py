# Generates data/camera_keyframes.json and data/stations.json. CC0.
# World units = metres. Y up. Stations sit on a ring of radius R around the origin, each facing OUTWARD
# (station normal n = (sin t, 0, cos t)). The camera lives outside the ring looking in, so a closed spline
# around the ring brings it back to frame 0 exactly.
import json, math, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 3.0
ST = {  # id: angleDeg, centreHeight, label
 'cave': (0, 1.20, 'cave wall patch 2.4x2.4 m'),
 'papyrus': (50, 0.90, 'papyrus sheet 0.42x0.30 m on a lectern tilted 55deg'),
 'press': (100, 0.95, 'press bed 0.50x0.36 m, platen above'),
 'telegraph': (150, 0.85, 'brass key, base 0.15 m long'),
 'phone': (200, 0.88, 'rotary phone, 0.22 m wide'),
 'smartphone': (250, 1.10, 'smartphone 0.0715x0.147 m, 15deg tilt'),
}
def station(a, h):
    t = math.radians(a); n = (math.sin(t), 0, math.cos(t))
    return [R * n[0], h, R * n[2]], n
def cam(a, h, d, lift=0.0, side=0.0, tgt_off=(0, 0, 0)):
    c, n = station(a, h)
    t = math.radians(a); tang = (math.cos(t), 0, -math.sin(t))
    pos = [c[0] + n[0] * d + tang[0] * side, c[1] + lift, c[2] + n[2] * d + tang[2] * side]
    tgt = [c[0] + tang[0] * tgt_off[0], c[1] + tgt_off[1], c[2] + tang[2] * tgt_off[0]]
    return [round(v, 4) for v in pos], [round(v, 4) for v in tgt]
K = []
def k(f, name, a, h, d, fov, lift=0.0, side=0.0, tgt_off=(0, 0, 0), ease='inOutSine', note=''):
    p, t = cam(a, h, d, lift, side, tgt_off)
    dist = math.dist(p, t)
    K.append({'frame': f, 'beat': name, 'position': p, 'target': t, 'fovDeg': fov, 'focusDistance': round(dist, 3),
              'aperture_fstop_equiv': None, 'ease': ease, 'note': note})
# frame, beat, angle, height, distance, fov, lift, side, target offset (along tangent, up)
k(0,    'cave_open',        0,   1.20, 2.60, 35, 0.05, 0.00, (0.00, 0.00), note='== frame 1200. strokes + stencil framed, fire glow from below-left')
k(60,   'cave_dolly',       0,   1.20, 2.40, 35, 0.04, 0.05, (0.10, -0.10))
k(100,  'cave_lift',        0,   1.20, 2.20, 34, 0.03, 0.10, (0.18, -0.20), note='pigment begins to lift')
k(135,  'transit_c_p',      25,  1.05, 1.80, 33, 0.20, 0.00, (0.00, 0.00), ease='inOutCubic', note='dust stream rides the carrier')
k(150,  'papyrus_settle',   50,  0.90, 1.05, 32, 0.38, 0.00, (0.00, 0.00))
k(220,  'papyrus_drift',    50,  0.90, 0.92, 32, 0.34, 0.10, (0.08, 0.00), note='lateral drift across the sheet')
k(255,  'transit_p_pr',     75,  0.95, 1.50, 31, 0.40, 0.00, (0.00, 0.00), ease='inOutCubic')
k(270,  'press_reveal',     100, 0.95, 1.70, 30, 0.45, 0.00, (0.00, 0.00))
k(318,  'press_lever',      100, 0.95, 1.55, 30, 0.40, -0.10, (0.00, 0.05))
k(330,  'press_IMPACT',     100, 0.95, 1.50, 30, 0.40, -0.10, (0.00, 0.05), note='3-frame shake amp 0.004 m, decays')
k(372,  'press_page',       100, 0.95, 1.10, 29, 0.55, 0.00, (0.00, -0.05), note='looking down on printed page')
k(405,  'transit_pr_t',     125, 0.90, 0.95, 29, 0.20, 0.00, (0.00, 0.00), ease='inOutCubic', note='follow the copper wire')
k(420,  'telegraph_key',    150, 0.85, 0.62, 28, 0.12, 0.05, (0.00, 0.00))
k(522,  'telegraph_last',   150, 0.85, 0.55, 28, 0.10, 0.08, (0.03, 0.00), note='last pulse launches')
k(555,  'transit_t_ph',     175, 0.86, 0.95, 29, 0.18, 0.00, (0.00, 0.00), ease='inOutCubic', note='wire coils into cord')
k(570,  'phone_reveal',     200, 0.88, 0.85, 30, 0.16, 0.00, (0.00, 0.00))
k(672,  'phone_rings',      200, 0.88, 0.72, 30, 0.14, 0.04, (0.00, 0.02))
k(705,  'transit_ph_s',     225, 1.00, 0.75, 30, 0.08, 0.00, (0.00, 0.00), ease='inOutCubic', note='rings flatten into rounded rects')
k(720,  'smartphone_float', 250, 1.10, 0.48, 30, 0.02, 0.00, (0.00, 0.00))
k(828,  'smartphone_pre',   250, 1.10, 0.40, 30, 0.01, 0.00, (0.00, 0.00))
k(860,  'chat_inside',      262, 1.10, 0.17, 30, 0.00, 0.00, (0.00, 0.00), ease='inOutCubic', note='screen fills >100% of frame; phone becomes carrier-parented from here')
k(1020, 'chat_orb_full',    300, 1.12, 0.17, 30, 0.00, 0.00, (0.00, 0.00), note='phone+camera travel together; background is black')
k(1110, 'pullback',         345, 1.18, 1.50, 33, 0.03, 0.00, (0.00, 0.00), ease='inOutCubic', note='screen edge dissolves into rock edge')
k(1170, 'cave_settle',      356, 1.20, 2.52, 35, 0.05, 0.00, (0.00, 0.00))
k(1200, 'loop_close',       360, 1.20, 2.60, 35, 0.05, 0.00, (0.00, 0.00), note='MUST equal frame 0')
# make frame 1200 bit-identical to frame 0
K[-1]['position'] = K[0]['position']; K[-1]['target'] = K[0]['target']
stations = {s: {'angleDeg': a, 'centre': station(a, h)[0], 'normal': [round(x, 4) for x in station(a, h)[1]], 'what': w} for s, (a, h, w) in ST.items()}
for s in stations.values(): s['centre'] = [round(v, 4) for v in s['centre']]
json.dump({'units': 'metres', 'ringRadius': R, 'fps': 30, 'durationFrames': 1200,
           'interpolation': 'position & target: centripetal Catmull-Rom (alpha 0.5) through keyframes, CLOSED; time->segment via the ease per segment; fov & focus: monotone cubic (Fritsch-Carlson) over frame',
           'keyframes': K}, open(os.path.join(ROOT, 'data', 'camera_keyframes.json'), 'w'), indent=1)
json.dump(stations, open(os.path.join(ROOT, 'data', 'stations.json'), 'w'), indent=1)
for x in K: print(x['frame'], x['beat'], x['position'], x['target'], x['fovDeg'], x['focusDistance'])
