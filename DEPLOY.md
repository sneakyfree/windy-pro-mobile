# Deploy — Windy Word Mobile

The step-by-step playbook to ship Windy Word Mobile from a clean
working tree to paying customers on the App Store and Google Play.
For the **secrets / credentials inventory** this pipeline consumes
(RevenueCat keys, Google Vision key, FCM config, Sentry DSN, Apple ASC
key), see [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md) — it
answers "where do I get X and where does it go?". This doc answers
"what do I run, in what order, and how do I know it worked?".

---

## 0. Pre-flight

Run these in order. Any red step halts the deploy.

```bash
npm install
npx tsc --noEmit                              # types
npm test                                      # unit + contract tests
./scripts/smoke-test.sh --build=preview       # sign-in, Home, hatch CTA, deep-links
```

Verify you have the pre-launch artifacts in place:

- [ ] `DEPLOYMENT_CHECKLIST.md` §1–§9 each have a real value (no `PRODUCTION_KEY_REQUIRED` placeholders in `app.json` `extra`)
- [ ] `.env.production` populated from `.env.production.example`
- [ ] `eas.json` `submit.production.ios.ascAppId` matches the App Store Connect record
- [ ] `app.json` `version` bumped; `buildNumber` (iOS) and `versionCode` (Android) set to a fresh value
- [ ] `CHANGELOG.md` has an entry for this release
- [ ] Store-listing copy + screenshots reviewed against current UI

---

## 1. EAS Build — Expo Application Services

Windy Word uses EAS Build for binary production on both platforms.
`eas.json` defines three profiles:

| Profile | Purpose | Output |
| --- | --- | --- |
| `development` | internal dev client, live-reload | dev-client APK + iOS simulator build |
| `preview` | internal stakeholder testing | APK + iOS simulator |
| `production` | TestFlight + Play Store | AAB + signed IPA |

### 1.1 — First-time EAS setup

```bash
npm install -g eas-cli                        # or npx eas-cli
eas login                                     # use the `windypro` Expo account
eas whoami                                    # should print `windypro`
```

### 1.2 — Register EAS secrets

Secrets referenced by `eas.json` `production.env` resolve against the
EAS backing store, not `.env`. Register them once per project:

```bash
eas secret:create --scope project --name google-vision-api-key  --value "AIza..."
eas secret:create --scope project --name fcm-server-key         --value "AAAA..."
eas secret:create --scope project --name revenuecat-ios-key     --value "appl_..."
eas secret:create --scope project --name revenuecat-android-key --value "goog_..."
eas secret:create --scope project --name sentry-dsn             --value "https://....ingest.sentry.io/..."
```

Rotate a secret with `eas secret:delete` + `eas secret:create`. EAS does
not support update-in-place.

### 1.3 — Trigger production builds

Run iOS and Android in parallel — they're independent:

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

EAS auto-increments `buildNumber` / `versionCode` (`autoIncrement: true`
in `eas.json`). Watch the build logs; first prod build takes ~25 min per
platform.

### 1.4 — Fetch artifacts

```bash
eas build:list --limit 2 --status finished    # grab the buildId
eas build:download --id <buildId>             # if you want a local IPA/AAB
```

---

## 2. App Store Connect — TestFlight → phased → public

Windy Word Mobile ships as `ai.windyword.app` under Apple Team
`VXZ434QL89`, ASC App ID `6759985867` (already wired in `eas.json`).

### 2.1 — Submit from EAS

```bash
eas submit --profile production --platform ios --latest
```

EAS uploads to App Store Connect and hands it off to Apple's processing
pipeline. Upload → "Processing" takes 10–30 min. You'll get a
notification email when it's ready for TestFlight.

### 2.2 — TestFlight

1. Open App Store Connect → TestFlight tab.
2. **Internal testing** first: add the internal test group (engineers +
   Grant). iTC automatically exposes new builds to internal testers
   without a review.
