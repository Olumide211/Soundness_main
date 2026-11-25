# Writes reference/storyboard_XX_*.md from data/camera_keyframes.json + per-era notes. CC0.
import json, math, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = json.load(open(os.path.join(ROOT, 'data', 'camera_keyframes.json')))['keyframes']
def mm(fov): return round(12 / math.tan(math.radians(fov / 2)), 1)
ERAS = [
 ('01_cave', 'Cave', 0, 120, 'bokehScale 2.0 (deep focus, wall fully readable)', [
  ('0', 'Open. Firelit rock wall fills frame. Spray hand stencil upper-left of the painted patch, three runners centre, sun upper-right, primitive "hello" strokes lower-right. Embers (60 instanced quads) drift up through bottom third.'),
  ('0-100', 'Slow dolly in toward the strokes (keys 0/60/100). Fire flicker drives light intensity + 2 cm position jitter (periodic, see PROMPT).'),
  ('40-70', 'Wet-ochre highlight sweeps across the hand stencil (roughness dips 0.85 -> 0.55 in a 0.25 m band moving left->right).'),
  ('100-118', 'Pigment lifts: 4,000 particles spawn at pigment texels (40% strokes, 30% hand, 20% runners, 10% sun); wall pigment alpha decays per-texel at the moment its particle leaves (noise-staggered, strokes first).'),
  ('118-135', 'Particles curl-drift (analytic, stateless) then stream along the carrier path toward the papyrus station.'),
 ], 'Fire key PointLight #FF9A3C 40 cd at wall-local (-0.9,-0.85,0.9) i.e. below-left & in front; fill PointLight #FFC872 12 cd at (0.7,-0.9,0.8); Hemisphere sky #3A1F12 / ground #000000 0.08; envMapIntensity 0.05; FogExp2 #0A0604 density 0.12; exposure 1.0 (ACES).'),
 ('02_papyrus', 'Papyrus', 120, 240, 'bokehScale 3.5 (sheet sharp, lectern edges soft)', [
  ('120-150', 'Dust stream arrives; particles flatten into alternating horizontal/vertical strips (papyrus is two crossed fibre layers). Each landing point grows the sheet reveal mask radially (r 0->18 mm over 6 f).'),
  ('150-165', 'Sheet complete; right hand (generic-hand_right.glb, pen-grip pose) enters from right holding a reed brush (spec in PROMPT).'),
  ('165-215', 'Brush writes svg/hello_brush_centerline.svg: tip follows path arc-length u = easeInOutSine((f-165)/50). Ink ribbon width 2.2 mm modulated by pressure 0.6 + 0.4*sin(u*pi*7). Wet sheen fades 10 f after each segment.'),
  ('205-220', 'Hieroglyph hand U+130A7 (Noto Sans Egyptian Hieroglyphs) inks in beside the word, 14 mm tall - the hand motif.'),
  ('220-240', 'Camera lateral drift; hand + brush exit right. Light warms to parchment.'),
 ], 'Key RectAreaLight #FFE9C4 intensity 6, 0.8x0.5 m, 0.7 m above-left at 45 deg; fill PointLight #E0A458 3 cd low-right; HDRI studio_small_09 envMapIntensity 0.25; background #120C08; fire key fades 1.0->0.15 over 100-150.'),
 ('03_press', 'Printing press', 240, 390, 'bokehScale 3.0; focus pulls from type (f270) to page (f372)', [
  ('225-255', 'Each letter of the ink stroke extrudes up (depth 0->24 mm) and its outline morphs into a sort (type block) footprint - identical vertex counts via resampled outlines.'),
  ('255-290', 'Five sorts fly into the chase, mirrored, spelling HELLO reversed; 4 f stagger; each lands with a 2-frame settle (overshoot 1.5 mm).'),
  ('290-318', 'Ink brayer rolls across the type (ink sheen appears on faces).'),
  ('300-330', 'Left hand grips the lever, pulls; platen descends 180 mm with easeInQuad (accelerating).'),
  ('330', 'IMPACT: 3-frame camera shake amp 4 mm decaying, 300 dust particles, brass specular flash +40% for 2 f.'),
  ('330-360', 'Platen lifts (easeOutCubic), sheet peels revealing "Hello." in UnifrakturMaguntia, ink-bleed shader spreads 0->0.35 mm over 20 f.'),
  ('360-390', 'Camera rises & pushes onto page.'),
 ], 'Key SpotLight #FFF1DC 60 cd, angle 0.45, penumbra 0.8, from above-right 1.2 m; rim RectAreaLight #CFE8FF 3 behind (temperature starts cooling); fill Hemisphere 0.12; envMapIntensity 0.5; background #0E0C0B.'),
 ('04_telegraph', 'Telegraph', 390, 540, 'bokehScale 6.0 macro (shallow; key arm sharp)', [
  ('375-405', 'Glyphs of "Hello." collapse into their Morse capsules (H ...., e ., l .-.., l .-.., o ---) and slide off the page edge onto the copper wire.'),
  ('405-425', 'Capsules ride the wire to the brass key and are absorbed (scale 1->0, emissive spike).'),
  ('425-523', 'Index finger taps HELLO exactly per data/morse_hello.json (2 f/unit). Key arm rotates -4 deg on each down; contact spark; each down launches an electric pulse along the wire at 1.2 m/s.'),
  ('523-540', 'Last pulse races away along the wire; light fully cold-electric.'),
 ], 'Key RectAreaLight #CFE8FF 4 overhead 0.6x0.3 m; rim RectAreaLight #4C8DFF 8 behind-left; 3 pooled PointLights #CFE8FF 2 cd riding active pulses; envMapIntensity 0.6; background #0B1220.'),
 ('05_phone', 'Rotary telephone', 540, 690, 'bokehScale 4.0', [
  ('525-555', 'Wire coils into a curly cord from its far end (helix r 8 mm, pitch 6 mm) as the camera follows it to the phone.'),
  ('555-585', 'Black bakelite rotary phone revealed, chrome-ish rim light lines.'),
  ('585-620', 'Finger dials two digits: dial rotates to the finger stop (easeInOutQuad, 9 f) then returns (easeOutQuad, 9 f), twice.'),
  ('620-640', 'Hand lifts handset 50 mm, tilts 25 deg.'),
  ('640-675', 'Six expanding ring waves from the earpiece (spawn every 6 f). A thin luminous line (Geist 200 outline of "hello") draws on 646-672.'),
  ('675-705', 'Rings flatten into rounded rectangles (superellipse n 2->8, aspect 1->2.06) converging on the smartphone outline.'),
 ], 'Overhead softbox RectAreaLight #EAF4FF 5, 1.2x0.6 m; two rim strip RectAreaLights #CFE8FF 6 left/right behind; envMapIntensity 0.8; background #0A0E16.'),
 ('06_post', 'The post', 690, 840, 'bokehScale 2.5 (screen pin-sharp)', [
  ('690-712', 'Rounded-rect light lines become phone edges; glass + aluminium body materialises; screen powers on at 712 (8 f emission ramp).'),
  ('720-735', 'Composer visible; right thumb enters.'),
  ('735-783', 'Thumb types "hello world" per data/social_post_ui.json typingSchedule (key popups, caret #7C5CFF).'),
  ('788-792', 'Thumb taps "post" at 792.'),
  ('796-806', 'Keyboard slides away; post card springs in (scale 0.96->1).'),
  ('804-836', 'Counts spring up to 128 / 342 / 2.4K / 18K (GeistMono tabular). Reply bubbles leave the screen plane in 3D and rise 6 cm.'),
  ('828-860', 'Camera pushes into the screen.'),
 ], 'Screen as RectAreaLight #FFFFFF 1.5 facing out; rim RectAreaLight #7C5CFF 4 behind; key RectAreaLight #FFFFFF 2 top-left; envMapIntensity 1.0; background #08080B.'),
 ('07_chat', 'AI reply', 840, 1020, 'DOF off (screen fills frame)', [
  ('840-862', 'The published post card morphs into the right-aligned user bubble "hello world" (shared rounded-rect).'),
  ('880-966', 'Reply streams token by token at the tokenFrames in data/chat_ui.json; each token fades 5 f with blur 6->0 px; cursor glow #7C5CFF.'),
  ('880-1020', '24 light particles per token arc into the orb; orb radius 6 -> 120 pt (smoothstep).'),
  ('990-1015', 'Orb particles briefly arrange into the hand-stencil outline (svg/hand_stencil_silhouette.svg) - hand motif - then release.'),
  ('966-1020', 'Text dims to 30%; orb pulses slowly (0.5 Hz).'),
 ], 'Screen content unlit (emissive canvas texture, toneMapped=false); Bloom threshold 0.8 intensity 0.6 drives the orb glow.'),
 ('08_return', 'Back to the fire', 1020, 1200, 'bokehScale ramps 0 -> 2.0 by 1170', [
  ('1020-1060', 'Orb colour lerps white/violet -> #FFC872/#E0A458 and starts flickering with the SAME periodic fire function.'),
  ('1040-1110', 'Camera pulls back through the glass. Screen rounded-rect edge gets fbm-displaced into a ragged rock edge revealing the cave wall behind; phone body dissolves into 1,500 embers.'),
  ('1060-1120', 'Orb drifts down-left and shrinks into the fire key light position (offscreen bottom-left), becoming the fire light.'),
  ('1110-1170', 'The same 4,000 pigment particles stream back and land on their texels; pigment alpha 0->1 (exact reverse of 100-118).'),
  ('1170-1200', 'Settle. Every animated value converges to its frame-0 value; frame 1199 eases into frame 0.'),
 ], 'Cave rig fades back in 1040-1150; all other rigs fade to 0 by 1150. Final values == frame 0 values.'),
]
for slug, title, f0, f1, dof, beats, light in ERAS:
    ks = [k for k in K if f0 - 15 <= k['frame'] <= f1 + 1]
    rows = '\n'.join(f"| {k['frame']} | {k['beat']} | {k['position']} | {k['target']} | {k['fovDeg']} | {mm(k['fovDeg'])} | {k['focusDistance']} | {k['ease']} | {k['note']} |" for k in ks)
    bt = '\n'.join(f'| {a} | {b} |' for a, b in beats)
    md = (f'# Era {slug[:2]} - {title} (frames {f0}-{f1}, {f0/30:.1f}-{f1/30:.1f} s)\n\n'
          f'## Beats\n| Frames | What happens |\n|---|---|\n{bt}\n\n'
          f'## Camera keys (world metres, Y up; from data/camera_keyframes.json)\n'
          f'| Frame | Beat | Position | Target | vFOV deg | Lens mm (FF, vertical) | Focus m | Ease into key | Note |\n|---|---|---|---|---|---|---|---|---|\n{rows}\n\n'
          f'Depth of field: {dof}.\n\n## Lighting\n{light}\n')
    open(os.path.join(ROOT, 'reference', f'storyboard_{slug}.md'), 'w').write(md)
print('ok')
