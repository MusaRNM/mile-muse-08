# Google Play Data Safety — MileTrack

This document maps every answer you should enter in the Play Console
**Data safety** form to the actual behavior of the app, so the two match
and the listing is not rejected or later flagged as inaccurate.

## Section 1 — Data collection and sharing (top-level)

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | The app records GPS locations and app-generated trip/fuel data on-device. Google treats on-device collection as "collected" for form purposes. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | The only outbound traffic is HTTPS (Google Maps tiles, optional Nominatim reverse geocoding). `usesCleartextTraffic=false` enforces this. |
| Do you provide a way for users to request that their data be deleted? | **Yes — in-app** | Users can delete trips/entries individually, use Android Settings → Clear data, or uninstall the app. There is no account to delete. |

## Section 2 — Data types

For every data type below, answer **Collected: Yes / Shared: No** unless
noted otherwise.

### Location
- **Precise location** — Collected: **Yes**. Shared: **No**.
  - Purposes: **App functionality** (record mileage) and **Analytics** — pick
    *App functionality* only. Do **not** check Advertising/marketing.
  - Optional: **No** (required for the app's core purpose when tracking).
  - Ephemeral: **No** (persisted as trip routes on-device).
  - Also disclose: uses **background location**.
- **Approximate location** — same answers as Precise; optional if you also
  declare Precise, but declaring both matches the manifest.

### Personal info
- **Name, Email, User IDs, Address, Phone, Race/ethnicity, Political or
  religious beliefs, Sexual orientation, Other info** — Collected: **No**.
  The app has no accounts and no sign-in.

### Financial info
- **Purchase history, Credit info, Other financial info** — Collected:
  **No**.
- **User payment info** — Collected: **No** (no in-app purchases).

### Health & fitness
- Collected: **No**.

### Messages
- Collected: **No**.

### Photos and videos
- **Photos** — Collected: **Yes** (optional fuel-receipt photos), Shared:
  **No**.
  - Purpose: **App functionality**.
  - Optional: **Yes** (users are never required to attach a photo).
- **Videos** — Collected: **No**.

### Audio files
- Collected: **No** (no microphone permission).

### Files and docs
- Collected: **No**. Exports the user creates go to a location the user
  chooses via the Android share sheet; the app does not read arbitrary
  files.

### Calendar / Contacts
- Collected: **No**.

### App activity
- **App interactions, In-app search history, Installed apps, Other
  user-generated content, Other actions** — Collected: **No**.
  MileTrack has no analytics or telemetry.
- **Trip / fuel entries** — these are on-device user content; they are
  **not** shared with Google under any of the app-activity categories
  because they never leave the device.

### Web browsing
- Collected: **No**.

### App info and performance
- **Crash logs, Diagnostics, Other performance data** — Collected: **No**.
  No third-party crash reporting SDK is bundled. Do not enable this row.

### Device or other IDs
- Collected: **No** (no advertising ID, no `READ_PHONE_STATE`, no
  `ANDROID_ID` usage).

## Section 3 — Security practices

| Prompt | Answer |
|---|---|
| Data is encrypted in transit | **Yes** |
| Users can request that data be deleted | **Yes** — in-app delete + uninstall/clear-data |
| Committed to Play's Families Policy | Answer per your target audience. The app is not directed to children. |
| Independent security review | Optional. Leave blank unless you have a report. |

## Section 4 — Location permission declaration

Because the app uses `ACCESS_BACKGROUND_LOCATION` and
`FOREGROUND_SERVICE_LOCATION`, Google requires an in-console declaration
plus a short screen recording.

Prepared answers:

- **Feature that uses background location:** "Continuous mileage
  recording — the app records the GPS route of a drive so distance and
  time are accurate. Background access is only used while a trip is
  actively being recorded or the user has enabled automatic trip
  detection."
- **Is background access required for the feature to function?** **Yes**
  (an app in the background cannot access GPS on modern Android without
  this permission, and mileage would be undercounted).
- **Alternative available?** No — manual entry alone cannot produce an
  accurate route/distance record.
- **Prominent disclosure shown in-app before permission is requested?**
  Yes — the permission-request card explains the reason before the
  system dialog.
- **Screen recording:** capture the flow of (1) launching the app, (2)
  seeing the prominent disclosure, (3) granting location + background
  location, (4) starting a trip, (5) locking the phone and seeing the
  persistent tracking notification. Upload the MP4 to the console.

## Section 5 — Privacy policy URL

Host `PRIVACY_POLICY.md` (rendered to HTML) at a stable public URL and
paste that URL into the Play Console listing. The URL must be reachable
without a login and must remain live for the life of the listing.

## Section 6 — What NOT to declare (common mistakes to avoid)

- **Advertising or marketing** as a purpose for location — the app shows
  no ads.
- **Fraud prevention, security, or compliance** as a purpose — not
  applicable.
- **Data shared with third parties** — the app does not share user data
  with third parties. Google Maps tile requests are covered by Google's
  own SDK disclosure; you do not additionally re-declare them here as
  "sharing", because you are not sending user records to Google.
- **User account** — none exists; do not declare user IDs.

Keep this file next to `PRIVACY_POLICY.md` in the repo so the answers and
the policy stay in sync when features change.
