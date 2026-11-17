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
restart_after_save() {
  adb shell am force-stop "$PACKAGE"
  adb forward --remove tcp:9222
  adb shell am start -n "$PACKAGE/.MainActivity"
}
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
# A process alive is not enough. Inspect the actual WebView content and saved profile.
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID}"
adb reverse tcp:54321 tcp:54321
node android-shell/tests/check-webview.cjs first
node android-shell/tests/check-webview.cjs android-back
node android-shell/tests/check-reminders.cjs

adb forward --remove tcp:9222
adb shell pm clear "$PACKAGE"
adb shell am start -n "$PACKAGE/.MainActivity"
for attempt in $(seq 1 30); do
  PID="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID"; then break; fi
  sleep 3
done
test -n "$PID"
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID}"
node android-shell/tests/check-webview.cjs first
restart_after_save
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
node android-shell/tests/check-webview.cjs activity-save
restart_after_save
PID3=""
for attempt in $(seq 1 30); do
  PID3="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID3"; then break; fi
  sleep 3
done
test -n "$PID3" || { echo 'ERROR: App did not restart after disposable save'; exit 1; }
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID3}"
node android-shell/tests/check-webview.cjs activity-reopen
adb exec-out run-as "$PACKAGE" cat files/fitnessdex-v01.json | node -e '
  const assert = require("node:assert/strict");
  const profile = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  assert.equal(profile.logs.length, 1);
  assert.equal(profile.logs[0].notes, "FitnessDex disposable Android test");
  console.log("PASS: Android native file retained the confirmed walk after immediate force-stop");
'
node android-shell/tests/check-webview.cjs activity-edit
restart_after_save
PID4=""
for attempt in $(seq 1 30); do
  PID4="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID4"; then break; fi
  sleep 3
done
test -n "$PID4" || { echo 'ERROR: App did not restart after activity edit'; exit 1; }
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID4}"
node android-shell/tests/check-webview.cjs activity-edit-reopen
node android-shell/tests/check-webview.cjs activity-delete
restart_after_save
PID5=""
for attempt in $(seq 1 30); do
  PID5="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID5"; then break; fi
  sleep 3
done
test -n "$PID5" || { echo 'ERROR: App did not restart after deletion'; exit 1; }
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID5}"
node android-shell/tests/check-webview.cjs activity-delete-reopen
node android-shell/tests/check-webview.cjs activity-restore
restart_after_save
PID6=""
for attempt in $(seq 1 30); do
  PID6="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID6"; then break; fi
  sleep 3
done
test -n "$PID6" || { echo 'ERROR: App did not restart after recovery restore'; exit 1; }
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID6}"
node android-shell/tests/check-webview.cjs activity-restore-reopen
node android-shell/tests/check-webview.cjs backup-export
python3 android-shell/tests/tap-android-ui.py 'Save'

BACKUP_PATH=""
for attempt in $(seq 1 20); do
  BACKUP_PATH="$(adb shell 'find /sdcard/Download /sdcard/Documents -maxdepth 1 -type f -name "FitnessDex_v04_backup_*.json" -size +0c -print' | tr -d '\r' | head -n 1)"
  if test -n "$BACKUP_PATH"; then break; fi
  sleep 1
done
test -n "$BACKUP_PATH" || { echo 'ERROR: Android Save did not produce a backup file'; exit 1; }
BACKUP_COPY="android-shell/tests/results/exported-backup.json"
adb pull "$BACKUP_PATH" "$BACKUP_COPY"
node - "$BACKUP_COPY" <<'NODE'
const assert = require('node:assert/strict');
const backup = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
assert.equal(backup.version, 5);
assert.equal(backup.logs.length, 1);
const walk = backup.logs[0];
assert.equal(walk.id, 'e045');
assert.equal(walk.value, 1.6);
assert.equal(walk.minutes, 20);
assert.equal(walk.notes, 'FitnessDex disposable Android test EDITED');
console.log('PASS: Android Save wrote the edited walk to a real JSON backup file');
NODE

node android-shell/tests/check-webview.cjs activity-delete
node android-shell/tests/check-webview.cjs backup-import
if ! python3 android-shell/tests/tap-android-ui.py 'FitnessDex_v04_backup_.*\.json' 2; then
  python3 android-shell/tests/tap-android-ui.py 'Show roots|Open navigation drawer'
  python3 android-shell/tests/tap-android-ui.py 'Downloads'
  python3 android-shell/tests/tap-android-ui.py 'FitnessDex_v04_backup_.*\.json'
fi
python3 android-shell/tests/tap-android-ui.py 'OK'
node android-shell/tests/check-webview.cjs backup-import-verify "$BACKUP_COPY"

restart_after_save
PID7=""
for attempt in $(seq 1 30); do
  PID7="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID7"; then break; fi
  sleep 3
done
test -n "$PID7" || { echo 'ERROR: App did not restart after backup import'; exit 1; }
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID7}"
node android-shell/tests/check-webview.cjs activity-restore-reopen
node android-shell/tests/check-webview.cjs backup-import-verify "$BACKUP_COPY"

PWA_BACKUP="android-shell/tests/results/FitnessDex_PWA_migration.json"
test -s "$PWA_BACKUP"
adb push "$PWA_BACKUP" "/sdcard/Download/$(basename "$PWA_BACKUP")"
node android-shell/tests/check-webview.cjs backup-import 1
if ! python3 android-shell/tests/tap-android-ui.py 'FitnessDex_PWA_migration\.json' 2; then
  python3 android-shell/tests/tap-android-ui.py 'Show roots|Open navigation drawer'
  python3 android-shell/tests/tap-android-ui.py 'Downloads'
  python3 android-shell/tests/tap-android-ui.py 'FitnessDex_PWA_migration\.json'
