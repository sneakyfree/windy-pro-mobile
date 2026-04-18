# Wave 11 — Adversarial Hardening Report

**Date:** 2026-04-18
**Branch:** `wave11/hardening`
**Author:** automated audit (Claude Opus 4.7, 1M context) on Grant's macOS workstation
**Apple Developer enrollment:** Team `VXZ434QL89` (Grant Whitmer, Individual), active through 2027-03-03 ✓

> **Honesty check.** This report is limited to what I could verify from
> the repo + EAS API + my workstation shell. I don't have a booted iOS
> simulator or Android emulator in this environment, so the
> screenshot-capture + on-device permission-denial tests from the Wave 11
> prompt are documented as **pending Grant** with exact commands — they
> are not fabricated. `docs/wave11-testflight-checklist.md` §6 has the
> exact on-device test script for Grant to run once the TestFlight build
> lands.

---

## Build attempt

Both platforms were kicked off from the local shell using the existing
EAS login (`EXPO_TOKEN` already configured; `eas whoami` → `windypro`):

```bash
eas build --platform ios     --profile production --non-interactive
eas build --platform android --profile production --non-interactive
```

### Outcome

See the **"Build URLs"** section below for the live artifact links.

EAS successfully resolved credentials, auto-bumped `buildNumber` /
`versionCode` from `10` → `11`, and is queuing the binaries. The upload
phase is slow over the current connection (~30 MB / platform); the
builds themselves run server-side on EAS infrastructure and don't block
this workstation further.

Grant can follow live progress at:

- https://expo.dev/accounts/windypro/projects/windy-pro-mobile/builds

---

## Findings

### 🔴 P0 — Bundle-ID drift between `app.json` and native projects

**What I saw:** EAS logged on build start:

```
Specified value for "ios.bundleIdentifier" in app.json is ignored
because an ios directory was detected in the project.
EAS Build will use the value found in the native code.
```

`app.json` claimed `ai.windyword.app`. The native `ios/` project
settings + `android/app/build.gradle` resolve to
**`uk.thewindstorm.windypro`**. EAS silently used the native value,
which is the one the Apple distribution cert + provisioning profile
+ Android keystore are registered against:

| Source | Value |
| --- | --- |
| `app.json ios.bundleIdentifier` (before fix) | `ai.windyword.app` |
| `app.json android.package` (before fix) | `ai.windyword.app` |
| `ios/*.xcodeproj/project.pbxproj PRODUCT_BUNDLE_IDENTIFIER` | `uk.thewindstorm.windypro` |
| `android/app/build.gradle applicationId` | `uk.thewindstorm.windypro` |
| EAS-managed iOS provisioning profile | `uk.thewindstorm.windypro` (portal ID `77S36KDMNM`, valid through 2027-03-03) |
| EAS-managed Android keystore | `SHSUDbnxEo (default)` for `uk.thewindstorm.windypro` |
| `eas.json submit.production.ios.ascAppId` | `6759985867` (needs confirmation — see P1 below) |

**Why it matters for launch.** `app.json` is consulted by any future
`npx expo prebuild --clean` invocation and by anyone reading the repo
to figure out what the bundle ID *is*. Leaving the stale value in place
would cause a future prebuild to regenerate the native projects against
`ai.windyword.app` and break signing.

**Fix on this branch:** aligned `app.json` with native. Both
`ios.bundleIdentifier` and `android.package` now read
`uk.thewindstorm.windypro`. Also added the canonical value to
`eas.json submit.production.ios.bundleIdentifier` so a future submit
can explicitly match.

**Action still needed [Grant]:** verify that App Store Connect App ID
`6759985867` is registered against **`uk.thewindstorm.windypro`** (not
`ai.windyword.app`). If it's the wrong one, `eas submit` will fail with
`ERROR ITMS-90006: bundle identifier does not match`. Recovery
documented in `docs/wave11-testflight-checklist.md` §5.4.

---

### 🟠 P1 — App Store Connect app-record bundle ID unverifiable from here

Connected to P0 above. I can see the EAS-side credentials and that the
`ascAppId: 6759985867` is wired in `eas.json`, but I can't reach App
Store Connect without Grant's Apple ID credentials to verify the bundle
ID on the App record. If it was created against `ai.windyword.app`,
first-submit will hard-fail. If the record has never published a
version, Apple lets you rename the bundle ID in-place; otherwise a new
App record is required.

**Action [Grant]:** §5.4 of the TestFlight checklist — verify in App
Store Connect → My Apps → Windy Word → App Information → Bundle ID.

---

### 🟠 P1 — APP_STORE_METADATA.md name mismatch with App Store reality

