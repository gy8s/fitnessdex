#!/usr/bin/env bash
set -euo pipefail
umask 077

repo=gy8s/fitnessdex
environment=fitnessdex-android-signing
alias=fitnessdex
directory="$(cd -- "$(dirname -- "$0")/.." && pwd)/.signing"
keystore="$directory/fitnessdex-release.p12"
certificate="$directory/fitnessdex-release.cer"
mkdir -p -- "$directory"
chmod 700 "$directory"

if [[ "$(gh api --hostname github.com user --jq .login)" != gy8s ]]; then
    echo 'Sign in to the GitHub CLI as the FitnessDex repository owner.' >&2
    exit 1
fi
secrets="$(gh secret list --repo "$repo" --env "$environment" --json name --jq '.[].name')"
stored_certificate="$(gh variable list --repo "$repo" --env "$environment" --json name,value \
    --jq '.[] | select(.name == "FITNESSDEX_CERT_SHA256") | .value')"
if [[ ! -f "$keystore" ]] && { [[ -n "$stored_certificate" ]] || grep -qxE 'FITNESSDEX_(KEYSTORE_BASE64|STORE_PASSWORD)' <<< "$secrets"; }; then
    echo 'This environment already has signing material. Recover the original keystore before continuing.' >&2
    exit 1
fi

read -rs -p 'FitnessDex keystore password: ' FITNESSDEX_STORE_PASSWORD
printf '\n'
if [[ ! -f "$keystore" ]]; then
    read -rs -p 'Repeat the keystore password: ' confirmation
    printf '\n'
    if [[ "$FITNESSDEX_STORE_PASSWORD" != "$confirmation" || "${#FITNESSDEX_STORE_PASSWORD}" -lt 16 ]]; then
        echo 'Enter the same password twice and use at least 16 characters.' >&2
        exit 1
    fi
    unset confirmation
    FITNESSDEX_STORE_PASSWORD="$FITNESSDEX_STORE_PASSWORD" keytool -genkeypair \
        -keystore "$keystore" -storetype PKCS12 -storepass:env FITNESSDEX_STORE_PASSWORD \
        -alias "$alias" -dname 'CN=FitnessDex' -keyalg RSA -keysize 3072 -validity 10000
fi

FITNESSDEX_STORE_PASSWORD="$FITNESSDEX_STORE_PASSWORD" keytool -exportcert \
    -keystore "$keystore" -storepass:env FITNESSDEX_STORE_PASSWORD -alias "$alias" -file "$certificate"
fingerprint="$(sha256sum "$certificate" | cut -d ' ' -f 1)"
if [[ -n "$stored_certificate" && "$stored_certificate" != "$fingerprint" ]]; then
    echo 'This key differs from the existing FitnessDex certificate. GitHub has not been changed.' >&2
    exit 1
fi

# Record the public fingerprint first so a retry cannot replace a partially provisioned key.
gh variable set FITNESSDEX_CERT_SHA256 --repo "$repo" --env "$environment" --body "$fingerprint"
base64 -w 0 "$keystore" | gh secret set FITNESSDEX_KEYSTORE_BASE64 --repo "$repo" --env "$environment"
printf '%s' "$FITNESSDEX_STORE_PASSWORD" | gh secret set FITNESSDEX_STORE_PASSWORD --repo "$repo" --env "$environment"
unset FITNESSDEX_STORE_PASSWORD
printf '\nGitHub signing secrets saved. Back up this password-protected keystore:\n%s\n' "$keystore"
printf 'Certificate SHA-256: %s\n' "$fingerprint"
