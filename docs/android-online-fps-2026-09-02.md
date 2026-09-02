# Android online FPS investigation — 2026-09-02

## Scope and method

Physical realme RMX3997 (MT6835), Android 16, Android System WebView 151.0.7922.199; 720 × 1604 display, landscape 1280 × 720 game canvas. Supported panel modes: 50/60/90/120 Hz. **130/144 Hz were not physically tested**; those rates are covered by the deterministic timing tests only.

Baseline: `80f83252672f1f5be46f228e5c93ccbcbbb9c9f1`. Android used the separate `com.castlestormers.game.perf` package; the Play-installed application's package/data were not overwritten. The opponent was an actual browser game, connected to the public authoritative WebSocket server. Normal tests entered through splash → main menu → 1v1 online, not an offline synthetic performance URL. Maps were selected by the server. Different-map runs are not claimed as controlled same-map comparisons.

FPS means executed game-frame intervals divided by their measured wall time. p50/p95/p99 describe interval distributions; reciprocal median is **not** mean FPS. Native logcat, WebView diagnostics, scene/texture/sound inventories, Android memory/thermal/display information and Perfetto supplement one another. Debug instrumentation adds overhead; final production-flag validation is separate. Short diagnostic interventions and loading transitions are identified, not silently discarded.

## What caused the slowdown

The strongest causal evidence was the live, reversible HUD A/B in the same empty online match:

| Intervention | Actual FPS, approximately |
| --- | ---: |
| Baseline, 120 Hz | 49.7 |
| Audio muted | 49.9 |
| Snapshot application stopped | 50.2 |
| Animations/tweens paused | 49.2 |
| FPS text hidden | 49.6 |
| HUD text hidden | 76.7 |
| HUD rectangle/circle shapes hidden | 119.9 |
| Entire HUD hidden | 120.2 |
| Wood/card decorations hidden | 73.7 |

Those uncapped diagnostic numbers are controls, not the shipping target. Baseline draw calls were about 36/frame. Forcing 60 Hz in the same baseline match produced approximately 27–30 FPS instead of ~50 at 120 Hz. CPU profiling spent about 80% idle, with only ~5.6 ms GC in a ten-second profile. Disabling actual GL submissions also removed the limitation. Together these point to **HUD WebGL submission/batching and the Android compositor/GPU deadline**, not expensive empty-match simulation or server RTT. These controls do not prove that arbitrary high unit counts or all audio scenarios are free of cost.

An initial decoration-only restoration still fell to 50–52 FPS during castle attacks. It was rejected. Static card/panel/cost chrome was then moved to shared textures too. Final empty-match cost is about **20 draw calls/frame**, preserving oak grain, seams, nails, team badge, borders, hover/selection/pulse states and original logical hit areas.

`desynchronized:true` was tested and worsened performance (~43–44 FPS with much larger tail intervals). The default remains false. No native thread priority, server simulation tick or snapshot frequency was changed on speculation.

Earlier work was inspected: `f7c3d60` reduced the server presentation stream to 10 Hz while preserving 20-Hz simulation; the client also applies latest snapshots at 10 Hz and interpolates. Existing online HUD updates run at 5 Hz. Atlas batching, deferred snapshot application, the transition scene's menu-asset cleanup, and incoming-only/rate-limited castle haptics were retained. `634752e` addressed offline opponent castle haptics. The existing native refresh policy prefers a supported 60-Hz multiple (up to 120 Hz); that helps presentation headroom but is not an FPS cap. These changes were useful, but did not eliminate the measured per-frame vector HUD workload.

## Changes

- `HudTextures.ts`: fixed keys for decorations; a finite palette/size cache for card states; padded texture children inside correctly sized interactive containers. No per-match UUID keys for HUD chrome. Dynamic bars, unit sprites and controls remain dynamic.
- `RenderFrameClock.ts`: caps full `Game.step` work at 60 FPS. Phaser 4's built-in modulo limiter can skip frames around a jittered 60-Hz boundary and passes accumulated remainder to consumers. The replacement uses a small 0.5-ms scheduling tolerance and the elapsed time between executed steps; visibility/resume resets exclude background time. The overlay reports rendered game FPS, not rAF callback count.
- Monitor schema 2: elapsed-weighted FPS, explicit sample duration/count, ring-safe percentiles beyond 45,000 frames, real vs synthetic stage labels, pause handling and final lifecycle summaries.
- Interrupted one-shot sound instances are removed at battle cleanup. Their decoded reusable buffers remain cached. Previously `stopByKey` prevented the `complete` event which normally destroys one-shot objects: menu inventories demonstrated 1 → 2 stopped sword-hit objects across two battles.
- Perfetto gets a 256-MB discard buffer and a separate process-metadata buffer. The earlier 32-MB ring retained only ~10.6 seconds of a requested minute, with missing process identities; it is not reliable battle evidence.
- The old `test_lag.sh` used unhandled intent extras, did not establish real direct-vs-menu battle paths, and risked installing over the store package. It now only reads an already-established diagnostic online match.
- `/health` exposes status and the validated public Render commit SHA only, enabling positive deployment verification. No player data or environment configuration is returned.
- `productionBenchmark` mirrors release flags without the diagnostic native bridge, using a separate package/debug signing so production behavior can be tested without replacing the store app.

