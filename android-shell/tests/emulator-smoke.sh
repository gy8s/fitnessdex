#!/usr/bin/env bash
# Deliberately small Android-runtime probe. No real user account or data.
set -euo pipefail
mkdir -p android-shell/tests/results
capture_evidence() {
  local exit_code="$?"
  trap - EXIT
  # Collect diagnostics on BOTH success and failure, without masking the test result.
  set +e
  adb shell dumpsys activity activities > android-shell/tests/results/activity-dump.txt 2>&1
  adb logcat -d -v brief > android-shell/tests/results/android-logcat.txt 2>&1
  adb shell screencap -p /sdcard/fitnessdex-shell.png
  adb pull /sdcard/fitnessdex-shell.png android-shell/tests/results/fitnessdex-shell.png
  exit "$exit_code"
}
trap capture_evidence EXIT
PACKAGE="io.github.gy8s.fitnessdex"
APK="android-shell/android/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK"
adb install -r "$APK"
adb shell am force-stop "$PACKAGE" || true
adb logcat -c
echo "Launching the packaged FitnessDex native activity"
# Unaccelerated CI emulators can time out in am start -W even when booted.
# Start without -W, then verify actual process, rendered UI and durable storage.
OUTPUT="$(adb shell am start -n "$PACKAGE/.MainActivity")"
printf '%s\n' "$OUTPUT"
if grep -E 'Error:|Exception' <<< "$OUTPUT"; then
  echo "ERROR: Android could not start the app"
  exit 1
fi
PID=""
for attempt in $(seq 1 30); do
  PID="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
  if test -n "$PID"; then break; fi
  sleep 3
done
test -n "$PID" || { echo "ERROR: FitnessDex process did not appear after launch"; exit 1; }
echo "FitnessDex Android process is running: $PID"
adb shell dumpsys activity activities | grep -F "$PACKAGE" | head -n 12 || true
# A process alive is not enough. Inspect the actual WebView content and localStorage.
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID}"
node android-shell/tests/check-webview.cjs first
adb forward --remove tcp:9222
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity"
sleep 8
PID2="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
test -n "$PID2"
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID2}"
node android-shell/tests/check-webview.cjs after-restart
adb forward --remove tcp:9222
if adb logcat -d -v brief | grep -q 'FATAL EXCEPTION'; then
  echo 'ERROR: Android fatal exception detected:'
  adb logcat -d -v brief | grep -A 22 'FATAL EXCEPTION' | head -n 65
  exit 1
fi
echo 'PASS: Native Android activity launched, rendered FitnessDex UI, persisted storage after restart and produced screenshot.'
echo 'NOTE: Visual parity, login and reminders still require separate acceptance tests.'