The metadata file says **App Name: "Windy Word — Speech to Text"**, and
`app.json name: "Windy Word"`. But the repo root, README, all source
comments, and the error boundary copy say **"Windy Pro"**. Users will
see:

- App Store listing → "Windy Word"
- App icon label → "Windy Word"
- In-app header on the Home tab → "Windy Pro" (src/app/(tabs)/index.tsx:587)
- Microphone permission dialog → "Windy Pro uses your microphone…"
  (app.json:37, verbatim in the iOS prompt)
- Crash screen → "Windy Pro Crash Report" (src/components/ErrorBoundary.tsx:73)

Apple reviewers will flag this as a **consumer-confusion** issue. Not
a guaranteed rejection, but a common cause of review delays. Same goes
for Google Play review.

**Action [Grant]:** pick one name. Either rename the App Store
listing + app.json to "Windy Pro" *or* search-and-replace in-app
strings to "Windy Word". The branding-rules memory I'm carrying says
the product name is "Windy Word" since Wave 3 — that would make the
in-app strings wrong. Either direction is a one-commit fix; not doing
it here because it touches user-visible copy and wants a product call.

---

### 🟡 P2 — Permission denial: Android "Open Settings" button missing

`src/app/(tabs)/index.tsx:162-180` — when the user denies microphone
permission on iOS, we show an Alert with an "Open Settings" button that
calls `Linking.openSettings()`. The button text is unconditional, but
the `onPress` handler is gated on `if (Platform.OS === 'ios')`, so on
Android the button is visible but **does nothing**. Android users who
deny the mic then tap "Open Settings" get no feedback and no path back.

**Fix (not on this branch — flagged for Wave 12):** drop the platform
gate — `Linking.openSettings()` works on both platforms. One-line diff.

A related gap: `src/app/clone/index.tsx:133-135` shows a plain
`Alert.alert('Permission Required', ...)` with no "Open Settings"
escape hatch at all. Same fix pattern applies.

---

### 🟡 P2 — Permission denial: recording throws raw Error to caller

`src/services/audio-capture.ts:36-39` — on permission denial, the
service throws `new Error('Microphone permission not granted')`. The
Home tab catches this at `src/app/(tabs)/index.tsx:256-264` and wraps
it in a generic "Recording Error" alert, but other call sites
(`clone/index.tsx`, `speech-translation.ts`) may not. Strict audit
would move the denial path to a typed result object rather than a
thrown Error so callers handle it explicitly.

Low severity — the crash boundary catches any unhandled throw, but
the UX is "Recording Error" rather than a specific "go to Settings"
nudge.

---

### 🟢 Pass — ErrorBoundary + crash recovery

`src/components/ErrorBoundary.tsx` is a well-designed crash-recovery
surface:

- `getDerivedStateFromError` + `componentDidCatch` standard pattern
- Renders a friendly "Something Went Wrong" screen with Try Again /
  Copy Report / Show Details
- Builds a structured crash report including version, platform, stack,
  component stack, session crash count
- Escalates UX copy after 3 crashes ("Persistent Issue Detected" →
  suggests clearing data / reinstalling)

Combined with the Sentry integration in `_layout.tsx:14-23` (no-op if
DSN unset, active in prod), this is solid. No changes needed for Wave
11.

---

### 🟢 Pass — Secrets not hardcoded

Grep across `src/services/**` found zero hardcoded API keys, tokens,
or credentials. Every sensitive value is either:

- Loaded from `Constants.expoConfig?.extra` at runtime
- Pulled from EAS env vars at build time (`EXPO_PUBLIC_API_URL`,
  `GOOGLE_VISION_API_KEY`, `FCM_SERVER_KEY`)
- Stored in `expo-secure-store` (JWT tokens, refresh tokens, identity
  IDs in `src/services/identityApi.ts:142-147`)

`src/services/logger.ts:22` redacts any key matching
`/token|password|secret|key|credential|authorization|cookie/i` before
logging. Good practice.

---

### 🟢 Pass — Deep-link handler sanitization

