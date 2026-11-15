#!/usr/bin/env bash
set -euo pipefail

output="${1:?Output directory required}"
mkdir -p "$output"

unset FITNESSDEX_TEST_SUPABASE_KEY
npm run build:web
npm run test:bundle
npx --no-install cap sync android

apk=android/app/build/outputs/apk/release/app-release-unsigned.apk
(cd android && bash gradlew --no-daemon assembleRelease -PfitnessdexVersionCode=2)
cp "$apk" "$output/before-unsigned.apk"
(cd android && bash gradlew --no-daemon assembleRelease -PfitnessdexVersionCode=3)
cp "$apk" "$output/after-unsigned.apk"
