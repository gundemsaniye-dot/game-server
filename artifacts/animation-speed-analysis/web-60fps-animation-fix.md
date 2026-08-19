# Web 60 FPS Animation Fix

## Problem

The updated unit atlases moved run and attack to 16-frame timelines, but the
runtime was still pacing those denser frames too aggressively. On a 60 Hz
display the units looked like they were pedaling and striking too quickly,
which made the authored frame changes read as popping or jumping in gameplay.

The old animation sheets had fewer poses and a slower apparent cycle. After the
frame update, keeping the new dense timeline at a short 0.8 s base cycle made
the motion feel faster even when the render loop itself was stable.

## Change

- Run/attack base playback is now 12 authored poses per second.
- A 16-frame run stride now lasts about 1.33 s before per-unit speed scaling.
- Runtime run cycles are now constrained to a calmer `1270-1667 ms` band.
- Attack playback now reads as a full combat gesture with a wider
  `980-1800 ms` clamp. Melee unit-vs-unit attacks use at least `1200 ms`
  cooldown before the dedicated `1.3x` unit-vs-unit slowdown, so swordsmen no
  longer trade blows as a twitchy burst at 60 Hz.
- Runtime animation creation no longer rescales frame rate by authored run
  frame count; the atlas timeline owns the frame count.
- Atlas QA mirrors the real unit timing and reports the 16-frame cycle.

## Web Recording

- Before: `artifacts/animation-speed-analysis/current-web-60fps/current-web-60fps.mp4`
- First slowdown pass: `artifacts/animation-speed-analysis/after-web-60fps/after-web-60fps.mp4`
- Final slower pass: `artifacts/animation-speed-analysis/slower-web-60fps/slower-web-60fps.mp4`
- Side-by-side: `artifacts/animation-speed-analysis/web-before-after-60fps.mp4`
- 15 fps vs 12 fps comparison: `artifacts/animation-speed-analysis/web-15fps-vs-12fps.mp4`

Both recordings use:

`?scene=battle&level=1&navCombatQa&seed=24680`

## Sword Duel QA

- Custom path: `?scene=battle&level=1&swordDuelQa&seed=24680&debug=1`
- Recording: captured temporarily at 60 fps, 473 frames, 7.88 s, then deleted
  after verification to avoid keeping bulky video/frame artifacts.
- Result: `SWORD_DUEL_QA PASS`
- Player/enemy animation: `unit-player-swordsman-attack` /
  `unit-enemy-swordsman-attack`
- Swordsman unit-vs-unit cooldown: `1560 ms`
- Swordsman attack visual cycle: `1685 ms`
- Runtime attack animation time scale: `0.7914`
- Final QA HP after 7 s: player `919`, enemy `909`

## Unit Asset Matrix

- Checked 8 unit types across both teams: peasant, swordsman, archer, horseman,
  long_spearman, mace_guard, mage, knife_thrower.
- Player/blue assets: 8 PNG + 8 JSON present.
- Enemy/red assets: 8 PNG + 8 JSON present.
- Each atlas JSON has 8 idle, 16 run, and 16 attack frames.
- Each runtime atlas image reports `2048x384`.

## Web Frame Timing

Before:

- Frames: 573
- Average FPS: 57.38
- p50 frame: 16.96 ms
- p95 frame: 19.32 ms
- Console errors/warnings: 0

First slowdown pass:

- Frames: 594
- Average FPS: 59.50
- p50 frame: 16.98 ms
- p95 frame: 24.14 ms
- Console errors/warnings: 0

Final slower pass:

- Frames: 594
- Average FPS: 59.49
- p50 frame: 16.95 ms
- p95 frame: 20.92 ms
- p99 frame: 28.48 ms
- Console errors/warnings: 0

## Final Runtime Timing

- Peasant: run 1667 ms, attack 1685 ms
- Swordsman: run 1333 ms, attack 1685 ms
- Archer: run 1638 ms, attack 1572 ms
- Horseman: run 1270 ms, attack 1685 ms
- Long spearman: run 1365 ms, attack 1685 ms
- Mace guard: run 1667 ms, attack 1685 ms
- Mage: run 1667 ms, attack 1800 ms
- Knife thrower: run 1270 ms, attack 1067 ms

## Validation

- `node tools/validate-unit-atlases.mjs`
- `PATH="$(pwd)/.venv/bin:$PATH" python tools/validate-unit-visual-continuity.py`
- `node tools/validate-unit-animation-timing.mjs`

All three passed.

`npx tsc --noEmit` still fails on pre-existing unrelated project errors in
RuntimeAssets, MainMenu, MapSelect, SceneTransition, and earlier Game/online QA
code paths; the animation timing validator and browser recordings are clean.
