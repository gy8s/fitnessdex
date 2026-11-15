#!/usr/bin/env bash
set -euo pipefail

proof="${RUNNER_TEMP:?}/fitnessdex-signing-proof"
mkdir -p "$proof"
chmod 700 "$proof"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Android SDK path required}}"
tools="$sdk/build-tools/36.0.0"
if [[ ! -x "$tools/apksigner" ]]; then
    "$sdk/cmdline-tools/latest/bin/sdkmanager" 'build-tools;36.0.0'
fi
test -x "$tools/apksigner"

# This disposable key proves the release build/update flow in CI. A release
# candidate must be signed separately with the owner's permanent certificate.
export FITNESSDEX_KEYSTORE="$proof/ci-only.p12"
export FITNESSDEX_KEY_ALIAS="fitnessdex-ci"
export FITNESSDEX_STORE_PASSWORD="$(openssl rand -hex 24)"
trap 'rm -f "$FITNESSDEX_KEYSTORE"' EXIT
keytool -genkeypair -keystore "$FITNESSDEX_KEYSTORE" -storetype PKCS12 \
    -storepass:env FITNESSDEX_STORE_PASSWORD -alias "$FITNESSDEX_KEY_ALIAS" \
    -dname "CN=FitnessDex CI update proof" -keyalg RSA -keysize 2048 -validity 3
export FITNESSDEX_CERT_SHA256="$(
    keytool -exportcert -keystore "$FITNESSDEX_KEYSTORE" -storepass:env FITNESSDEX_STORE_PASSWORD \
        -alias "$FITNESSDEX_KEY_ALIAS" | openssl dgst -sha256 | awk '{print $NF}'
)"

# Re-bundle with the normal production HTTPS configuration and manifest.
unset FITNESSDEX_TEST_SUPABASE_KEY
npm run build:web
npm run test:bundle
npx --no-install cap sync android
(cd android && bash gradlew --no-daemon assembleRelease -PfitnessdexVersionCode=2)
bash scripts/sign-release.sh "$tools" android/app/build/outputs/apk/release/app-release-unsigned.apk "$proof/before.apk"
(cd android && bash gradlew --no-daemon assembleRelease -PfitnessdexVersionCode=3)
bash scripts/sign-release.sh "$tools" android/app/build/outputs/apk/release/app-release-unsigned.apk "$proof/after.apk"
for apk in "$proof/before.apk" "$proof/after.apk"; do
    "$tools/aapt" dump badging "$apk" | awk '
        /^package:/ {print}
        /^application-debuggable/ {debuggable=1}
        END {exit debuggable ? 1 : 0}'
done