3. Run through `scripts/smoke-test.sh` against the TestFlight build.
4. **External testing**: promote to a public TestFlight group once
   internal passes. External testing **requires beta review** — Apple
   reviews the first external build on each version; typically <24h.
   Provide the reviewer account in the review notes (see
   `APP_STORE_METADATA.md` "Review Notes"; the OAuth device-code flow
   means you hand them a pre-provisioned email + test license key
   rather than a password).

### 2.3 — Phased rollout to public

1. App Store Connect → **App Store** tab → create a new version matching
   `app.json` `version`.
2. Attach the TestFlight build that passed external review.
3. In the version's **App Review** block: select **Phased Release for
   Automatic Updates** (7-day ramp: 1% → 2% → 5% → 10% → 20% → 50% →
   100%).
4. Submit for review. Apple review typically 24–48h.
5. On approval: release manually once you verify the final build
   identifier, or let phased release kick off automatically.

### 2.4 — Holding the parachute

If a phased release goes wrong:

- App Store Connect → Version → **Pause Phased Release** to freeze the
  rollout at the current percentage.
- **Expedited Review** for a hotfix (used sparingly — Apple grants 2–3
  per year).
- **Remove from sale** is the nuclear option; prefer a pause + ship a
  hotfix.

---

## 3. Google Play Console — internal → closed → open → production

Windy Word Mobile ships as `ai.windyword.app` (see `app.json` line 49).
Google's four-lane ladder maps onto our release process below.

### 3.1 — Submit from EAS

```bash
eas submit --profile production --platform android --latest
```

`eas.json` `submit.production.android.track` is `internal` with
`releaseStatus: draft` — EAS uploads the AAB as a draft on the
**Internal testing** track so a human has to promote it.

### 3.2 — Four promotion lanes

| Lane | Audience | Promote when |
| --- | --- | --- |
| **Internal testing** | up to 100 engineers / Grant | sanity-check build ran `smoke-test.sh` clean |
| **Closed testing** | named testers on an email list | stakeholder sign-off + copy review |
| **Open testing** | opt-in public beta | crash-free rate ≥ 99.5% over 48h on closed |
| **Production** | all users, staged rollout | open testing >7 days with no P0s |

Promote in the Play Console: *Release → Internal testing → Promote
release → pick target track → review → roll out*.

### 3.3 — Staged production rollout

On the Production track, **Staged rollouts** default: 5% → 10% → 20% →
50% → 100%. Promote manually each step after reviewing:

- **Crashes + ANRs** on Android vitals (threshold: <1% crash rate, <0.5%
  ANR rate)
- **Sentry** dashboard for unhandled JS errors
- **Store reviews** for UX regressions

### 3.4 — Halting a rollout

*Release → Production → Manage → Halt rollout*. The halt takes effect
within 1–2 hours. New installs stop seeing the rolled-out build;
existing installs keep it. Ship a hotfix rather than reverting.

---

## 4. Deep-link verification — Universal Links + App Links

Windy Word registers **seven** URL schemes (`app.json` line 9):
`windypro`, `windyword`, `windychat`, `windymail`, `windyfly`,
`windyclone`, `windycloud`. Custom schemes work out-of-the-box on both
platforms, but the `https://windyword.ai/...` universal links need
server-side association files hosted on windyword.ai.

### 4.1 — iOS Universal Links (AASA)

1. `app.json` already lists `applinks:windyword.ai` and
   `appclips:windyword.ai` under `associatedDomains`.
2. Publish `https://windyword.ai/.well-known/apple-app-site-association`
   (no extension, `Content-Type: application/json`) with:

   ```json
   {
     "applinks": {
       "apps": [],
       "details": [
         {
           "appID": "VXZ434QL89.ai.windyword.app",
           "paths": [
             "/recording/*",
             "/chat/*",
             "/fly/*",
             "/hatch",
             "/cloud/*",
             "NOT /app/*"
           ]
         }
       ]
     }
   }
   ```

3. Verify:
   ```bash
   curl -I https://windyword.ai/.well-known/apple-app-site-association
   # → 200, application/json, no redirects
   ```
