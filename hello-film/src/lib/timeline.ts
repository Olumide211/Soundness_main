// Single source of truth for every frame number in the film (30 fps).
export const FPS = 30;
export const LOOP_FRAMES = 1200;
export const CREDIT_FRAMES = 1275;

export const T = {
  // 5.1 cave
  caveStart: 0, caveEnd: 120,
  sheenStart: 40, sheenEnd: 70,
  liftStart: 100, liftEnd: 118, liftFade: 4,
  driftEnd: 150,
  // 5.2 papyrus
  papyrusStart: 120, papyrusEnd: 240,
  landStart: 135, landEnd: 160, revealGrow: 6,
  handInStart: 150, handInEnd: 165,
  writeStart: 165, writeEnd: 215, wetFrames: 10,
  glyphStart: 205, glyphEnd: 220, glyphWipe: 10,
  handOutStart: 220, handOutDur: 18,
  // 5.3 press
  pressStart: 240, pressEnd: 390,
  sortMorphStart: 225, sortMorphEnd: 255,
  sortFlyStart: 255, sortFlyEnd: 290, sortStagger: 4,
  brayerStart: 290, brayerEnd: 318,
  leverStart: 300, impact: 330,
  peelStart: 330, peelEnd: 360, bleedFrames: 20,
  pagePushStart: 360, pagePushEnd: 390,
  // 5.4 telegraph
  telegraphStart: 390, telegraphEnd: 540,
  morseMorphStart: 375, morseMorphEnd: 405,
  capsuleRideStart: 405, capsuleRideEnd: 425,
  tapStart: 425, tapEnd: 523, coldBy: 440,
  // 5.5 phone
  phoneStart: 540, phoneEnd: 690,
  coilStart: 525, coilEnd: 555,
  phoneRevealStart: 555, phoneRevealEnd: 585,
  dialStart: 585, dialEnd: 620,
  liftStart2: 620, liftEnd2: 640,
  ringsStart: 640, ringsEnd: 675, ringEvery: 6, ringLife: 30,
  helloLineStart: 646, helloLineEnd: 672,
  ringToScreenStart: 675, ringToScreenEnd: 705,
  // 5.6 post
  postStart: 690, postEnd: 840,
  bodyStart: 690, bodyEnd: 712,
  powerOn: 712, powerOnDur: 8,
  thumbIn: 720, typeStart: 735, typeEnd: 783,
  postTapMove: 788, postTap: 792,
  kbHideStart: 796, kbHideDur: 10,
  cardIn: 798, countStart: 804, countEnd: 836, likeFill: 808,
  bubblesStart: 810, bubblesEnd: 832,
  socketStart: 828, socketEnd: 860,
  // 5.7 chat
  chatStart: 840, chatEnd: 1020,
  cardToBubbleStart: 840, cardToBubbleEnd: 862,
  tokensStart: 880, cursorHide: 966,
  orbStart: 880, orbFull: 1020,
  handShapeStart: 990, handShapeEnd: 1015,
  dimStart: 966,
  // 5.8 return
  returnStart: 1020,
  orbWarmStart: 1020, orbWarmEnd: 1060,
  raggedStart: 1040, raggedEnd: 1110,
  orbToFireStart: 1060, orbToFireEnd: 1120,
  releasePhone: 1110,
  pigmentReturnStart: 1110, pigmentReturnEnd: 1170,
  settleStart: 1170,
  // credit tail
  creditFireStart: 1200, creditFireEnd: 1230,
  ruleStart: 1218, ruleEnd: 1236,
  textStart: 1222, textEnd: 1240,
} as const;

/** light-rig crossfade windows (§9) */
export const RIG_X = {
  cavePapyrus: [100, 150],
  papyrusPress: [225, 255],
  pressTelegraph: [375, 405],
  telegraphPhone: [525, 555],
  phoneSmart: [675, 705],
  smartChat: [828, 860],
  chatReturn: [1040, 1150],
} as const;

/** heavy-mesh mount windows: [eraStart-40, eraEnd+40] */
export const MOUNT = {
  cave: [[0, 200], [1000, 1200]],
  papyrus: [[80, 300]],
  press: [[200, 430]],
  telegraph: [[350, 740]],
  phone: [[500, 730]],
  smartphone: [[650, 1160]],
} as const;
export const mounted = (f: number, ranges: readonly (readonly number[])[]) =>
  ranges.some(([a, b]) => f >= a && f <= b);
