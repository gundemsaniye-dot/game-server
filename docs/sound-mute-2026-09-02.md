# Persistent game-wide mute

## Contract and implementation

The settings menu's SOUND: OFF applies to splash/menu, campaign/map/story/tutorial,
offline and online battles, effects and music, results, background/resume and restart.
Explicit SOUND: ON restores the current scene's music, not an old scene's pending request.

- Read the existing `castle-stormers.sound-muted` key once at sound-manager startup.
  Keep a session value when storage is inaccessible, including renderer recreation.
- Maintain a synchronous logical choice. On the physical WebView, Phaser's mute getter
  (derived from `masterMuteNode.gain.value`) could retain the old value after a scheduled
  gain change when the graph became idle. Synchronize the intrinsic master gain on the
  mute event as well; menu labels, toggles and playback guards use the logical choice.
- Master mute plus immediate stop/removal of live sound instances prevents ongoing audio.
  Retain decoded buffers for reuse. Muted convenience SFX calls return before allocating;
  direct power effects and combat/spawn helpers also return early.
- Cancel unlock listeners, verification timers and fade tweens on mute/scene shutdown.
  Async context-resume completions check the current request and mute choice again.
  Music state belongs to its sound manager, not a global request shared across games.
- The mute button itself does not play a click before disabling sound.

No new game-loop/rAF/polling task, per-frame storage access, rendering work, server work
or texture allocation was added. Two mute-event listeners are installed once per manager.
SFX request guards are constant-time. Muting removes audio work. Fades use Phaser's
existing target tween instead of an extra JavaScript `onUpdate` callback.

## Verification

- `server/node_modules/.bin/tsx --test tools/test-sound-mute.ts tools/test-android-perf-monitor.ts tools/test-frame-timing.mjs`:
  19 passing tests (10 mute tests plus the existing 9 performance/cleanup/timing tests).
  Includes storage failure, cold boot, scene changes, 100 toggles, pending unlock/resume,
  cancelled retry/fade, native gain getter lag, and intrinsic gain synchronization.
- Frontend TypeScript retains the same 26 pre-existing diagnostics; no diagnostics in
  the new audio code. Diagnostic Android benchmark build succeeds.
- Physical RMX3997, Android 16 / WebView 151, separate `.perf` package, normal menu flow.
  Final menu SOUND: ON measured a nonzero output peak (0.030962, normalized sample);
  SOUND: OFF immediately showed the correct label, native master gain 0, output peak 0
  and zero sound instances. The analyser was attached only temporarily for verification
  and disconnected afterwards; it is not shipping instrumentation or a microphone recording.
- Normal menu → real browser-opponent online battle (`muddy_fields_01`): mute persisted,
  output peak 0 and zero sound instances during actual unit/castle action. A ten-second
  active-battle sample measured 600 executed frames / 10,000.3 ms = 59.998 FPS.
  Background/foreground, explicit effect-helper probes, game-over and return to menu
  remained silent. Probes are distinguished from UI gameplay, not counted as extra units.
- Cold restart with stored OFF was silent before splash dismissal, with gain 0 and zero
  sound instances. No store package or campaign save was overwritten.
- Offline flow continued normally through campaign map → story → tutorial → level 1.
  During combat (nine units at the end of the sample, with ICE input exercised),
  600 frames / 10,000.2 ms = 59.999 FPS; output peak 0, master gain 0, no sound instances.
  The analyser-positive ON control and zero-output OFF checks distinguish genuine
  silence from a disconnected or nonworking measurement path.

These are targeted regression checks, not a new long-duration FPS certification across
every device/map. The preceding HUD/frame-pacing fix remains unchanged.

## Production and handoff

`npm run build-nolog`, Capacitor production sync, and
`./gradlew testProductionBenchmarkUnitTest assembleProductionBenchmark` pass (native
sources unchanged; five existing native tests remain passing). The installed separate
production package has DEBUG/PERF_LOG_BRIDGE false and exposes no WebView debug socket.
Its normal splash → menu → settings flow still displays SOUND: OFF after reinstall/start.
The production bundle contains neither diagnostic game global nor renderer-recreation hook.

Keep the store application's data and the test package's explicit OFF preference.
Remove this test's temporary screenshots and ADB forwarding after verification; no audio
or screen recording was created. Commit/deployment identity is recorded in task delivery.
