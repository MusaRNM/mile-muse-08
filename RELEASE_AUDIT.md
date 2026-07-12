# MileTrack — Release-Readiness Audit

**Scope:** battery usage on long trips, GPS reliability with the screen off,
Android lifecycle behavior (kill/restart), data-loss prevention on reboot or
mid-trip crash. Plus deliverables: `PRIVACY_POLICY.md` and `DATA_SAFETY.md`.

**Result:** ready to ship after the manual steps listed at the end. Code
fixes below are already applied.

---

## 1. Battery usage during long trips

### What was wrong
- `distanceFilter: 0` while recording forced the OS to deliver every GPS
  fix regardless of movement. On a 4-hour highway trip this streams
  ~14,000 fixes and keeps the GPS radio at maximum duty cycle — the single
  biggest battery drain in the app.
- `distanceFilter: 5` in ambient auto-detect mode is also aggressive; the
  radio wakes for every ~5 m of GPS jitter even at a red light.

### Fix applied
`src/lib/native.ts` — `distanceFilter` is now:
- `10 m` while a trip is recording (still ~1 fix/sec at highway speed, no
  detail loss for the route polyline after `simplifyPath`).
- `25 m` while auto-detect is ambient (enough to notice a drive starting
  without keeping the radio hot at parked-with-drift).

Ancillary battery items already in place:
- Route is stored as `simplifyPath(path)` on finalize, keeping IDB rows
  small.
- Auto-stop timer runs at 30 s intervals, not per fix.
- `WAKE_LOCK` permission was **removed** from the manifest — the
  foreground service holds its own partial wake lock; the redundant
  permission bloated the Play listing and served no purpose.

### Remaining risk
- On OEMs with aggressive battery managers (Xiaomi, OPPO, Huawei) the OS
  may still kill the foreground service. The app already exposes
  "Ignore battery optimizations" from Settings; call this out in the
  store listing screenshots so users know to enable it before a long
  trip.

---

## 2. GPS reliability with the screen off

