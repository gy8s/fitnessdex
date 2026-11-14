# FitnessDex Steps — Android companion

This is a native read-only Health Connect connector for FitnessDex.

It reads only aggregate steps for the last seven days and sends daily dates and totals to the paired FitnessDex account over HTTPS. It never requests heart rate, location, sleep or medical records, and it does not alter exercise logs.

The user creates a private pairing code in FitnessDex under More → Daily steps. That code authorises step uploads only; Android Keystore encrypts it on the phone. The user can revoke pairing in FitnessDex.

The app can sync whenever opened. Automatic background sync is optional and requires a separate Health Connect permission; Android may delay it because of battery restrictions.

Build with Gradle 8.13, Java 17 and Android SDK 36. The GitHub Actions workflow creates a development APK. A debug-signed APK may require uninstall/reinstall to update, so a permanent signing key should be configured before wider distribution.

Development prototype, not published on Google Play. No health records or user secrets are stored in this repository.

Version 0.1.1: Missing Health Connect data is reported instead of uploaded as seven zeros. Updates may arrive sooner when the companion is reopened, while optional background sync attempts every 30 minutes. Android may delay jobs for battery reasons.

If no steps appear, open Health Connect > Data and access > Activity > Steps; verify Samsung Health has written step records and that it has Write Steps permission. Installing the companion and granting Read Steps alone do not guarantee Health Connect has any recorded steps.

## Automatic updates (v0.1.2)

After the device is paired and step access has been granted, tap **Enable automatic syncing · one-time setup** and approve Health Connect's separate background-read permission. FitnessDex Steps schedules WorkManager to upload read-only seven-day aggregates at Android's 15-minute minimum interval. Android can defer these jobs to conserve battery; this is not real-time streaming. Reopening the companion immediately checks for stale totals and syncs if the previous sync was more than 90 seconds ago.

FitnessDex's browser view polls the cloud about once a minute while Home or Steps is visible. Its Refresh button only fetches cloud data, never reads Health Connect directly. No additional health data or exercise logs are requested.

The GitHub development APK is debug signed; Android may reject installation over an earlier release with a different signature. A one-time uninstall/reinstall and fresh pairing may be necessary. Long-term seamless updates require a persistent signing key stored as a protected GitHub Actions secret, rather than disposable debug APK signatures.

## One-app Android version (v0.2.0)

The main launcher now opens FitnessDex in Chrome's Trusted Web Activity mode (or a Custom Tab if website verification is missing), preserving the existing Chrome-origin game, data, cloud login and web push notifications. Native Health Connect setup remains a screen inside the **same APK**, reached by tapping a pairing link in FitnessDex's Daily Steps page. The user does not need to install or open a second companion app.

The private, upload-only pairing token travels from the signed-in web page through a user-clicked Android intent link. Android Keystore encrypts it on the phone. Existing WorkManager sync reads only seven-day aggregate steps and attempts uploads about every 15 minutes, subject to Android battery policies. No new cloud tables or exercise save changes.

**Limitations:** Full-screen TWA requires a Digital Asset Links JSON at https://gy8s.github.io/.well-known/assetlinks.json (domain root, not /fitnessdex/), with the permanent APK signing fingerprint. Otherwise Chrome displays a Custom Tab toolbar. The current build remains debug signed on GitHub Actions; smooth future APK upgrades require a persistent private release signing key in protected GitHub secrets. Do not commit a keystore.

## Movement sessions (v0.2.1)

The FitnessDex web interface now records walk, hike and run sessions. Server-side session control saves active segments across pauses and resumes. Health Connect aggregate step totals are reconciled independently for each active segment on the Android 15-minute WorkManager cycle, and are never added again to the daily step total. Displayed session steps may lag until the next Android sync; the session timer is live while the screen is open. This is **not yet second-by-second live sensor streaming**, which requires a foreground health sensor service and a bridge into the Chrome-hosted web app.

## Live step preview (Android v0.2.2)

During an active FitnessDex walk, hike or run, tap **Switch on live step updates** to open the native physical-activity permission screen in the same APK. A short-lived foreground health service (with an ongoing notification) uses the low-power TYPE_STEP_COUNTER sensor and uploads *provisional* session and daily totals roughly every ten seconds. It stops after Finish. The Health Connect background sync remains authoritative, handles pause/resume intervals, and never adds these session steps to daily steps again.

Live tracking is intentionally not an always-running foreground service. Outside dedicated exercise, Android/Samsung Health keeps collecting steps; Health Connect sync catches up. This first version requires a second tap to activate live sensor mode after Start because Chrome requires a user gesture to launch native app intents.
