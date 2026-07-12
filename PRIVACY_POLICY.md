# MileTrack Privacy Policy

**Last updated:** July 12, 2026
**App:** MileTrack (`app.lovable.miletrack`)
**Contact:** MileTrack.Help@hotmail.com

MileTrack is a personal mileage tracker. This policy describes exactly what
data the app handles, where it lives, and whether any of it leaves your
device. In plain terms: **MileTrack stores your data on your phone. It does
not have user accounts, does not upload your trips to any server, and does
not share your data with anyone.**

---

## 1. What data the app collects

MileTrack only collects the data you generate by using it:

| Category | What it is | When it's collected |
|---|---|---|
| **Precise location (GPS)** | Latitude, longitude, timestamp, speed, accuracy | Only while auto-detect is enabled or a trip is actively being recorded |
| **Trip records** | Start/end time, distance, duration, average and max speed, route (a series of GPS points), category (business/personal), your notes | Recorded automatically while a trip is active; classification and notes are added by you |
| **Fuel entries** | Date, gallons, price, station name, odometer, optional receipt photo | Only when you manually add a fuel entry |
| **Receipt photos** | Images you attach to fuel entries | Only when you choose to attach a photo |
| **Settings** | Distance unit, mileage rate, thresholds, theme, opt-in preferences | Whenever you change settings |

MileTrack does **not** collect: your name, email, phone number, contacts,
device identifiers, advertising IDs, installed apps, or usage analytics.
There is no sign-up, sign-in, or account.

## 2. Where your data is stored

All data is stored **locally on your device** using standard app storage
(IndexedDB and preferences). Nothing is uploaded to a MileTrack server
because MileTrack does not operate a server that receives your data.

- Uninstalling the app deletes your data.
- Android auto-backup to Google Drive is **disabled** for this app
  (`android:allowBackup="false"`), so your GPS history and receipts are not
  copied to your Google account.
- You can export your data yourself as a JSON backup file or a PDF report
  from the Settings screen. Where you send that file is entirely your
  choice; MileTrack is not involved.

## 3. What data leaves your device

MileTrack makes network requests in only these situations:

1. **Map tiles and vector data (Google Maps).** When a trip route is
   displayed on a map, your device fetches map tiles from Google's servers.
   Google receives the map coordinates being viewed, per Google's own
   [Maps Terms](https://cloud.google.com/maps-platform/terms) and
   [Privacy Policy](https://policies.google.com/privacy). Google receives
   the tile area — not your trip database.
2. **Reverse geocoding — OFF BY DEFAULT.** If you turn on
   *Settings → Reverse Geocode Addresses*, the app will send the
   coordinates of a trip's start and end points to a third-party geocoding
   service (OpenStreetMap Nominatim, or Google if configured) to convert
   coordinates into a street address. Only those two coordinate pairs per
   trip are sent, never your full route. This is disabled unless you turn
   it on.
3. **Nothing else.** MileTrack does not send trip routes, fuel entries,
   receipts, exports, or settings to any server. There is no analytics,
   telemetry, crash reporting, or advertising SDK.

## 4. Why the app uses each Android permission

- **Location (fine, coarse):** to record the GPS points that make up a trip
  and to detect when a drive begins.
- **Background location:** so a recorded trip keeps recording accurately
  when your screen turns off or you switch to another app. Used only while
  a trip is being tracked or auto-detect is enabled.
- **Foreground service + foreground service (location):** required by
  Android to run continuous GPS reliably while the app is not in the
  foreground. A persistent notification tells you when tracking is active.
- **Notifications:** to show the tracking notification and to prompt you
  when a trip appears to have ended.
- **Ignore battery optimizations (optional, requested only if you tap the
  Settings button):** so Android does not kill GPS mid-trip on aggressive
  battery-saver phones.
- **Internet:** for map tiles and — if you opt in — reverse geocoding.

MileTrack does **not** request access to your camera, microphone,
contacts, phone state, SMS, calendar, files outside the app, or any
device identifier.

## 5. Your control over your data

Because everything is on-device:

- **Export:** Settings → Export creates a JSON or PDF file you can save
  or share yourself.
- **Delete a trip or entry:** delete it from the app.
- **Delete everything:** uninstall MileTrack, or clear the app's storage
  in Android Settings → Apps → MileTrack → Storage → Clear data.

There is no MileTrack account to close and no server-side data for us to
delete on your behalf, because there is no server-side data.

## 6. Children

MileTrack is not directed at children under 13, and we do not knowingly
collect data from anyone. Because the app collects no personal identifiers,
we have no way to know a user's age.

## 7. Security

- Data stays on-device.
- The Android release build has debugging disabled and Android auto-backup
  disabled to prevent your GPS history from being exfiltrated by physical
  access.
- Network connections are restricted by an in-app content security policy
  to only the map/geocoding endpoints listed above.
- Because there is no account or cloud sync, there is no server for
  attackers to breach.

## 8. Changes to this policy

If we change how data is handled, we will update this document and the
"Last updated" date at the top. Meaningful changes will be highlighted in
the app's release notes.

## 9. Contact

Questions about this policy: _Replace with your support email before
publishing._
