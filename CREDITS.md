# Credits — ONE BALL

## Audio samples
All instrument sounds in this video are real recordings from the
**Versilian Community Sample Library (VCSL)** by Versilian Studios / Sam Gossner,
released under **CC0 1.0 Universal** (public domain dedication).

- Source: https://github.com/sgossner/VCSL
- License: https://creativecommons.org/publicdomain/zero/1.0/

Instruments used:

| Role | VCSL instrument | Files |
|---|---|---|
| Ring hits (primary) | Idiophones / Struck Idiophones / **Marimba** | `Marimba_hit_Outrigger_*` (soft / med / loud) |
| Arm hits (one octave lower) | **Marimba** | same |
| Ball-ball hits (sparkle layer) | **Glockenspiel** (VCSL has no celesta; the glockenspiel is the closest mallet instrument) | `glock_*` |
| Sustained pad in D | **Vibraphone, bowed** | `Vibes_bowed_D4`, `Vibes_bowed_A2`, `Vibes_bowed_A4` |
| 23 s burst chord | Marimba + Glockenspiel + **Hand Chimes** | `sus_D3`, `sus_D4`, `sus_D5`, `sus_A4` |

No synthesized, oscillator or AI-generated sound is used. Notes are placed by a
sampler-style mapping: the nearest recorded pitch, resampled to the exact
equal-tempered target (D major pentatonic). VCSL filenames use the "C3 = middle C"
convention; each sample's tuning was measured and corrected.
The reverb is a convolution with a decaying-noise impulse response (processing only).

## Fonts
- Inter — Rasmus Andersson, SIL Open Font License 1.1 (via @fontsource/inter)
- Geist Mono — Vercel, SIL Open Font License 1.1 (via @fontsource/geist-mono)

## Tools
Remotion, FFmpeg. Physics: custom deterministic fixed-step 2D simulation (`scripts/simulate.ts`, mulberry32 seed 2026).

Video by @BreezeOg1.
