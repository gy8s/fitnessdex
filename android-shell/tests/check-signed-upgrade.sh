#!/usr/bin/env bash
set -euo pipefail

package=io.github.gy8s.fitnessdex
proof="${RUNNER_TEMP:?}/fitnessdex-signing-proof"
fixture=android-shell/tests/results/FitnessDex_PWA_migration.json

tap() { python3 android-shell/tests/tap-android-ui.py "$@"; }
launch() { adb shell am start -n "$package/.MainActivity"; }
check_version() {
    adb shell dumpsys package "$package" | awk -v expected="$1" '
        $1 == "versionCode=" expected {found=1}
        END {exit found ? 0 : 1}'
}
open_history() {
    tap 'More'
    tap 'History & data'
}
export_backup() {
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

# Clear the previous debug app once, before the first signed release install.
adb uninstall "$package"
adb install "$proof/before.apk"
adb shell 'find /sdcard/Download /sdcard/Documents -maxdepth 1 -name "FitnessDex_v04_backup_*.json" -type f -delete'
check_version 2
launch
open_history
adb push "$fixture" /sdcard/Download/FitnessDex_Signed_Update_Test.json
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
check_version 3
launch
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
