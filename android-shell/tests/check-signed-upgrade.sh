#!/usr/bin/env bash
set -euo pipefail

package=io.github.gy8s.fitnessdex
proof="${RUNNER_TEMP:?}/fitnessdex-signing-proof"
fixture=android-shell/tests/results/FitnessDex_PWA_migration.json

tap() { python3 android-shell/tests/tap-android-ui.py "$@"; }
launch() { adb shell am start -W -n "$package/.MainActivity"; }
check_version() {
    adb shell dumpsys package "$package" | awk -v expected="$1" '
        $1 == "versionCode=" expected {found=1}
        END {exit found ? 0 : 1}'
}
swipe_vertical() {
    local size width height
    size="$(adb shell wm size | tail -1 | awk '{print $NF}' | tr -d '\r')"
    width="${size%x*}"
    height="${size#*x}"
    adb shell input swipe "$((width / 2))" "$((height * $1 / 100))" \
        "$((width / 2))" "$((height * $2 / 100))" 500
}
open_history() {
    tap 'More' 20
    if ! tap 'History & data( Edit, export or import records.*)?' 2; then
        swipe_vertical 75 33
        tap 'History & data( Edit, export or import records.*)?'
    fi
}
export_backup() {
    if ! tap 'Data tools' 2; then
        # The Android file picker can return to History with its header scrolled offscreen.
        swipe_vertical 25 80
        tap 'Data tools'
    fi
    tap 'Export complete backup'
    tap 'Save'
    local path=""
    for attempt in $(seq 1 20); do
        path="$(adb shell 'find /sdcard/Download /sdcard/Documents -maxdepth 1 -name "FitnessDex_v04_backup_*.json" -size +0c -type f -print' | tr -d '\r' | head -n 1)"
        if [[ -n "$path" ]]; then break; fi
        sleep 1
    done
    test -n "$path"
    adb pull "$path" "$1"
    adb shell rm "$path"
}

cleanup() {
    local result="$?"
    trap - EXIT
    set +e
    adb exec-out screencap -p > android-shell/tests/results/signed-upgrade.png
    # The debug probe uses a different signing key and runs after this proof.
    adb uninstall "$package"
    exit "$result"
}
trap cleanup EXIT

adb install "$proof/before.apk"
adb shell mkdir -p /sdcard/Download /sdcard/Documents
adb shell 'find /sdcard/Download /sdcard/Documents -maxdepth 1 -name "FitnessDex_v04_backup_*.json" -type f -delete'
check_version 18
launch
open_history
adb push "$fixture" /sdcard/Download/FitnessDex_Signed_Update_Test.json
tap 'Data tools'
tap 'Import validated backup'
if ! tap 'FitnessDex_Signed_Update_Test\.json' 2; then
    tap 'Show roots|Open navigation drawer'
    tap 'Downloads'
    tap 'FitnessDex_Signed_Update_Test\.json'
fi
tap 'OK'
export_backup "$proof/before.json"
adb shell am force-stop "$package"
adb install -r "$proof/after.apk"
check_version 19
launch
tap 'Steps today( [0-9,]+)?' 10
open_history
export_backup "$proof/after.json"

node - "$fixture" "$proof/before.json" "$proof/after.json" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const [source, before, after] = process.argv.slice(2).map(path => JSON.parse(fs.readFileSync(path, 'utf8')));
for (const key of ['logs', 'recoveryDays', 'v5', 'v6', 'v7', 'v8', 'v9']) {
  assert.deepEqual(before[key], source[key], 'Initial signed install changed ' + key);
  assert.deepEqual(after[key], before[key], 'Signed update changed ' + key);
}
console.log('PASS: Signed release installed and updated in place with history and settings intact');
NODE
