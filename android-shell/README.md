# FitnessDex Stage 2: isolated Android shell experiment

**Not a release. Not approved for installation on the user's phone.**

This directory packages the restored v0.8.7 **unchanged PWA source** in a
Capacitor 8 Android WebView. It does not contain Health Connect, a step counter,
movement sessions, a cloud schema migration, new notifications, or a signing key.

## Scope and safeguards

- Work is restricted to branch `stage2/android-shell-20261114`.
- `main`, GitHub Pages, existing `index.html`, local saves and Supabase stay unchanged.
- The generated `www/` directory is **not** the PWA source of truth.
- Native-only safe-area rules are appended to the generated CSS to avoid Android
  status and gesture bars covering content. Original PWA `ui.css` stays unchanged;
  an automated test strictly checks the sole additive CSS difference.
- The generated native HTML has four adaptations:
  1. Replace the remote Supabase CDN script with an offline local bundle.
  2. Suppress the *PWA-only* web update checker (APK releases update natively).
  3. Suppress service-worker registration (resources ship within the APK).
  4. Route backup exports through the Android Save dialog. Import uses the shared
     FitnessDex validation and the Android file picker.
- No release signing key is generated, stored, committed, or uploaded.
- Debug builds are for isolated CI/emulator testing only; they are **not** the
  permanently signed release build and must **never** be presented as an update.
- The app package identifier is `io.github.gy8s.fitnessdex`. Treat it as
  provisional until the release identity/signing plan is formally verified.
- Browser PWA and Android WebView have **separate localStorage**; migration is
  not automatic. Do not switch to real user data until migration tests pass.
- Cloud OTP callback/deep link behaviour is **not** adapted yet.
- Web Push is **not** supported by this prototype. Background reminder parity
  with the existing PWA is an explicit blocker before Android replacement.

## Running locally (development computer with Node 22+, JDK and Android SDK)

```sh
cd android-shell
npm install
npm run build:web
npm run test:bundle
npx cap add android
npx cap sync android
cp native/*.java android/app/src/main/java/io/github/gy8s/fitnessdex/
cd android
./gradlew assembleDebug
```

The generated Android project is intentionally disposable during the proof stage.
Before any release, check in a reviewed stable native Android project, commit an
npm lockfile, configure an offline-safe authentication callback, implement and
prove native background-reminder parity, test persistent Android storage, and
establish protected **permanent** signing credentials.

The branch's Android workflow builds an unsigned-for-release debug probe,
installs it on an emulator, checks the activity stays alive, and captures a
screenshot for review. It does **not** publish or attach an APK.

## Acceptance gate

1. Compare Android screenshots and all core navigation paths against v0.8.7.
2. Prove create/edit/export/import/reopen on disposable test data.
3. Prove authentication and cloud-save conflict handling with a test account.
4. Prove native background reminders deliver with the app closed.
5. Prove a permanently signed release install and signed in-place update,
   retaining application data. Never use the transient CI debug key.
6. Only after the above, consider a user-device acceptance build.

**No step tracking until the base Android app is reliable.**
