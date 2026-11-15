#!/usr/bin/env bash
set -euo pipefail

proof="${RUNNER_TEMP:?}/fitnessdex-signing-proof"
mkdir -p "$proof"
chmod 700 "$proof"

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

bash scripts/build-update-apks.sh "$proof"
bash scripts/sign-update-apks.sh "$proof"
