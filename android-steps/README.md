# FitnessDex Android — single-app build

The APK launches the FitnessDex web interface, preserving its signed-in cloud account and exercise logging. The same APK includes the native Health Connect reader. There is **no separate pedometer app**.

## Step tracking

- From Daily steps, connect the phone once. The Android app requests Health Connect Steps read access and, where supported, background-read access.
- The pairing token is upload-only and encrypted by Android Keystore; the web UI never holds the stored native token.
- A successful pairing immediately uploads the last seven days of Health Connect aggregates. Empty Health Connect days do not become invented zero totals.
- The Android launcher uses Android Browser Helper's standard implementation. Periodic WorkManager uploads run at Android's 15-minute minimum when background permission is granted. Tap **Update steps now** for immediate Health Connect catch-up. **Android can delay background work; this is not constant real-time daily tracking.**
- Dedicated walk/hike/run sessions can separately activate the existing foreground sensor service for provisional 10-second step updates. These are not added twice to the daily total.
- The UI labels stale totals instead of calling them current. Samsung Health must actually have written its steps to Health Connect.

## Release quality gates

Build Android with JDK 17 and Gradle 8.13. Run the Node smoke test, Android Gradle compilation, and a real-device acceptance check for pairing, first upload, open-app refresh, background refresh, a walk, pause/resume/finish, and cloud restoration. CI compilation **does not replace real-device validation**.

The current automated GitHub APK builds use ephemeral debug signing. **Future seamless APK updates are not yet guaranteed**. Before a later release, configure a private persistent release signing key in GitHub Secrets, then migrate to that signed series. Never overwrite a published APK with a differently signed build and never commit a private keystore.
