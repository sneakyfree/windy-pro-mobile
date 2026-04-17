# EAS Submission Checklist — TestFlight + Play Store

Grant-runnable playbook for shipping the next Windy Word release
(Wave 3 + Wave 4 inclusive).

All commands run from `/Users/thewindstorm/windy-pro-mobile` unless otherwise
noted.

---

## 0. Pre-flight — green-gate before anything touches the stores

```bash
cd /Users/thewindstorm/windy-pro-mobile
git fetch --tags
git tag --list wave-4-verified          # must exist (tsc + Wave-3/4 tests green)
npx tsc --noEmit                         # must be silent
npm test -- identityApi cloudApi trustApi   # 41/41
```

Also confirm the account-server `/device` approval page is live:

```bash
curl -fsS https://windyword.ai/device -o /dev/null && echo OK
```

If that 404s, **stop** — the device-code flow cannot complete on a fresh
device, which means every reviewer at Apple will see a broken sign-in.

Screenshots (see §7) must exist in `docs/screenshots/wave4/` before ASC
upload.

---

## 1. Apple credentials (already wired in `eas.json`)

Confirm `eas.json:submit.production.ios` still reads:

```json
{
  "appleId": "grantwhitmer3@gmail.com",
  "appleTeamId": "VXZ434QL89",
  "ascAppId": "6759985867"
}
```

If the App Store Connect Apple ID has rotated, update it here first. No
other iOS secret is required — EAS uses remote-managed signing
(`credentialsSource: remote`).

Pull remote credentials fresh if you've rotated any:

```bash
npx eas credentials --platform ios
```

---

## 2. Android credentials (already wired)

`eas.json:build.production.android` uses `credentialsSource: remote`.
`submit.production.android` posts to the internal track as a draft.

First-time only, or after any service-account rotation:

```bash
npx eas credentials --platform android
# → Upload the Google Play service account JSON when prompted.
```

---

## 3. Bump version + build number

`app.json` + `eas.json` — the production profile has `autoIncrement: true`,
so the iOS `buildNumber` and Android `versionCode` bump automatically. The
user-visible `expo.version` is **not** auto-bumped. Update it manually:

```bash
# Edit app.json → expo.version (e.g. "2.0.0" → "2.1.0")
# Commit the bump:
git add app.json
git commit -m "chore: bump version to 2.1.0 for Wave 3+4 release"
git push origin main
```

---

## 4. Build — iOS + Android in parallel

```bash
npx eas build --platform all --profile production --non-interactive --wait
```

- EAS cloud build: 15–25 min iOS, 8–15 min Android.
- On completion: `*.ipa` and `*.aab` URLs print to the terminal and appear
  in the EAS dashboard.

If anything fails:
```bash
npx eas build:list --platform ios --status errored --limit 3
npx eas build:view <build-id>
```

---

## 5. Submit to TestFlight

```bash
npx eas submit --platform ios --profile production --latest
```

EAS grabs the most-recent successful iOS build and posts it to App Store
Connect. Processing on Apple's side: 15–30 min to appear in the
TestFlight tab.

Verify at https://appstoreconnect.apple.com/apps/6759985867/testflight/ios

---

## 6. Submit to Play Store (internal track, draft)

```bash
npx eas submit --platform android --profile production --latest
```

Lands as a **draft** on the `internal` track. Promote to `closed` (alpha),
`open` (beta), then `production` manually in the Play Console once QA signs
off.

Verify at https://play.google.com/console → Windy Word → Testing →
Internal testing.

---

## 7. App Store Connect — screenshot + metadata upload

