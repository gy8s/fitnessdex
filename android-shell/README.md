# FitnessDex Stage 2: isolated Android shell experiment

**Not a release. Not approved for installation on the user's phone.**

This directory packages the restored v0.8.7 **unchanged PWA source** in a
Capacitor 8 Android WebView. It does not contain Health Connect, a step counter,
movement sessions or a cloud schema migration.

## Scope and safeguards

- Work is restricted to branch `stage2/android-shell-20261114`.
- `main`, GitHub Pages, existing `index.html`, local saves and Supabase stay unchanged.
- The generated `www/` directory is **not** the PWA source of truth.
- The Android activity handles system bar, display cutout and keyboard insets.
  It keeps status icons light against the app's dark background and uses a
  light background for Android's three-button bar. The browser and Android
  builds use the same stylesheet.
- The generated native HTML has five adaptations:
  1. Replace the remote Supabase CDN script with an offline local bundle.
  2. Suppress the *PWA-only* web update checker (APK releases update natively).
  3. Suppress service-worker registration (resources ship within the APK).
  4. Route backup exports through the Android Save dialog. Import uses the shared
     FitnessDex validation and the Android file picker.
  5. Route profile saves and recovery snapshots through app-private Android
     files. Android acknowledges each write after syncing and replacing the
     file. Earlier Android prototype saves migrate from WebView storage on read.
- The release signing key and password belong in the owner’s protected storage.
  CI generates a disposable proof key and publishes only test evidence.
- Debug builds are for isolated CI/emulator testing only; they are **not** the
  permanently signed release build and must **never** be presented as an update.
- The app package identifier is `io.github.gy8s.fitnessdex`. Treat it as
  provisional until the release identity/signing plan is formally verified.
- The browser PWA and Android app keep separate profiles. Move data between
  them using Export complete backup and Import validated backup.
- Android uses a PKCE email callback for an existing account. The Android
  callback must be added to the hosted Auth redirect allow list before release.
  CI uses local Supabase and a disposable mailbox for this test.
- Android schedules opted-in water and supplement reminders locally. A recent
  water log, a met water goal, or a completed supplement check-in can suppress a
  reminder. Android can delay inexact alarms under battery restrictions. An
  explicit system force-stop suspends delivery until the app is opened again.

## Running locally (development computer with Node 22+, JDK and Android SDK)

```sh
cd android-shell
npm ci
npm run build:web
npm run test:bundle
npx cap sync android
cd android
./gradlew assembleDebug
```

The native project and npm lockfile are versioned. Capacitor copies the generated
web assets during sync. CI uses an emulator and uploads screenshots and test logs.

## Signing a release candidate

From `android-shell`, build the production bundle with `npm run build:web` and
`npm run test:bundle`, then run `npx cap sync android`. Set an increasing
`fitnessdexVersionCode` with `bash gradlew assembleRelease -PfitnessdexVersionCode=3`
from the `android` directory. Use the current release history when choosing the
actual version code.

From `android-shell`, pass the Android SDK build-tools path, the unsigned APK,
and the output APK to `bash scripts/sign-release.sh`. Supply `FITNESSDEX_KEYSTORE`,
`FITNESSDEX_KEY_ALIAS`, `FITNESSDEX_STORE_PASSWORD`, and the independently recorded
`FITNESSDEX_CERT_SHA256` from the maintained release keystore. Retain a protected
backup of the keystore and keep the same certificate for subsequent APKs.

## Acceptance gate

1. Compare Android screenshots and all core navigation paths against v0.8.7.
2. Prove create/edit/export/import/reopen on disposable test data.
3. Prove authentication and cloud-save conflict handling with a test account.
4. Prove native background reminders deliver with the app closed.
5. Prove a permanently signed release install and signed in-place update,
   retaining application data. Never use the transient CI debug key.
6. Only after the above, consider a user-device acceptance build.

**No step tracking until the base Android app is reliable.**
