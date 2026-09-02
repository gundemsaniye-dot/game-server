#!/bin/bash
set -euo pipefail
# Old unhandled intent extras did not exercise two different online paths and
# installing over the store application risked its data. This is read-only.
echo "Enter a real online match through splash/menu in com.castlestormers.game.perf and pair a web opponent first."
task_pid=$(adb shell pidof com.castlestormers.game.perf | tr -d '\r')
test -n "$task_pid"
adb forward tcp:9222 "localabstract:webview_devtools_remote_$task_pid"
node tools/android-cdp.mjs '(() => { const s=window.__CASTLE_GAME__?.scene.getScene("Game"); if(!s?.isOnline || !s.sys.isActive() || s.battleEnded) throw new Error("Enter a real, active online match first"); return {room:s.roomId,elapsedMs:s.elapsedMs,online:window.__CASTLE_ONLINE_PERF__,perf:window.__CASTLE_ANDROID_PERF__}; })()'