Screenshots required (6.7" iPhone — iPhone 15 Pro Max / 16 Pro Max, 1290×2796):

| # | Screen | Captured by |
|---|---|---|
| 1 | `/auth/login` — "Sign in with Windy" button | Wave-4 smoke test |
| 2 | `/auth/device-code` — user_code pill + Approve button | Wave-4 smoke test |
| 3 | `/(tabs)` — main Word tab (existing, capture fresh) | Wave-4 smoke test |
| 4 | `/(tabs)/mail` — native inbox list | Wave-4 smoke test (requires signed-in user) |
| 5 | `/settings/trust` — Trust & Clearance card | Wave-4 smoke test (signed-in user with Eternitas passport) |

Source of truth: `docs/screenshots/wave4/*.png`.

Also required for App Store submission:

- **App Name**: `Windy Word — Speech to Text` (see `APP_STORE_METADATA.md`
  — note: update from "Windy Pro" if still listed that way).
- **Subtitle**: `Record, Transcribe, Translate`
- **Category**: Productivity / Utilities
- **Description + Keywords**: see `APP_STORE_METADATA.md`. Add one line to
  the description covering Wave 3+4:
  > "One sign-in across Windy Word, Chat, Mail, Cloud, and Fly. See your
  > agent's trust level at a glance."
- **Privacy Policy URL**: `https://windyword.ai/privacy` (matches
  `app.json:22`).
- **Support URL**: `https://windyword.ai/support` — **ensure this page
  exists** before submitting, Apple rejects 404s here.
- **Marketing URL**: `https://windyword.ai`
- **Copyright**: `© 2026 Windy Word`
- **Age Rating**: 4+ (no user-generated public content).
- **Export Compliance**: `ITSAppUsesNonExemptEncryption: false` is set in
  `app.json:39` — Apple will not prompt further.

### Review notes for Apple

Paste verbatim into ASC → App Information → Review Notes:

> Windy Word uses the device-code OAuth flow to sign in against
> windyword.ai (our account server). To test:
>
> 1. Launch the app and tap "Sign in with Windy".
> 2. The app displays a short code (e.g. `ABCD-EFGH`) and a button that
>    opens windyword.ai/device in Safari.
> 3. Sign in with the review account (credentials below) and enter the code.
> 4. The app completes sign-in automatically and lands on the main screen.
>
> Review account:
>   - Email: `apple-review@windyword.ai`
>   - Password: (populate in ASC before submitting)
>
> Mail tab reads the signed-in user's inbox via the Windy Mail API
> (https://mail.windymail.ai). Trust & Clearance reads public Eternitas
> integrity profiles (no auth). The camera is used for optional OCR
> translation. Microphone is used for on-device speech-to-text.

---

## 8. Play Console — listing + metadata upload

Screenshots (phone, 1080×1920 or 1080×2400) — same five screens as §7.

Required metadata:

- **Short description** (80 chars): `Your voice, transcribed — record, translate, and clone from your phone.`
- **Full description**: use `PLAY_STORE_LISTING.md` as the source; add the
  Wave 3+4 sentence from §7.
- **Privacy Policy**: `https://windyword.ai/privacy`
- **App category**: Productivity
- **Content rating questionnaire**: answer "No" to every sensitive-content
  question (we don't have UGC, violence, etc.). Expect an "Everyone"
  rating.
- **Target audience**: 13+ (adults, does not appeal to children — lets us
  skip Designed-for-Families requirements).
- **Ads**: No.
- **Data safety form**: microphone audio is processed on-device, never
  uploaded; email address is collected for authentication; no location, no
  contacts.

---

## 9. Beta tester invite list

Grant's standing list:

- grantwhitmer3@gmail.com — owner (auto-added)
- (add others here before first release; keep the list under 20 for
  TestFlight's non-public-review limit)

Invite flow:

```bash
# iOS / TestFlight — via ASC UI:
#   Users and Access → Testers → + → paste emails

# Android / Play Console — internal testers:
#   Testing → Internal testing → Testers → Create email list
```

---

## 10. Post-submission

- iOS: expect review decision in 24–72 h. Watch
  https://appstoreconnect.apple.com/apps/6759985867/appstore/metadataprocessing
- Android internal track: available immediately after processing.
- Promote Android internal → closed → open → production only after Apple
  approves, so both platforms drop simultaneously.

Rollback plan:

```bash
# iOS — in ASC, "Reject" the pending version before Apple approves it,
# or "Remove from Sale" an approved version. Past builds remain in
# TestFlight for reinstall.

# Android — in Play Console, halt the rollout, or roll back to the prior
# production track build. Internal/closed tracks don't propagate to
# stable users.
```

---

## 11. After the release ships

Update these in the same PR:

- `CHANGELOG.md` — add the Wave 3+4 entry (one-sign-in, deep links, mail
  tab, Trust UI).
- `app.json` — bump the next `expo.version` placeholder so the next
  release starts from a clean slate.
- Tag `git tag -a v<version>-released -m "Released to TestFlight + Play"`.