4. On a physical device: tap a
   `https://windyword.ai/recording/abc-123` link in Messages. iOS
   should open the app (not Safari). First install: force-close and
   re-launch the app once so iOS fetches the AASA.

### 4.2 — Android App Links (assetlinks)

1. Add to `app.json` `android.intentFilters` (once per https host):
   ```json
   {
     "action": "VIEW",
     "autoVerify": true,
     "data": [{ "scheme": "https", "host": "windyword.ai" }],
     "category": ["BROWSABLE", "DEFAULT"]
   }
   ```
2. Publish `https://windyword.ai/.well-known/assetlinks.json`:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "ai.windyword.app",
         "sha256_cert_fingerprints": [
           "<EAS upload key SHA-256 — `eas credentials` to fetch>"
         ]
       }
     }
   ]
   ```
3. Verify:
   ```bash
   adb shell pm get-app-links ai.windyword.app
   # → "Domain verification state: verified"
   ```

### 4.3 — Smoke-test on-device

```bash
# iOS simulator
xcrun simctl openurl booted windypro://record
xcrun simctl openurl booted windychat://room/\!abc:chat.windychat.ai
xcrun simctl openurl booted windyclone://discover
xcrun simctl openurl booted windycloud://dashboard
xcrun simctl openurl booted windyfly://status

# Android emulator
adb shell am start -W -a android.intent.action.VIEW -d "windypro://record"
adb shell am start -W -a android.intent.action.VIEW -d "windyclone://order/ord-1"
adb shell am start -W -a android.intent.action.VIEW -d "windycloud://backup"
```

Each link should land on the right screen without crashing. Deep-link
sanitization is unit-tested in `tests/deep-links.test.ts` and
`tests/wave8-deep-links.test.ts`; these on-device checks validate the
OS-level routing on top of that.

---

## 5. Push notification certificates

### 5.1 — iOS: APNs p8 key

1. Apple Developer Portal → Certificates, Identifiers & Profiles →
   **Keys** → **+** → **Apple Push Notifications service (APNs)**.
2. Download the `.p8` file **once** (Apple never lets you re-download
   it) and record the **Key ID** (e.g. `ABC12DE3FG`).
3. Grab the **Team ID** (`VXZ434QL89` — also in `eas.json`).
4. Hand the trio to EAS:
   ```bash
   eas credentials
   # → iOS → production → Push Notifications: Set up a Push Key
   # Paste the Key ID, Team ID, and upload the .p8
   ```
   EAS stores the key in its credentials backend; rebuilds after this
   automatically pick it up.

### 5.2 — Android: FCM server key

1. Firebase Console → Windy Word project → **Project settings** →
   **Cloud Messaging** tab → **Server key** (Legacy) or create an
   **HTTP v1** service account.
2. If using Legacy:
   ```bash
   eas secret:create --scope project --name fcm-server-key --value "AAAA..."
   ```
   (Matches `eas.json` `production.env.FCM_SERVER_KEY`.)
3. If using HTTP v1 (recommended for new projects):
   ```bash
   eas credentials
   # → Android → Push Notifications → Firebase Cloud Messaging V1 service account
   # Upload the service-account JSON downloaded from Firebase
   ```
4. Drop the Firebase `google-services.json` into the project root (not
   committed — see `.gitignore`; supplied via
   `eas secret:create --type file` so it reaches the build container).

### 5.3 — Test end-to-end

After the next EAS production build + TestFlight/internal-track
install:

```bash
# iOS — via Expo push tool
npx expo-cli send-push --to 'ExpoPushToken[...]' --title 'Hatch complete' \
  --body 'Your Windy Fly agent is alive'

