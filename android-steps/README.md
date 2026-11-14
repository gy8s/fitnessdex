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
