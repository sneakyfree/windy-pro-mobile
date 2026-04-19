# Wave 12 — TestFlight unblock

**Date:** 2026-04-19
**Branch:** `wave12/testflight-unblock` (stacked on `wave11/hardening`)
**Outcome:** iOS binary accepted by App Store Connect; Apple processing
the build for TestFlight.

---

## TL;DR

- **Apple rejection 1 (Wave 11):** `LSMinimumSystemVersion = 16.0`
  rejected under error 91164 — Apple's current rule is `< 16.0` or
  `>= 26.0` exactly. **Fixed** by setting `15.1`.
- **Apple rejection 2 (Wave 12 first try):** `Info.plist` missing
  `NSContactsUsageDescription`. `app.json` declared it but the native
  `ios/` directory overrides app.json, and the plist didn't carry the
  key. **Fixed** by adding it directly to
  `ios/WindyPro/Info.plist`.
- **Final submit:** accepted. IPA uploaded, Apple processing underway.

---

## Live links

| Artifact | URL |
| --- | --- |
| Final iOS build (2.0.0, buildNumber 16) | https://expo.dev/artifacts/eas/3Yt7bP2y3bFx6fF7FaegNV.ipa |
| EAS build page | https://expo.dev/accounts/windypro/projects/windy-pro-mobile/builds/1814a22d-f82e-4a33-abb8-0bc9603827b5 |
| EAS submission page (accepted) | https://expo.dev/accounts/windypro/projects/windy-pro-mobile/submissions/aa4346eb-22ba-4c5c-b713-b78a6cb9866b |
| App Store Connect TestFlight | https://appstoreconnect.apple.com/apps/6759985867/testflight/ios |

---

## What Grant needs to do now

1. **Wait ~5–10 minutes** for Apple processing. An email from
   `TestFlight <no-reply@email.apple.com>` will arrive at
   `grantwhitmer3@gmail.com` when processing completes.
2. **Answer Export Compliance** if prompted (ASC → TestFlight →
   Windy Pro → build 16 → ⚠️ icon). `app.json` already sets
   `ITSAppUsesNonExemptEncryption: false`, which usually clears it
   automatically.
3. **Install TestFlight** on the iPhone (App Store → TestFlight).
4. **Accept the invite** (internal group auto-invites the account
   holder).
5. **Run through** `docs/wave11-testflight-checklist.md` §6 on-device.

Full Grant-facing playbook: `docs/wave11-testflight-checklist.md`
§4–§6.

---

## The two commits

### `f5b6b6f` — `fix(ios): LSMinimumSystemVersion 16.0 → 15.1 (Apple 91164)`

Two source locations had the bad value:

- `app.json` expo-build-properties `ios.deploymentTarget: "16.0"` → `"15.1"`
  — defense against any future `expo prebuild --clean` re-introducing the bug
- `ios/WindyPro/Info.plist` `LSMinimumSystemVersion: 16.0` → `15.1`
  — this is what Apple actually validates on upload

The Xcode project's `IPHONEOS_DEPLOYMENT_TARGET` was already `15.1`,
so no pod install needed — pure metadata fix.

### `f85899a` — `fix(ios): add NSContactsUsageDescription to Info.plist`

Apple's static analyzer detects that `expo-contacts` links the
Contacts framework. The symbol being present in the binary is enough
to require the usage-description key, even though the app only asks
for contacts during Chat onboarding (opt-in). Added the key with the
same copy that `app.json:ios.infoPlist` already declared —
`app.json` was effectively dead documentation for this field because
the native `ios/` directory overrides it.

---

## Still open for Wave 13

1. **Android Gradle plugin blocker** — `Plugin [id: 'expo-module-gradle-plugin'] was not found`. Unchanged from Wave 11. Needs hands-on Android SDK debugging.
2. **App name mismatch** — ASC record is "Windy Pro"; `app.json.name` and `APP_STORE_METADATA.md` say "Windy Word". Pick one.
3. **iOS 26 SDK / Xcode 26 transition** — Apple's warning 90725 said uploads must use iOS 26 SDK / Xcode 26 starting **2026-04-28** (9 days). Current EAS build image uses iOS 18.2 SDK. Once EAS publishes an Xcode 26 image, pin it in `eas.json` `build.production.ios.image` and re-build. If Apple enforces strictly at midnight on the 28th, this becomes urgent.

---

## Build/submission log — for posterity

```
Wave 11 iOS attempts (all failed):
  cf9a7934   Xcode  _SentryPrivate not found       → pod install
  357b16f7   Xcode  _SentryPrivate not found       → use_frameworks!
  3e231af5   Xcode  60+ Swift errors               → expo-contacts downgrade
  edfcb3e2   FINISHED; submit rejected by Apple (91164 LSMinimumSystemVersion=16.0)

Wave 12 iOS attempts:
  92dc6419   FINISHED; submit rejected by Apple (missing NSContactsUsageDescription)
  1814a22d   FINISHED; submit ACCEPTED ✓
```
