# FitnessDex Steps — Android companion

This is a native read-only Health Connect connector for FitnessDex.

It reads only aggregate steps for the last seven days and sends daily dates and totals to the paired FitnessDex account over HTTPS. It never requests heart rate, location, sleep or medical records, and it does not alter exercise logs.

The user creates a private pairing code in FitnessDex under More → Daily steps. That code authorises step uploads only; Android Keystore encrypts it on the phone. The user can revoke pairing in FitnessDex.

The app can sync whenever opened. Automatic background sync is optional and requires a separate Health Connect permission; Android may delay it because of battery restrictions.

Build with Gradle 8.13, Java 17 and Android SDK 36. The GitHub Actions workflow creates a development APK. A debug-signed APK may require uninstall/reinstall to update, so a permanent signing key should be configured before wider distribution.

Development prototype, not published on Google Play. No health records or user secrets are stored in this repository.