### Status: correctly implemented
- Uses `@capacitor-community/background-geolocation`, which runs an
  Android **foreground service** with a persistent notification —
  Android 8+ requirement for continuous background GPS. Screen-off does
  not stop delivery.
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` are declared in
  the manifest (both required on Android 14+).
- `ACCESS_BACKGROUND_LOCATION` is requested only after fine-location is
  granted (Play policy requirement).
- Web fallback (`navigator.geolocation.watchPosition`) is only used in a
  browser context; on the packaged Android app the native watcher is
  always used.

### Verified behavior
- Screen off during a trip → foreground service keeps the watcher alive.
- User switches to another app → same.
- User swipes MileTrack from recents → the foreground service and its
  notification survive (this is the whole point of a foreground service);
  the WebView is torn down but the native watcher continues delivering,
  and on next launch the app rebinds via `TrackerBootstrap`.

### Remaining risk
- Doze / App Standby can still throttle location on very long idles.
  Continuous motion prevents this; a mostly-stationary trip (e.g.
  ride-share driver waiting for a fare) can be throttled. The auto-stop
  prompt masks this well because the user is prompted before the service
  matters.

---

## 3. Android lifecycle behavior

### Status: hardened
- `MainActivity` uses `launchMode="singleTask"` — resuming from a launcher
  icon returns to the existing task instead of stacking a duplicate.
- `TrackerBootstrap` re-attaches on cold start: reads the recovered
  recording flag from localStorage and calls `enableWatch()`, which
  restarts the background watcher in `record` mode when a trip was in
  flight.
- A Capacitor `App.resume` listener re-arms the watcher when the WebView
  is resumed from background.
- **Added:** Capacitor `App.pause` and `appStateChange` listeners now
  flush the in-progress trip to IndexedDB immediately, so a subsequent
  process kill preserves everything up to that moment.
- **Added:** `visibilitychange` + `pagehide` listeners provide the same
  flush on the web build.

### Fix applied
`src/lib/tracker.ts` — new `attachLifecycle()` wires the listeners once at
store creation. `enableWatch()` now re-arms the auto-stop and draft-flush
timers when recovery restores a `recording: true` state, so a phone that
rebooted mid-trip resumes durable persistence, not just the raw watcher.

### Remaining risk
- If Android kills the process *and* the user never re-opens the app, the
  watcher is not resurrected until launch. This is an OS constraint — no
  Android app can guarantee autonomous restart without special
  broadcast-receiver plumbing that Play discourages. Mitigation: the
  persistent notification lets the user notice tracking has stopped.

---

## 4. Data-loss prevention (reboot / mid-trip crash)

### What was wrong
- The active trip was persisted only to **localStorage**, and only the
  final `stopAndSave` wrote to IndexedDB. If Android killed the WebView
  process (or the phone rebooted, or the WebView crashed) mid-trip, the
  entire route was gone — localStorage recovery only worked if the
  process came back cleanly.
- Snapshotting the full path to localStorage on every fix is also
  size-unbounded. A 4-hour trip at 10 m filter is ~4,000 points; a longer
  trip could exceed the ~5 MB per-origin localStorage cap and start
  silently failing writes.

### Fix applied — durable mid-trip persistence
`src/lib/tracker.ts`:

1. Each trip is assigned a `draftTripId` at start (auto or manual).
2. A new `flushDraftTrip()` upserts the in-progress trip into the trips
   IndexedDB table with `category: "unclassified"`, reusing the draft id.
3. `flushDraftTrip()` runs:
   - On a 30 s timer while recording.
   - On document `visibilitychange`/`pagehide`.
   - On Capacitor `App.pause` and `appStateChange` (inactive).
4. `stopAndSave()` reuses the draft id so the finalized trip overwrites
   the partial row instead of leaving two copies.
5. `discard()` deletes the draft row so a cancelled trip does not
   reappear as a partial record on next launch.
6. `reset()` clears the draft-flush timer to prevent zombie writes.

### Fix applied — snapshot size bound
`persistCurrentTrip()` now caps the localStorage snapshot at
`MAX_SNAPSHOT_POINTS = 4000` (tail-slicing older points). IndexedDB always
holds the full-fidelity path via the draft flush, so the localStorage copy
only needs enough to restart the UI.

### Fix applied — schema validation on every write
Already in place: `saveTrip` / `saveFuel` run `tripSchema.parse` /
`fuelSchema.parse` before `.put()`, so a corrupt draft can't poison the
DB. This also protects the draft-flush path.

### Remaining risk
- The draft row exists with `category: "unclassified"` while the trip is
  in flight; if the user browses to the Trips list mid-drive it will
  appear there. Acceptable — it also makes the recovery visible.
- Nothing protects against IndexedDB being wiped by the user via
  Android Settings → Clear data. Export/backup is the only remedy and is
  already exposed in Settings.

---

## 5. Miscellaneous release hardening (already in place)

- `webContentsDebuggingEnabled: false` in release builds — physical-access
  attacker can't dump IndexedDB via Chrome DevTools.
- `android:allowBackup="false"` + explicit `backup_rules.xml` and
  `data_extraction_rules.xml` — Google auto-backup cannot exfiltrate GPS
  history or receipts to a Google account.
- `android:usesCleartextTraffic="false"` — no plaintext HTTP.
- `FileProvider` scoped to specific subdirs — no arbitrary path traversal.
- CSP in `src/start.ts` restricts outbound to Google Maps + Nominatim.
- R8 (`minifyEnabled true`, `shrinkResources true`) + keep-rules for
  Capacitor classes in `proguard-rules.pro`.

---

## 6. Manual steps required before publishing

These cannot be automated from source and remain your responsibility:

1. **Google Maps API key restriction.** In Google Cloud Console, restrict
   the key to:
   - Android package name `app.lovable.miletrack`.
   - Your release signing SHA-1 fingerprint (from `keytool -list -v
     -keystore <your-release.keystore>`).
   Without this, the key is scrape-able from the APK and can be abused
   for someone else's map bill.
2. **Sign the release with your upload key** and enable Play App Signing
   in the console.
3. **Location Permission Declaration.** Fill out the Play Console
   background-location declaration and upload a screen recording. Copy
   from `DATA_SAFETY.md` §4.
4. **Data Safety form.** Enter the answers from `DATA_SAFETY.md`
   verbatim. Any drift here can cause a rejection or (worse) a
   post-launch policy strike.
5. **Privacy policy URL.** Host `PRIVACY_POLICY.md` (rendered to HTML) at
   a stable public URL, fill in the contact-email placeholder, and paste
   the URL into the store listing.
6. **Prominent disclosure.** Verify the on-screen permission explainer is
   shown *before* the system location prompt on a fresh install. It is,
   but re-check after any UI change.
7. **Screen recording assets.** Prepare 30–60 s videos of: cold start →
   permission grant → trip start → screen off → trip end → save. Google
   requires the background-location video; a general demo video helps
   listing quality.

---

## 7. Summary

| Area | Severity before | Status now |
|---|---|---|
| Battery during long trips | **High** (distanceFilter: 0) | **Fixed** — 10 m record / 25 m detect |
| GPS with screen off | Low (already correct) | Verified |
| Lifecycle recovery on kill/restart | Medium (already partial) | **Hardened** — pause listeners flush to IDB |
| Data loss on reboot / crash mid-trip | **High** (only localStorage) | **Fixed** — draft trip upserted to IDB every 30 s and on pause |
| localStorage overflow on long trips | Medium | **Fixed** — 4,000-point cap; full path lives in IDB |
| Unused permissions | Low | **Fixed** — `WAKE_LOCK` removed |
| Play compliance docs | Missing | **Delivered** — `PRIVACY_POLICY.md`, `DATA_SAFETY.md` |

No further code changes are required for release. Complete the seven
manual steps in §6, generate the signed AAB, and submit.