fi
python3 android-shell/tests/tap-android-ui.py 'OK'
node android-shell/tests/check-webview.cjs migration-verify "$PWA_BACKUP"

restart_after_save
PID8=""
for attempt in $(seq 1 30); do
  PID8="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if test -n "$PID8"; then break; fi
  sleep 3
done
test -n "$PID8" || { echo 'ERROR: App did not restart after PWA migration'; exit 1; }
adb forward tcp:9222 "localabstract:webview_devtools_remote_${PID8}"
node android-shell/tests/check-webview.cjs migration-verify "$PWA_BACKUP"
echo 'PASS: PWA migration survived an Android force-stop and relaunch'
adb forward --remove tcp:9222

forward_upgrade_probe() {
  local pid=""
  for attempt in $(seq 1 30); do
    pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
    if test -n "$pid"; then break; fi
    sleep 3
  done
  test -n "$pid" || { echo 'ERROR: Android upgrade probe could not start'; exit 1; }
  adb forward tcp:9222 "localabstract:webview_devtools_remote_${pid}"
}

LEGACY_APK="$FITNESSDEX_LEGACY_BUILD/android-shell/android/app/build/outputs/apk/debug/app-debug.apk"
LEGACY_CHECK="$FITNESSDEX_LEGACY_BUILD/android-shell/tests/check-webview.cjs"
UPGRADE_BASELINE="android-shell/tests/results/upgrade-baseline.json"
test -s "$LEGACY_APK"
# Begin the upgrade test with a clean, disposable installation of the old APK.
# Never clear app data between installing the old APK and verifying the update.
adb uninstall "$PACKAGE"
adb install "$LEGACY_APK"
adb shell am start -n "$PACKAGE/.MainActivity"
forward_upgrade_probe
node "$LEGACY_CHECK" first
node "$LEGACY_CHECK" activity-save
# The old prototype depended on WebView flushing asynchronous writes to disk.
sleep 10
restart_after_save
forward_upgrade_probe
node "$LEGACY_CHECK" activity-reopen
node "$LEGACY_CHECK" activity-edit
sleep 10
restart_after_save
forward_upgrade_probe
node android-shell/tests/check-webview.cjs upgrade-baseline "$UPGRADE_BASELINE"
adb shell run-as "$PACKAGE" test ! -e files/fitnessdex-v01.json

adb shell am force-stop "$PACKAGE"
adb forward --remove tcp:9222
adb install -r "$APK"
adb shell dumpsys package "$PACKAGE" | grep -E 'versionCode=10([[:space:]]|$)'
adb shell am start -n "$PACKAGE/.MainActivity"
forward_upgrade_probe
node android-shell/tests/check-webview.cjs upgrade-verify "$UPGRADE_BASELINE"
adb exec-out run-as "$PACKAGE" cat files/fitnessdex-v01.json | node -e '
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const migrated = JSON.parse(fs.readFileSync(0, "utf8"));
  const original = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  assert.deepEqual(migrated.logs, original.profile.logs);
  console.log("PASS: In-place upgrade wrote the original walk to the native profile file");
' "$UPGRADE_BASELINE"

restart_after_save
forward_upgrade_probe
node android-shell/tests/check-webview.cjs upgrade-verify "$UPGRADE_BASELINE"
node android-shell/tests/check-cloud.cjs
VISUAL_DIR="android-shell/tests/results/visual"
# Compare like-for-like clean profiles with the v0.8.7 browser screenshots.
# The upgrade and recovery assertions are complete at this point.
adb forward --remove tcp:9222
adb shell pm clear "$PACKAGE"
adb shell am start -n "$PACKAGE/.MainActivity"
forward_upgrade_probe
node android-shell/tests/check-webview.cjs first
# Dismiss only the emulator's unrelated launcher ANR, if it appears.
if adb shell dumpsys window windows | grep -F 'Application Not Responding: com.android.launcher3' > /dev/null; then
  python3 android-shell/tests/tap-android-ui.py 'Close app'
fi
for width in 411 360; do
  if test "$width" -eq 360; then
    # Keep the original density. Changing it while Quickstep is active can hang the launcher.
    adb shell wm size 945x2400
    if adb shell dumpsys window windows | grep -F 'Application Not Responding: com.android.launcher3' > /dev/null; then
      python3 android-shell/tests/tap-android-ui.py 'Close app'
    fi
  fi
  for screen in home log dex more history care; do
    node android-shell/tests/check-webview.cjs screen-parity "$screen" "$VISUAL_DIR/web-screen-parity.json" "$width"
    # Allow the Android compositor to present the new WebView frame before screencap.
    sleep 1
    adb exec-out screencap -p > "$VISUAL_DIR/android-$width-$screen.png"
  done
done
adb forward --remove tcp:9222
if adb logcat -d -v brief | grep -q 'FATAL EXCEPTION'; then
  echo 'ERROR: Android fatal exception detected:'
  adb logcat -d -v brief | grep -A 22 'FATAL EXCEPTION' | head -n 65
  exit 1
fi
echo 'PASS: Native Android activity launched, rendered FitnessDex UI, persisted storage after restart and produced screenshot.'
