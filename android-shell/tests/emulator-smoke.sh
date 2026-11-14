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
# A process alive is not enough. Inspect the actual WebView content and localStorage.
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID}"
node android-shell/tests/check-webview.cjs first
adb forward --remove tcp:9222
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity"
sleep 8
PID2="$(adb shell pidof "$PACKAGE" | tr -d '\\r')"
test -n "$PID2"
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID2}"
node android-shell/tests/check-webview.cjs after-restart
adb forward --remove tcp:9222
mkdir -p android-shell/tests/results
adb shell screencap -p /sdcard/fitnessdex-shell.png
adb pull /sdcard/fitnessdex-shell.png android-shell/tests/results/fitnessdex-shell.png
adb logcat -d -v brief > android-shell/tests/results/android-logcat.txt
if grep -q 'FATAL EXCEPTION' android-shell/tests/results/android-logcat.txt; then
  echo 'ERROR: Android fatal exception detected:'
  adb logcat -d -v brief | grep -A 22 'FATAL EXCEPTION' | head -n 65
  exit 1
fi
echo 'PASS: Native Android activity launched, rendered FitnessDex UI, persisted storage after restart and produced screenshot.'
echo 'NOTE: Visual parity, login and reminders still require separate acceptance tests.'
