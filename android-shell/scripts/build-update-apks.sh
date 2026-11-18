#!/usr/bin/env bash
set -euo pipefail

output="${1:?Output directory required}"
mkdir -p "$output"

unset FITNESSDEX_TEST_SUPABASE_KEY
root="$(git rev-parse --show-toplevel)"
baseline="$(mktemp -d)"
rmdir "$baseline"
git -C "$root" worktree add --detach "$baseline" 4e748994a368e0961f21e6980e44cbe30f3d5394
trap 'git -C "$root" worktree remove --force "$baseline"' EXIT
ln -s "$PWD/node_modules" "$baseline/android-shell/node_modules"

apk=android/app/build/outputs/apk/release/app-release-unsigned.apk
(
    cd "$baseline/android-shell"
    npm run build:web
    npx --no-install cap sync android
    cd android
    bash gradlew --no-daemon assembleRelease
)
cp "$baseline/android-shell/$apk" "$output/before-unsigned.apk"

npm run build:web
npm run test:bundle
npx --no-install cap sync android
(cd android && bash gradlew --no-daemon assembleRelease)
cp "$apk" "$output/after-unsigned.apk"