Phaser distinguishes its target and limiter, and its rAF-based loop FPS is not a count of our capped game steps. See [Phaser TimeStep](https://docs.phaser.io/api-documentation/class/core-timestep). Android frame-rate requests are hints; refresh multiples and supported modes affect presentation cadence. See [Android frame-rate guidance](https://developer.android.com/media/optimize/performance/frame-rate). Deployment identity uses Render's documented [RENDER_GIT_COMMIT](https://render.com/docs/environment-variables).

## Device results

Final-renderer 120-Hz normal-menu matches (before the separate interrupted-sound cleanup patch, which changes exit behavior only):

| Public room | Map | Duration / mean FPS | Load |
| --- | --- | --- | --- |
| room_8 | infernal dungeon | 199.3 s / 59.4 FPS | Up to 12 units, combat, castle attacks, ice, emote, sound |
| room_9 | silent forest | 344.8 s / 59.6 FPS | Idle/warm-up plus 16 attacking soldiers; minimum 10-s interval 56.9 FPS |
| room_10 | grasslands | 269.1 s / 59.9 FPS | Up to 15 sampled units; workers, swordsmen, archers, cavalry, missile, emotes, castle attacks |

120-Hz coverage totals **813.25 seconds / 48,508 frames = 59.65 FPS across three real matches**, not one uninterrupted ten-minute battle. The soak portions are not represented as ten minutes of constant dense combat. No 10-second interval reached or fell below 30 FPS; minimum 56.9 FPS.

60-Hz coverage totals **716.47 seconds / 41,633 frames = 58.11 FPS**. Room 11 ran uninterrupted for 474.62 s, average 58.0, p50/p95/p99 16.8/22.3/28.8 ms, up to 14 sampled units. Room 12 contributed 241.84 s at 58.38 FPS before the explicitly marked switch to 90 Hz. Up to 18 simultaneous units were actually sampled in that room; 24 queued deployment commands are not claimed as 24 continuously living units. Both sessions included real combat; neither was ten minutes of constant dense combat. Minimum 10-second interval 55.4 FPS; no sustained 30-FPS interval. A separate 60.020-s native trace retained 3,498 draw slices (~58.28/s), consistent with game-frame measurements (2,420 OEM systrace parse failures noted).

90-Hz same-room control: room 12, same map, same one surviving castle-attacking soldier, music and hit audio playing. Normal renderer: a representative 600-frame window averaged 58.9 FPS (p95 29.4 ms). A new Phaser/WebGL renderer loaded battle assets directly, never loading splash/menu assets, while retaining the exact existing server connection and state: warm 600-frame window 58.7 FPS (p95 28.9 ms); complete 68.19-s recreation sample including load/warm-up 58.1 FPS. Texture count 110 → 102, with no material FPS advantage. This isolates the renderer/asset history on the fixed code; it is **not** a cold WebView/process launch or proof about every historical direct-entry build. It also does not treat an offline/synthetic scene as a real online match. The 60-FPS ceiling limits conclusions about unused performance headroom.

Timing probes: a 2,000-ms tween completed in 2,003.2 ms at both tested 120/60-Hz conditions. A 16-frame animation configured for 1,333.3 ms completed in 1,310.7 ms at 60 Hz (start/update quantization, not the previous limiter-remainder acceleration); deterministic tests assert exact accumulated elapsed time at 60/90/120/130/144 Hz.

Offline regression check: normal campaign menu → level 1 → story/tutorial → battle at 120 Hz, 52.46 s / 3,080 frames = 58.7 FPS, p50/p95/p99 16.7/24.5/32.4 ms, up to ten units at the end. The earlier level-1 baseline was approximately 55 FPS. No regression was seen in this smoke test; this is not a full 20-level campaign certification.

## Lifecycle, GPU, threads and logs

Across the first three menu-to-battle cycles, the active battle had no menu/splash/world-map keys. Prior scenes were inactive with zero children/tweens. Menu returned to exactly one active scene with 10 objects. HUD cache keys stabilized at 16 after exercising normal-size card states. Battle texture totals 107 → 110 → 112 were explained by newly encountered map/resource assets and the result button, not growing HUD caches; transient text UUID textures were removed at shutdown. The existing battle/map asset cache intentionally retains reusable assets (bounded by the game's asset set); this is not a claim that all unused map memory is freed immediately.

The exercised 16-key HUD cache occupied 942,976 uncompressed RGBA bytes (~0.90 MiB, excluding driver overhead). Native heap allocation across those battle samples was 38.55 → 39.21 → 39.44 MB (reported decimal MB). Total PSS 249,607 → 270,366 → 277,957 KiB includes different-map assets and platform caches, so it is not a same-map leak slope. It fell after exit. GPU per-process memory after the second/third exits was 146,210,816 → 141,246,464 bytes, not persistent monotonic growth.

After the sound fix, three consecutive menu returns in the same renderer contained **only one playing lobby-music instance**, including two deliberate interrupted sword-hit playback regression probes. Menu objects remained 10; warmed texture keys 59 → 62 → 62, HUD keys 12 → 12 → 12 (only base states exercised in these short probes). Precise CDP heap usage 9,787,472 → 12,842,048 → 9,731,940 bytes; backing storage 9,836,121 → 10,271,106 → 10,118,348. Natural GC returned usage near the initial level. This supports bounded lifecycle behavior in the tested loops, not a universal leak-free guarantee.

The 60.016-s final combat Perfetto trace retained process identity and 3,556 RenderThread draw slices (~59.25/s). Main app thread ran ~8.52 CPU-seconds; Chrome in-process GPU ~22.44, Mali utility ~27.65 and Mali backend ~17.45 over the minute. GPU/compositor work remained substantial; there was no evidence supporting a speculative Java thread-priority fix. WebViewFunctor/draw slices include waiting/presentation work and cannot be added as independent CPU costs. The OEM trace had 2,475 systrace parsing failures, so it is corroborating evidence, not a perfect lossless GPU profiler.

Relevant logcat warnings were reviewed, including repeated OEM `GPUAUX ... Null anb`, OPlus scheduling/predictive-back messages, and intermittent Chromium audio SyncReader glitch counters. The GPUAUX messages also occurred while the game maintained ~60 FPS; their presence alone is not evidence of the old persistent low-FPS cause. Audio warning counters are not described as zero audio glitches. No new JavaScript exception, fatal crash, OOM or WebGL context-loss event was found in the tested app-process logs. Haptic service records confirmed completed app-requested vibrations during incoming castle attacks (roughly one-second spacing in the inspected segment).

## Regression and reproducibility

- Frontend TypeScript: 26 diagnostics at both baseline and modified source, same error identities after line-number normalization; no new errors. Existing issues include unused imports/fields, Phaser graphics options, HowToPlay's `data` member, and the stale `tiledCollisionGrid` reference. They are unrelated to this FPS patch and are not falsely reported as a clean typecheck.
- Timing/monitor/audio cleanup: 9/9 tests pass with `server/node_modules/.bin/tsx --test tools/test-android-perf-monitor.ts tools/test-frame-timing.mjs`.
- Server: 22/22 tests pass, `npm --prefix server run typecheck` passes; HTTP health smoke check succeeds on compatible Node 22.
- Android: diagnostic benchmark and productionBenchmark assemble successfully; native tests 5/5 pass (including four refresh policy cases). Normal production asset build/validation passes without changing source maps.
- Production bundle contains no diagnostic game global, renderer-recreation hook or online telemetry marker. Installed productionBenchmark has `DEBUG=false`, `PERF_LOG_BRIDGE=false`, WebView debugging disabled and native logging disabled; no WebView debug socket is exposed. Store package/data remain separate.
- Production-flag smoke check also entered an actual browser-opponent online match through the normal menus. The device overlay showed 60 FPS / 61 ms server RTT; this single observation is not substituted for the diagnostic soak measurements above.
- Device collection: forward the `.perf` WebView's actual PID socket to localhost:9222, then `node tools/android-cdp.mjs`. `node tools/summarize-online-perf.mjs <local-logcat-file>` extracts only native bridge measurements, avoiding duplicate console lines.
- The host's Node 26 cannot load the existing pinned uWebSockets native ABI; the executable server smoke check uses compatible Node 22. This predates the patch and is not an Android FPS regression.

## Rollout acceptance and cleanup protocol

After push, allow the requested 4–5-minute deployment window and require `/health` to identify the pushed SHA, then verify a fresh production web ↔ Android match. The post-push commit/health observation and final cleanup confirmation are recorded in the task delivery (a commit cannot embed its own future SHA). Do not equate an old server's successful connection with deployment completion.

Delete this investigation's screenshots/recordings and temporary device/local trace files after the last live check; preserve unrelated older captures. Restore original refresh settings (`peak_refresh_rate=120.00001`, no `min_refresh_rate` override). Preserve the user's store application/data. The separate `.perf` package contains the production-flag validation build, not a Play Store update.
