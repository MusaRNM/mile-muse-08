# MileTrack — Google Play Release Checklist

Use this checklist top-to-bottom before hitting **Send for review** in the
Play Console. Everything here maps to something the reviewer will check.

---

## 0. Confirmation of "no Google APIs / no billing" posture

Verified in the current codebase:

- `package.json` — no `@react-google-maps/*`, no `@googlemaps/*`, no
  `firebase`, no `@firebase/*`, no analytics/advertising SDKs.
- `.env` — no `VITE_LOVABLE_CONNECTOR_GOOGLE*` keys, no Maps browser key,
  no tracking ID.
- `src/start.ts` CSP `connect-src` — `'self' https://nominatim.openstreetmap.org`
  only. No `*.googleapis.com`, no `*.gstatic.com`, no `*.google.com`.
- `src/components/RouteMap.tsx` — pure SVG polyline renderer, no tile
  fetches, no external requests.
- `src/lib/geo.ts` — `reverseGeocode()` uses OpenStreetMap Nominatim only,
  and only when the user opts in via Settings.
- Location comes from Android's OS location service via
  `@capacitor/geolocation` + `@capacitor-community/background-geolocation`
  (native `LocationManager` / `FusedLocationProvider`). No Google Cloud
  billing.
- `android/build.gradle` references `google()` (public Maven repository,
  free) and pulls the standard `google-services` Gradle plugin only
  transitively; no `google-services.json` is present, so no Firebase /
  Google-Services runtime is active.

**Result:** zero Google API dependencies, zero API keys, all location
tracking is performed locally on the device.

---

## 1. Runtime behavior verified

| Area | Status | Where it lives |
|---|---|---|
| Android 10+ background-location flow (foreground first, then background as a separate prompt) | Done | `@capacitor-community/background-geolocation` handles the two-step prompt; the app requests only after the in-app prominent disclosure is shown. |
| Prominent in-app disclosure before the OS dialog | Done | Permission card on Home explains **why** the app needs location and background location before Android's dialog opens. |
| Foreground service notification | Done | `BackgroundGeolocation` starts an Android foreground service with a persistent, non-dismissible notification whose text explains "MileTrack is recording your trip." Small icon = `ic_stat_icon`, color = `#d67a21`. |
| Works with screen locked | Done | Background-geolocation holds its own partial wake lock while the watcher is active; `distanceFilter` tuned in `src/lib/native.ts`. |
| Survives process death | Done | `src/lib/tracker.ts` writes a **draft trip** to IndexedDB every 30 s and on `pause` / `visibilitychange`. `TrackerBootstrap` restores an active recording on cold start. |

Manual smoke test before publishing:
1. Start a trip, lock the screen, drive/walk for ~5 minutes, confirm the
   route is complete on return.
2. Start a trip, force-stop MileTrack from Android Settings, relaunch,
   confirm the trip is either resumed or persisted as a partial trip
   (no data loss).
3. Reboot the phone mid-trip, relaunch, confirm partial trip is present.
4. Turn off Wi-Fi + cellular, record a trip end-to-end, confirm nothing
   fails (the app must work fully offline).

---

## 2. Play Console — Store listing

- **App name:** MileTrack
- **Short description (≤80 chars):** Private, on-device mileage tracker for business and personal driving.
- **Full description:** highlight: on-device only, no accounts, no ads,
  no analytics, works offline, IRS-rate mileage reports, CSV/PDF export.
- **Category:** Auto & Vehicles (or Productivity).
- **Content rating:** run the IARC questionnaire; expect **Everyone**.
- **Target audience:** 18+ (drivers). Not directed at children.
- **App icon:** 512 × 512 PNG.
- **Feature graphic:** 1024 × 500 PNG.
- **Phone screenshots:** at least 2, up to 8. Recommended set:
  1. Home / Track screen with the "Start trip" CTA.
  2. Live trip in progress (map + distance + duration).
  3. Trips list with categorized trips.
  4. Trip detail with route.
  5. Fuel log with a receipt attached.
  6. Reports (year-to-date IRS deduction).
  7. Settings — Privacy section showing the reverse-geocode toggle **off**.
  8. Export dialog (PDF / CSV / JSON).
