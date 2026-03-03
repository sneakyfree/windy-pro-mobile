# 🚀 Windy Pro iOS — TestFlight Submission Checklist

## Pre-Submission (Automated — Done ✅)

- [x] Version: `1.0.0` / Build: `2`
- [x] Bundle ID: `uk.thewindstorm.windypro`
- [x] Deployment target: iOS 16.0
- [x] Typecheck: 0 errors
- [x] Tests: 145/145
- [x] Simulator build: succeeded (0 errors)
- [x] Info.plist: 9 privacy descriptions + `ITSAppUsesNonExemptEncryption: false`
- [x] VoiceOver accessibility: all 7 screens labeled
- [x] RevenueCat SDK linked: `RNPurchases` / `PurchasesHybridCommon 5.59.2`
- [x] Associated Domains: `applinks:` + `appclips:windypro.thewindstorm.uk`
- [x] RC1 tag: `v1.0.0-rc.1`
- [x] Stability hardening: permission checks, error Alerts, deep link validation
- [x] CHANGELOG.md generated

---

## TestFlight Submission Steps

### 1. Configure Apple Credentials

Replace placeholders in `eas.json` → `submit.production.ios`:

```json
{
  "ascAppId": "<Your App Store Connect App ID>",
  "appleId": "<your-apple-id@email.com>",
  "appleTeamId": "<Your 10-character Team ID>"
}
```

Find your **ascAppId** in [App Store Connect](https://appstoreconnect.apple.com) → My Apps → Windy Pro → General → App Information → Apple ID.

### 2. Build for Production

```bash
export PATH="/usr/local/lib/ruby/gems/4.0.0/bin:/usr/local/opt/ruby/bin:$PATH"
export SSL_CERT_FILE=/etc/ssl/cert.pem

npx eas build --platform ios --profile production
```

EAS will prompt to configure iOS signing on first run:
- Select **"Let Expo handle it"** for Distribution Certificate + Provisioning Profile
- Or provide existing cert/profile if you have one

### 3. Submit to TestFlight

```bash
npx eas submit --platform ios --profile production
```

This uploads the `.ipa` to App Store Connect and creates a TestFlight build.

### 4. TestFlight Review

In App Store Connect:
1. Go to **TestFlight** → Builds → iOS
2. Wait for **Processing** to complete (~5-15 min)
3. If prompted for **Export Compliance**, confirm:
   - "Does your app use encryption?" → **No** (we set `ITSAppUsesNonExemptEncryption: false`)
4. Add **test groups** or **individual testers**
5. Fill in **Test Details**: What to test, email, phone, notes

---

## Known Caveats

> [!WARNING]
> **Apple credential placeholders**: `eas.json` submit config has `REPLACE_WITH_*` placeholders.
> You MUST fill these in before running `eas submit`.

> [!IMPORTANT]
> **RevenueCat sandbox**: In-app purchases will use Apple's sandbox environment on TestFlight.
> Configure sandbox testers in App Store Connect → Users and Access → Sandbox.

> [!NOTE]
> **App Clip**: The `appclips:` associated domain is configured but the App Clip target is not yet
> created in Xcode. This is optional for initial TestFlight and can be added later.

> [!NOTE]
> **CocoaPods toolchain**: EAS cloud builds handle Ruby/CocoaPods automatically.
> The local toolchain fix (`SSL_CERT_FILE`, Homebrew Ruby) is only needed for local builds.

> [!TIP]
> **Auto-increment**: `eas.json` has `"autoIncrement": true` in the production profile.
> Each `eas build` will auto-bump the buildNumber, so you don't need to manually edit `app.json`.

---

## Post-Submission Checklist

- [ ] Verify TestFlight build appears in App Store Connect
- [ ] Install from TestFlight on physical device
- [ ] Test microphone recording flow
- [ ] Test camera OCR translation
- [ ] Test RevenueCat purchase flow (sandbox)
- [ ] Verify deep link: `windypro://translate?from=en&to=es&text=hello`
- [ ] Run VoiceOver through all tabs
- [ ] Confirm haptic feedback works on device

---

## App Store Submission Assets

- [ ] Screenshots captured (see `APP_STORE_SCREENSHOTS.md` for shot list)
- [ ] App Store metadata entered in App Store Connect (see `APP_STORE_METADATA.md`)
- [ ] Privacy Policy URL live: https://windypro.thewindstorm.uk/privacy
- [ ] Support URL live: https://windypro.thewindstorm.uk/support
