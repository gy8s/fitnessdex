#!/usr/bin/env bash
# Deliberately small Android-runtime probe. No real user account or data.
set -euo pipefail
PACKAGE="io.github.gy8s.fitnessdex"
APK="android-shell/android/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK"
adb install -r "$APK"
adb shell am force-stop "$PACKAGE" || true
adb logcat -c
echo "Launching the packaged FitnessDex native activity"
OUTPUT="$(adb shell am start -W -n "$PACKAGE/.MainActivity")"
printf '%s\n' "$OUTPUT"
echo "$OUTPUT" | grep -q 'Status: ok'
sleep 12
PID="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
test -n "$PID" || { echo "ERROR: App process is not running"; exit 1; }
echo "FitnessDex Android process is running: $PID"
adb shell dumpsys activity activities | grep -F "$PACKAGE" | head -n 12 || true
mkdir -p android-shell/tests/results
adb shell screencap -p /sdcard/fitnessdex-shell.png
adb pull /sdcard/fitnessdex-shell.png android-shell/tests/results/fitnessdex-shell.png
if adb logcat -d -v brief | grep -q 'FATAL EXCEPTION'; then
  echo 'ERROR: Android fatal exception detected:'
  adb logcat -d -v brief | grep -A 22 'FATAL EXCEPTION' | head -n 65
  exit 1
fi
echo 'PASS: Native Android activity launched, remained alive and produced screenshot.'
echo 'NOTE: Visual parity, login and reminders still require separate acceptance tests.'
