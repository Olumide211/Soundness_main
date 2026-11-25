# Authored by Grok Bot for the "hello" film pack. Regenerates svg/ and data/. Released CC0.
import json, math, random, os
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(ROOT, 'svg'); D = os.path.join(ROOT, 'data')
OCHRE, RUST, SHADOW = '#E0A458', '#B5652B', '#3A1F12'
rng = random.Random(1337)

def poly_to_path(g):
    geoms = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    out = []
    for p in geoms:
        for ring in [p.exterior] + list(p.interiors):
            c = list(ring.coords)
            out.append('M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in c) + ' Z')
    return ' '.join(out)

def svg(name, w, h, body, extra=''):
    open(os.path.join(S, name), 'w').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{extra}{body}</svg>\n')

# ---------- hand stencil (left hand, palm facing wall, fingers up) ----------
def cap(a, b, r): return LineString([a, b]).buffer(r, resolution=24)
palm = Polygon([(170, 300), (190, 250), (250, 238), (312, 248), (338, 290), (336, 360), (318, 410), (200, 412), (178, 370)]).buffer(18, resolution=24)
fingers = [cap((205, 262), (180, 108), 21), cap((246, 252), (240, 72), 22.5), cap((286, 256), (306, 92), 21), cap((320, 282), (366, 160), 17.5), cap((186, 338), (98, 262), 22)]
wrist = Polygon([(205, 395), (312, 395), (318, 512), (198, 512)])
hand = unary_union([palm, wrist] + fingers).buffer(7, resolution=24).buffer(-7, resolution=24).simplify(0.6)
HAND_D = poly_to_path(hand)
svg('hand_stencil_silhouette.svg', 512, 512, f'<path id="hand" d="{HAND_D}" fill="{SHADOW}"/>')
# negative (sprayed) stencil: ochre spray halo with the hand knocked out + seeded speckles
dots = []
for i in range(1400):
    a = rng.uniform(0, 2 * math.pi); rr = abs(rng.gauss(0, 1)) * 70 + 20
    cx, cy = 256 + math.cos(a) * (150 + rr) * 0.9, 300 + math.sin(a) * (200 + rr) * 0.95
    if not hand.contains(Point(cx, cy)):
        dots.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{rng.uniform(0.6, 2.4):.1f}" fill="{RUST}" opacity="{rng.uniform(0.25, 0.8):.2f}"/>')
defs = (f'<defs><radialGradient id="spray" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="{RUST}" stop-opacity=".95"/>'
        f'<stop offset=".55" stop-color="{RUST}" stop-opacity=".75"/><stop offset="1" stop-color="{RUST}" stop-opacity="0"/></radialGradient>'
        f'<clipPath id="m"><path clip-rule="evenodd" d="M0,0 H512 V512 H0 Z {HAND_D}"/></clipPath></defs>')
svg('hand_stencil_spray.svg', 512, 512, f'<g clip-path="url(#m)"><ellipse cx="256" cy="290" rx="246" ry="250" fill="url(#spray)"/>{"".join(dots)}</g>', defs)

# ---------- three running stick figures ----------
def runner(ox, oy, s, phase):
    k = math.sin(phase)
    P = lambda x, y: f'{ox + x * s:.1f},{oy + y * s:.1f}'
    return (f'<circle cx="{ox + 4 * s:.1f}" cy="{oy - 52 * s:.1f}" r="{7 * s:.1f}"/>'
            f'<path d="M{P(2,-44)} L{P(-4,-8)}"/>'
            f'<path d="M{P(0,-36)} L{P(16+6*k,-26)} L{P(26+4*k,-38)}"/><path d="M{P(0,-36)} L{P(-14-6*k,-24)} L{P(-20,-12)}"/>'
            f'<path d="M{P(-4,-8)} L{P(12+8*k,10)} L{P(8+10*k,30)}"/><path d="M{P(-4,-8)} L{P(-16-6*k,8)} L{P(-30-6*k,14)}"/>')
figs = ''.join(f'<g id="runner-{i+1}">{runner(80 + i * 120, 120 - i * 6, 1.25, i * 1.9)}</g>' for i in range(3))
svg('stick_figures_running.svg', 400, 170, f'<g fill="none" stroke="{RUST}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">{figs}</g>'.replace('<circle', f'<circle fill="{RUST}"'))

# ---------- sun ----------
rays = ''.join(f'<path id="ray-{i+1:02d}" d="M{100+math.cos(i*math.pi/6)*44:.1f},{100+math.sin(i*math.pi/6)*44:.1f} L{100+math.cos(i*math.pi/6+0.05)*(72+(i%2)*10):.1f},{100+math.sin(i*math.pi/6+0.05)*(72+(i%2)*10):.1f}"/>' for i in range(12))
svg('sun.svg', 200, 200, f'<g fill="none" stroke="{OCHRE}" stroke-width="7" stroke-linecap="round"><circle id="disc" cx="100" cy="100" r="30" fill="{OCHRE}"/>{rays}</g>')

# ---------- "hello" primitive scratched strokes (five glyph groups: h e l l o) ----------
prim = [
    ('h', ['M30,40 L36,160', 'M34,105 L62,92 L74,160']),
    ('e', ['M150,128 L104,126', 'M150,128 L136,100 L108,106 L104,150 L146,158']),
    ('l', ['M182,30 L190,160']),
    ('l', ['M226,34 L232,160']),
    ('o', ['M292,96 L318,122 L296,158 L270,126 Z']),
]
paths, order = [], []
for gi, (ch, ds) in enumerate(prim):
    for si, d in enumerate(ds):
        pid = f'g{gi+1}-{ch}-s{si+1}'; order.append(pid)
        paths.append(f'<path id="{pid}" d="{d}"/>')
svg('hello_primitive_strokes.svg', 340, 190, f'<g fill="none" stroke="{RUST}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">{"".join(paths)}</g>')

# ---------- "hello" brush centreline (single continuous cursive path, draw-on with stroke-dashoffset) ----------
BRUSH = ('M40,150 C50,100 70,40 80,25 C88,12 70,10 66,30 C60,70 55,120 52,150 '
         'C60,110 80,85 95,90 C110,95 105,130 108,150 C112,160 130,150 140,130 '
         'C150,115 175,105 170,95 C165,85 140,95 140,120 C140,145 160,155 185,140 '
         'C200,120 215,60 220,35 C225,15 205,15 205,40 C205,80 200,130 210,150 C215,158 230,150 240,135 '
         'C255,115 270,60 275,35 C280,15 260,15 260,40 C260,80 255,130 265,150 C270,158 285,150 295,135 '
         'C300,120 310,95 330,95 C350,95 355,130 335,148 C320,160 300,145 305,125 C310,105 335,95 350,100 C360,103 370,100 380,95')
svg('hello_brush_centerline.svg', 420, 180, f'<path id="hello-brush" d="{BRUSH}" fill="none" stroke="#1b120c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>')

# ---------- gradient avatar ----------
svg('avatar_breezeog.svg', 256, 256,
    '<circle cx="128" cy="128" r="128" fill="url(#a)"/><circle cx="128" cy="128" r="127" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/>',
    '<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset=".55" stop-color="#4C8DFF"/><stop offset="1" stop-color="#E0A458"/></linearGradient></defs>')

# ---------- Morse timing ----------
MORSE = {'H': '....', 'E': '.', 'L': '.-..', 'O': '---'}
UNIT, START = 2, 425  # 2 frames per unit at 30 fps (~18 wpm), key-down starts f425
events, t = [], START
for li, ch in enumerate('HELLO'):
    for si, sym in enumerate(MORSE[ch]):
        dur = UNIT * (1 if sym == '.' else 3)
        events.append({'letter': ch, 'symbol': 'dot' if sym == '.' else 'dash', 'downFrame': t, 'upFrame': t + dur, 'pulseLaunchFrame': t})
        t += dur + (UNIT if si < len(MORSE[ch]) - 1 else 0)
    if li < 4: t += UNIT * 3
json.dump({'fps': 30, 'framesPerUnit': UNIT, 'rules': 'dot=1u, dash=3u, intra-letter gap=1u, letter gap=3u', 'text': 'HELLO',
           'pattern': '.... . .-.. .-.. ---', 'firstDown': START, 'lastUp': t, 'events': events}, open(os.path.join(D, 'morse_hello.json'), 'w'), indent=1)

# ---------- palette ----------
json.dump({'cave': {'ochre': OCHRE, 'rust': RUST, 'shadow': SHADOW, 'fireKey': '#FF9A3C', 'fireCore': '#FFC872'},
           'papyrus': {'parchment': '#E9D8B4', 'parchmentShadow': '#B89A6A', 'ink': '#1B120C', 'key': '#FFE9C4'},
           'press': {'brass': '#C9A15A', 'steel': '#9EA4AA', 'wood': '#5A3A22', 'paper': '#F1E7D2', 'ink': '#121010'},
           'telegraph': {'electric': '#CFE8FF', 'electricDeep': '#4C8DFF', 'copper': '#B87333', 'brass': '#C9A15A', 'bg': '#0B1220'},
           'phone': {'bakelite': '#0D0D0F', 'rim': '#CFE8FF', 'ring': '#CFE8FF', 'bg': '#0A0E16'},
           'post': {'screenBg': '#0B0B0F', 'text': '#FFFFFF', 'muted': '#8A8F98', 'accent': '#7C5CFF', 'like': '#FF4D6D', 'divider': '#1E1F24'},
           'chat': {'bg': '#0B0B0F', 'bubbleUser': '#1C1C22', 'text': '#F4F4F6', 'cursorGlow': '#7C5CFF', 'orbCore': '#FFFFFF', 'orbHalo': '#7C5CFF'},
           'grade': {'blackPoint': '#07060A', 'grain': 0.04, 'vignette': 0.28}}, open(os.path.join(D, 'palette.json'), 'w'), indent=1)
print('morse last up', t, 'strokes', order)
