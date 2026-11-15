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
  # Stream image straight to the CI computer; /sdcard is restricted on some emulators.
  adb exec-out screencap -p > android-shell/tests/results/fitnessdex-shell.png
  if [ "$exit_code" -ne 0 ]; then
    echo "Android probe failed (exit $exit_code). Process and activity evidence:"
    adb shell pidof io.github.gy8s.fitnessdex || true
    grep -E 'ResumedActivity|Resumed:|mCurrentFocus=|io.github.gy8s.fitnessdex' android-shell/tests/results/activity-dump.txt | head -n 16 || true
    grep -E -i 'FATAL EXCEPTION|ANR in|am_crash|Process io.github.gy8s.fitnessdex|java.lang.(RuntimeException|IllegalStateException)' android-shell/tests/results/android-logcat.txt | tail -n 25 || true
  fi
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
  PID="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
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
adb shell am start -n "$PACKAGE/.MainActivity"
PID2=""
for attempt in $(seq 1 30); do
  PID2="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID2"; then break; fi
  sleep 3
done
test -n "$PID2" || { echo "ERROR: FitnessDex process failed to return after restart"; exit 1; }
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID2}"
node android-shell/tests/check-webview.cjs after-restart
node android-shell/tests/check-webview.cjs navigation
adb forward --remove tcp:9222
if adb logcat -d -v brief | grep -q 'FATAL EXCEPTION'; then
  echo 'ERROR: Android fatal exception detected:'
  adb logcat -d -v brief | grep -A 22 'FATAL EXCEPTION' | head -n 65
  exit 1
fi
echo 'PASS: Native Android activity launched, rendered FitnessDex UI, persisted storage after restart and produced screenshot.'
echo 'NOTE: Visual parity, login and reminders still require separate acceptance tests.'
