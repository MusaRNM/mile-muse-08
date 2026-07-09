# Android build guide

MileTrack ships as a Capacitor Android app. Everything below assumes you have
Android Studio + JDK 17 installed and an Android device or emulator connected.

## First-time setup

```bash
bun install
bun run android:add          # generates the /android native project (once)
bun run android:sync         # builds the web bundle and copies it into /android
bun run android:open         # opens Android Studio
```

Then in Android Studio press **Run ▶** with your device selected.

## Required AndroidManifest.xml permissions

After `bun run android:add`, open
`android/app/src/main/AndroidManifest.xml` and make sure these permissions are
declared inside `<manifest>` (add any that are missing — Capacitor plugins add
most of them automatically on sync, but background location and notifications
must be present for tracking to work while the app is closed):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

## Iterating

Every time you change web code:

```bash
bun run android:sync         # rebuild + copy to android/
```

Then re-run from Android Studio (or `bun run android:run` to build + install +
launch on the connected device in one step).

## Notes

- Background GPS uses `@capacitor-community/background-geolocation`, which
  shows a persistent foreground-service notification while a trip is
  recording — Android requires this for background location.
- `POST_NOTIFICATIONS` is prompted on Android 13+ the first time we schedule
  a local notification. `ACCESS_BACKGROUND_LOCATION` opens the system
  settings screen; the user must pick **Allow all the time**.
- `webContentsDebuggingEnabled` is on so you can inspect the WebView from
  Chrome DevTools at `chrome://inspect`. Turn it off before shipping.
