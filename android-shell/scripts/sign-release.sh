#!/usr/bin/env bash
set -euo pipefail

# Arguments: SDK build-tools directory, already-aligned unsigned APK, output APK.
# The release keystore and credentials are supplied by the key owner.
tools="${1:?Android SDK build-tools directory required}"
input="${2:?Unsigned APK required}"
output="${3:?Signed APK output path required}"
: "${FITNESSDEX_KEYSTORE:?Set the protected keystore path}"
: "${FITNESSDEX_KEY_ALIAS:?Set the key alias}"
: "${FITNESSDEX_STORE_PASSWORD:?Set the keystore password}"
: "${FITNESSDEX_CERT_SHA256:?Set the expected signing certificate SHA-256}"

"$tools/zipalign" -c -P 16 4 "$input"
# Write to a temporary file so a mismatch never leaves a usable output APK.
tmp="$(mktemp "${output}.XXXXXX")"
trap 'rm -f "$tmp" "$tmp.idsig"' EXIT
"$tools/apksigner" sign --ks "$FITNESSDEX_KEYSTORE" --ks-key-alias "$FITNESSDEX_KEY_ALIAS" \
    --ks-pass env:FITNESSDEX_STORE_PASSWORD --v4-signing-enabled false \
    --out "$tmp" "$input"
cert="$("$tools/apksigner" verify --print-certs "$tmp" |
    awk '/Signer #1 certificate SHA-256 digest:/ {print $NF}')"
if [[ "$cert" != "$FITNESSDEX_CERT_SHA256" ]]; then
    echo "APK signer does not match the expected FitnessDex certificate" >&2
    exit 1
fi
mv "$tmp" "$output"
echo "Verified APK signing certificate: $cert"