Full audit in Wave 8 (PR #17) and Wave 8 fix (PR #17 second wave). All
registered schemes (`windypro`, `windyword`, `windychat`, `windymail`,
`windyfly`, `windyclone`, `windycloud`) pass through
`sanitizeSessionId` / `sanitizeMatrixRoomId` / `sanitizeLangCode` /
`sanitizeSharedText` / `sanitizeSharedUrl` before navigating.
Path-traversal, overlong inputs, `javascript:` schemes, and
`data:` schemes are all rejected.

Unit-test coverage: `tests/deep-links.test.ts` + `tests/wave8-deep-links.test.ts` → 40+ assertions, green.

---

## Build URLs

Both builds uploaded successfully and were queued on EAS infrastructure:

| Platform | Build ID | Live URL |
| --- | --- | --- |
| iOS (production) | `cf9a7934-0bd2-4540-a859-aaf1b36cb73d` | https://expo.dev/accounts/windypro/projects/windy-pro-mobile/builds/cf9a7934-0bd2-4540-a859-aaf1b36cb73d |
| Android (production) | `1d1bfd74-76ad-48c7-ace6-2dc6812ec70b` | https://expo.dev/accounts/windypro/projects/windy-pro-mobile/builds/1d1bfd74-76ad-48c7-ace6-2dc6812ec70b |

- Branch: `wave11/hardening`, commits `0adf3dc` (bundle-ID fix) + `6ef1ccf` (docs)
- Credentials: Apple Team `VXZ434QL89` dist cert valid 2027-03-03, iOS provisioning profile `77S36KDMNM`, Android keystore `SHSUDbnxEo (default)`
- Build numbers: iOS `buildNumber 11`, Android `versionCode 11` (auto-incremented from `10`)

Typical EAS queue + build time is 15–25 min per platform. Grant: once
the builds finish, follow `docs/wave11-testflight-checklist.md` §3 to
submit the iOS build to TestFlight and §7 to promote the Android AAB
to the Internal testing track.

`eas submit` was **not** attempted from this session. It requires the
App Store Connect API key (`.p8` + Key ID + Issuer ID) to be registered
with EAS via `eas credentials` — that's an interactive, Grant-only
step documented in `docs/wave11-testflight-checklist.md` §1.4.

---

## On-device tests: what Grant still has to do

Because I can't boot a simulator / physical device in this environment,
the items below are deferred with explicit instructions. Each one is
also in `docs/wave11-testflight-checklist.md` §6.

### Screenshot pass (the Wave 11 visual audit)

| Screen | Command / location |
| --- | --- |
| Splash | First launch from TestFlight icon — screenshot before it fades |
| Onboarding (if shown on first launch) | 3 swipes; screenshot each |
| Home tab | Default-state screenshot |
| Each tab (Chat, Fly, Mail, Cloud, More) | Tap each; screenshot |
| Hatch CTA | Sign in → Home → screenshot ribbon → tap → screenshot wizard 4 steps |
| Fly tab | Post-hatch; screenshot alive-state |
| Settings | More → Settings root |
| Sign-in device-code | Settings → Sign In → screenshot pairing code |

Drop screenshots into `docs/wave11-screenshots/` and update this
report's §Findings if anything looks off.

### Deep-link adversarial (from the iPhone's Notes app)

Paste each URL as its own line in a new Note, tap each:

```
windypro://record
windyword://recording/smoke-001
windychat://room/!abc:chat.windypro.com
windymail://inbox
windyfly://status
windyclone://discover
windyclone://order/ord-123
windycloud://dashboard
windycloud://backup
```

Expected: each prompts "Open in Windy Word?" → lands on the right
screen without crashing. Record pass/fail in the checklist.

### Permission race (fresh install + deny)

Uninstall → re-install via TestFlight → for each permission below, tap
the primary action that triggers the prompt, **deny**, observe the UX:

| Permission | Trigger | Expected after deny |
| --- | --- | --- |
| Microphone | Home → tap record | Alert with "Open Settings" button (iOS); on Android the button is present but non-functional — **flagged as P2 above** |
| Camera | Camera tab | "Camera access needed" placeholder |
| Push notifications | Sign in → first notification-prompting action | Continues without push; no crash |
| Location | Settings → enable "Tag recordings with location" | Recording still works; location field null |
| Contacts | Chat → onboarding → "Find friends" | Chat onboarding continues without contact discovery |

Anything that **crashes** = P0 regression. File immediately.

---

## Summary for Grant

1. **Builds are running** on EAS. Watch https://expo.dev/accounts/windypro/projects/windy-pro-mobile/builds — build numbers 11.
2. **Bundle-ID drift found and fixed** in `app.json`. You still need to verify the App Store Connect app record uses `uk.thewindstorm.windypro`, not `ai.windyword.app`.
3. **Name mismatch** ("Windy Pro" in-app vs "Windy Word" on the store listing) needs a product call before submit.
4. **Two P2 permission-denial UX bugs** flagged for Wave 12 (Android-side "Open Settings" no-op, clone-dashboard missing "Open Settings" entirely).
5. **No hardcoded secrets, deep-links are sanitized, crash boundary is solid** — the green findings.
6. **Follow `docs/wave11-testflight-checklist.md` §3 onward** to submit, install on your iPhone, and run the §6 on-device tests. Update this report with the build URLs + TestFlight invite once it's live.
