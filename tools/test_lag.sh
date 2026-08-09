#!/bin/bash
echo "Building debug APK..."
npm run android:build:debug > /dev/null 2>&1
echo "Installing APK..."
adb install -r android/app/build/outputs/apk/debug/app-debug.apk > /dev/null

run_test() {
  local mode=$1
  echo "--- RUNNING TEST: $mode ---"
  adb logcat -c
  adb shell am force-stop com.castlestormers.game
  
  if [ "$mode" == "direct" ]; then
    # Start app with intent to go directly to battle
    adb shell am start -n com.castlestormers.game/com.castlestormers.game.MainActivity -e "androidPerf" "1" -e "scene" "battle" -e "level" "20"
  else
    # Start app normally (Menu)
    adb shell am start -n com.castlestormers.game/com.castlestormers.game.MainActivity -e "androidPerf" "1"
  fi
  
  echo "Waiting 15 seconds for game to load and run..."
  sleep 15
  
  echo "Capturing logcat..."
  adb logcat -d | grep -E "CastlePerf|FPS|lag|error" > "outputs/performance/adb_test_$mode.log"
}

mkdir -p outputs/performance
run_test "direct"
run_test "menu"

echo "Done. Check outputs/performance/adb_test_*.log"
