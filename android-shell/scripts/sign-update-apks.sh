#!/usr/bin/env bash
set -euo pipefail

proof="${1:?Proof directory required}"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Android SDK path required}}"
tools="$sdk/build-tools/36.0.0"
if [[ ! -x "$tools/apksigner" ]]; then
    "$sdk/cmdline-tools/latest/bin/sdkmanager" 'build-tools;36.0.0'
fi

for build in before after; do
    bash scripts/sign-release.sh "$tools" "$proof/$build-unsigned.apk" "$proof/$build.apk"
    "$tools/aapt" dump badging "$proof/$build.apk" | awk '
        /^package:/ {print}
        /^application-debuggable/ {debuggable=1}
        END {exit debuggable ? 1 : 0}'
done
