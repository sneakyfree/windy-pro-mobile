# 🚀 Windy Word iOS — TestFlight Release Checklist

> **Superseded by `docs/eas-submission-checklist.md`** — that file is the
> current Grant-runnable playbook (Wave-3/4 inclusive, Apple credentials
> populated, iOS + Android in parallel). Keep this file for the historical
> RC1 record only.

## Pre-Submission (Automated — Done ✅ for v1.0.0; Wave-3/4 re-run below)

- [x] Version: `1.0.0` / Build: `2` (v1 release)
- [x] Bundle ID: `ai.windyword.app`
- [x] Deployment target: iOS 16.0
- [x] Typecheck: 0 errors
- [x] Tests at v1 release: 157/157 — see `docs/known-pre-existing-failures.md` for the current 787-total state
- [x] Simulator build: succeeded (0 errors)
- [x] Info.plist: 9 privacy descriptions + `ITSAppUsesNonExemptEncryption: false`
- [x] VoiceOver accessibility: all screens labeled (Record, Translate, Camera, History, Settings, Subscription, Quick-Translate, Tabs)
- [x] RevenueCat SDK linked: `RNPurchases` / `PurchasesHybridCommon 5.59.2`
- [x] Associated Domains: `applinks:windyword.ai` + `appclips:windyword.ai`
- [x] RC1 tag: `v1.0.0-rc.1`
- [x] Stability hardening: permission checks, error Alerts, deep link validation, offline handling
- [x] CHANGELOG.md generated

---

## Step 1: Configure Apple Credentials

Replace placeholders in `eas.json` → `submit.production.ios`:

```json
{
  "ascAppId": "<Your App Store Connect Apple ID (numeric)>",
  "appleId": "<your-apple-id@email.com>",
  "appleTeamId": "<Your 10-character Team ID>"
}
```

Find values:
- **ascAppId**: App Store Connect → My Apps → Windy Word → General → Apple ID
- **appleTeamId**: developer.apple.com → Account → Membership → Team ID

## Step 2: Build for Production

```bash
npx eas build --platform ios --profile production
```

EAS prompts for signing on first run → select "Let Expo handle it".
Build takes ~15-25 minutes on EAS cloud.

### Rollback
```bash
# If build fails, check logs:
npx eas build:list --platform ios --status errored

# Revert to RC1 if needed:
git checkout v1.0.0-rc.1
npx eas build --platform ios --profile production
```

## Step 3: Submit to TestFlight

```bash
npx eas submit --platform ios --profile production
```

### Rollback
```bash
# To submit a previous build instead:
npx eas submit --platform ios --profile production --id <BUILD_ID>
```

## Step 4: TestFlight Review

1. App Store Connect → TestFlight → Builds → iOS
2. Wait for **Processing** (~5-15 min)
3. Export Compliance → "No" (we set `ITSAppUsesNonExemptEncryption: false`)
4. Add test groups / individual testers
5. Fill Test Details: what to test, contact email

## Step 5: Verify on Device

- [ ] Install from TestFlight on physical device
- [ ] Record → transcribe → save to history
- [ ] Translate → press-and-hold → speech translation
- [ ] Camera OCR → point at text → translate
- [ ] Deep link: `windypro://translate?from=en&to=es&text=hello`
- [ ] RevenueCat purchase flow (sandbox)
- [ ] VoiceOver through all tabs
- [ ] Haptic feedback confirmed
- [ ] Offline error messages appear correctly

---

## Known Caveats

> [!WARNING]
> **Apple credential placeholders** must be filled in `eas.json` before Step 2.

> [!IMPORTANT]
> **RevenueCat sandbox**: Configure sandbox testers in App Store Connect → Users & Access → Sandbox.

> [!NOTE]
> **App Clip target**: Associated domain configured but native Xcode App Clip target not yet created. Optional for initial TestFlight.

> [!TIP]
> **Auto-increment**: `eas.json` has `autoIncrement: true`. Each `eas build` auto-bumps buildNumber.

---

## App Store Submission Assets

- [ ] Screenshots captured (see `APP_STORE_SCREENSHOTS.md`)
- [ ] Metadata entered in App Store Connect (see `APP_STORE_METADATA.md`)
- [ ] Privacy Policy live: `https://windyword.ai/privacy`
- [ ] Support URL live: `https://windyword.ai/support`