# Android
curl -X POST https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=${FCM_SERVER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"to":"<fcm-token>","notification":{"title":"Hi","body":"test"}}'
```

Both should surface a notification on the device within a few seconds.

---

## 6. In-app purchases — subscription tiers

Windy Word sells **one-time** unlocks, not subscriptions (see
`APP_STORE_METADATA.md` "No subscriptions. No recurring charges."), but
the plumbing runs through RevenueCat's subscription SDK because it
handles receipt validation + cross-platform entitlements.

### 6.1 — Product catalog

Keep this table in lock-step with `src/services/subscription.ts`,
`APP_STORE_METADATA.md`, and `src/services/license.ts`'s
`RECORDING_LIMITS` (the public promise). See
`tests/contract/test-tier-contract.test.ts` — it guards the invariant.

| Tier | App Store product ID | Play product ID | Price | Recording limit |
| --- | --- | --- | --- | --- |
| Pro | `ai.windyword.pro.lifetime` | `ai.windyword.pro.lifetime` | $49 | 30 min |
| Translate | `ai.windyword.translate.lifetime` | `ai.windyword.translate.lifetime` | $79 | 30 min |
| Translate Pro | `ai.windyword.translate_pro.lifetime` | `ai.windyword.translate_pro.lifetime` | $149 | 60 min |

### 6.2 — App Store Connect

1. App Store Connect → **Features** → **In-App Purchases** → create one
   **Non-Consumable** per tier (not auto-renewing — we're selling
   lifetime licenses).
2. Set the price tier (Apple's 50-cent-increment grid; use the closest
   tier at or above target price).
3. Screenshot + review-notes per product (Apple requires this for
   non-consumables).
4. Status: **Ready to Submit** once metadata complete; attach to the
   next version submission.

### 6.3 — Google Play Console

1. Play Console → **Monetize** → **Products** → **In-app products**.
2. Create one **Managed product** per tier with the same product IDs.
3. Activate each product after the app is at least on the internal
   track.

### 6.4 — RevenueCat wiring

1. RevenueCat dashboard → Project Settings → App Store / Play Store
   connections — upload the Apple shared secret and Google service
   account JSON.
2. **Entitlements**: `pro`, `translate`, `translate_pro` (matches
   `LicenseTier` in `src/types`).
3. **Offerings**: one offering `default`, with one package per tier
   linking the App Store + Play Store product IDs.
4. Paste the SDK keys into EAS secrets (see §1.2).
5. `src/services/subscription.ts` — confirm `initialize()` is called
   before any `getOfferings()` invocation.

### 6.5 — Sandbox testing

- **iOS**: create a sandbox Apple ID in App Store Connect → **Users and
  Access** → **Sandbox**. Sign in on-device via Settings → App Store.
  Run the purchase flow; no real charge happens.
- **Android**: add the tester's Google account to the **License
  testers** list in Play Console → **Setup** → **License testing**.
  Run the purchase flow on an internal-track install; no real charge.

---

## 7. Post-deploy monitoring

First 72 hours after a production release, watch:

- **Sentry** — unhandled JS errors, promise rejections, crashes. DSN in
  `.env.production` → `EXPO_PUBLIC_SENTRY_DSN`.
- **App Store Connect analytics** — install rate, crashes, 1-star review
  spikes.
- **Google Play vitals** — ANR rate, crash rate, wake-lock abuse.
- **account-server logs** — OAuth device-code success rate, hatch SSE
  error rate (Wave 8 ceremony).

If crash rate >1% or 1-star reviews spike: pause phased release / halt
rollout, triage, hotfix, resubmit.

---

## 8. Rollback

Neither platform allows a true "roll back" to a previous binary once a
higher build is live. The pattern is **roll forward**:

1. Identify the regression in Sentry / vitals.
2. `git revert` the offending commit(s) on `main` (or cherry-pick a fix
   onto a `hotfix/*` branch).
3. Bump `app.json` `version` by a patch and buildNumber/versionCode.
4. Rebuild + resubmit — Apple / Google expedite-review if the change is
   small and the regression is user-visible.

For app-side config issues that don't need a rebuild, OTA updates via
`eas update` can ship JavaScript-only fixes in minutes without a store
submission — provided the change doesn't touch native modules.