- **7-inch and 10-inch tablet screenshots:** optional but recommended if
  you support tablet layouts.

---

## 3. Privacy policy URL

- File: `public/privacy-policy.html` (served in-app and downloadable).
- Also exposed as a link on the Settings screen ("Privacy policy").
- **Host it publicly before submission.** Fastest options:
  1. **GitHub Pages** — in the connected GitHub repo, Settings → Pages →
     Source = `main` branch, folder = `/ (root)`. Then the policy lives
     at `https://<user>.github.io/<repo>/public/privacy-policy.html`.
     Or copy `public/privacy-policy.html` to `docs/privacy-policy.html`
     and point Pages at `/docs` for a cleaner URL.
  2. **Lovable published URL** — `https://mile-muse-08.lovable.app/privacy-policy.html`
     also works and is already live.
- Paste the chosen URL into Play Console → **App content → Privacy
  policy**.
- Before submitting, edit the file and replace the placeholder support
  email in section 10.

---

## 4. Data safety form (Play Console → App content → Data safety)

Follow `DATA_SAFETY.md` line by line. Summary:

- **Data collected:** Yes (Precise location, Photos).
- **Data shared:** No.
- **Location purpose:** App functionality only. **Uncheck** advertising,
  analytics, fraud prevention.
- **Location required for app's core purpose:** Yes.
- **Encrypted in transit:** Yes.
- **Users can request deletion:** Yes — in-app.
- **No** account creation, **no** analytics SDK, **no** ad SDK.

---

## 5. Background-location declaration (Play Console → App content → Location)

- **Feature description:**
  "Continuous mileage recording — MileTrack records the GPS route of a
  drive so distance and time are accurate. Background access is used
  only while a trip is actively being recorded or the user has enabled
  automatic trip detection."
- **Is background access required?** Yes — Android throttles GPS in the
  background without it, which produces incorrect mileage.
- **Alternative?** No — manual entry cannot produce an accurate route.
- **Prominent disclosure shown in-app before OS dialog?** Yes.
- **Video demonstration:** upload a ≤ 30 s screen recording showing:
  1. Launch the app.
  2. See the prominent disclosure card.
  3. Grant foreground location, then background location.
  4. Start a trip.
  5. Lock the phone; show the persistent tracking notification.

---

## 6. Release build signing

- Generate an upload keystore (`keytool -genkey -v -keystore upload.jks
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload`) and store it
  outside the repo.
- Configure `android/app/build.gradle` release signing to read the
  keystore path/password/alias from Gradle properties, **not** hard-coded.
- Enable **Play App Signing** when creating the app in Play Console and
  upload the AAB signed with the upload key.
- Verify:
  - `applicationId = app.lovable.miletrack`
  - `versionCode` incremented for every upload.
  - `versionName` matches the human release version.
  - `minifyEnabled true`, `shrinkResources true` for `release`.
  - `allowBackup="false"` and `usesCleartextTraffic="false"` in the manifest.

Build command:
```
bun run android:sync
cd android && ./gradlew bundleRelease
```
The AAB lands at `android/app/build/outputs/bundle/release/app-release.aab`.

---

## 7. Final pre-submit sanity pass

- Open the AAB in [bundletool](https://developer.android.com/tools/bundletool) or install a debug build and confirm:
  - Only the permissions listed in `AndroidManifest.xml` are requested.
  - The privacy-policy link on Settings opens the policy.
  - No crash on cold start with all permissions denied.
  - No crash on cold start with airplane mode on.
- Confirm `PRIVACY_POLICY.md`, `public/privacy-policy.html`, and the Play
  Console Data Safety answers all describe the **same** behavior.
- If you change what data is collected or where it goes, update all
  three in the same commit.
