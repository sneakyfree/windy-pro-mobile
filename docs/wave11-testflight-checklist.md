# Wave 11 — TestFlight + Play Console Checklist

Step-by-step to take the Wave 11 EAS builds all the way onto Grant's
iPhone (TestFlight) and onto an Android test device (Play Console
Internal testing). Run through this in order. Items marked **[Grant]**
need Apple ID / Google interactive login and can't be done from CI.
Items marked **[EAS]** can be run from any shell with `EXPO_TOKEN` set.

Reality-check before you start:

- Apple Developer enrollment: Team `VXZ434QL89` (Grant Whitmer,
  Individual), active through **2027-03-03** ✓
- iOS bundle identifier: **`uk.thewindstorm.windypro`** (see native
  `ios/*.xcodeproj/project.pbxproj` — this is the canonical value;
  `app.json` was stale at `ai.windyword.app` and has been aligned on
  this branch)
- Android package: **`uk.thewindstorm.windypro`** (same story,
  `android/app/build.gradle:applicationId`)
- EAS project: `@windypro/windy-pro-mobile` (id
  `4fe09157-9616-4fce-9dcb-5d8b7c2297bf`)

---

## 1. App Store Connect setup (one-time) [Grant]

### 1.1 — Accept the latest Apple agreements

App Store Connect will silently block submissions if the Paid Apps /
Program License agreements aren't current.

1. Sign in to https://appstoreconnect.apple.com with the Apple ID
   `grantwhitmer3@gmail.com`.
2. Go to **Agreements, Tax, and Banking**. Accept any agreement with a
   "Review" banner.
3. Under **Paid Applications**, complete Tax + Banking if you ever want
   to sell the Pro / Translate / Translate Pro unlocks (free until this
   is filled). Can defer if launching free-only.

### 1.2 — Verify the App record

`eas.json` has `ascAppId: 6759985867` already wired. Verify:

1. App Store Connect → **My Apps** → find the Windy Word record.
2. Confirm:
   - Bundle ID: **`uk.thewindstorm.windypro`** (must match native; if
     the ASC record is wrong, `eas submit` will fail with a
     bundle-ID-mismatch error — see §5.4 below for the recovery).
   - SKU: any unique string; conventional is `windy-word-mobile`.
   - Primary Language: English (US).
3. If the app record doesn't exist yet: **+ New App** →
   - Platform: iOS
   - Name: `Windy Word`
   - Primary Language: English (US)
   - Bundle ID: `uk.thewindstorm.windypro` (pick from the registered
     list; if missing, register it at Apple Developer → Certificates,
     Identifiers & Profiles → Identifiers)
   - SKU: `windy-word-mobile`
   - User Access: Full Access

### 1.3 — Copy the ASC App ID

If a new record was just created, grab the numeric ID (visible in the
URL: `.../app/{ID}`) and replace `6759985867` in `eas.json`.

### 1.4 — Generate the App Store Connect API key

This is what lets `eas submit` upload binaries non-interactively (no
more 2FA dance on every submit). One-time.

1. App Store Connect → **Users and Access** → **Integrations** tab →
   **App Store Connect API** → **Team Keys** → **Generate API Key**.
2. Access: **App Manager** (sufficient for submissions).
3. Download the `.p8` file *once* — Apple never lets you re-download.
   Save to `~/Downloads/AuthKey_XXXXXXX.p8` or a secure password
   manager.
4. Record:
   - **Key ID** (10-char, e.g. `ABC123DEFG`)
   - **Issuer ID** (UUID, visible at the top of the Integrations page)
5. Hand the trio to EAS:
   ```bash
   eas credentials
   # → iOS → production → App Store Connect API Key
   # → "Add a new App Store Connect API Key"
   # Paste Key ID, Issuer ID, upload the .p8
   ```
6. Also paste the values into `.env.production` (see
   `.env.production.example` §ASC API Key).

---

## 2. Run the EAS build [EAS]

Already attempted on this branch — see the Wave 11 HARDENING_REPORT for
actual build IDs / URLs. To redo:

```bash
eas build --platform ios --profile production --non-interactive
eas build --platform android --profile production --non-interactive
```

Expect ~25 min per platform. `autoIncrement: true` in `eas.json` bumps
`buildNumber` / `versionCode` automatically.

Track progress at https://expo.dev/accounts/windypro/projects/windy-pro-mobile/builds

---

## 3. Submit to TestFlight [Grant + EAS]

Pre-requisite: §1.4 complete (ASC API Key registered with EAS).

```bash
eas submit --platform ios --profile production --latest --non-interactive
```

What happens:

1. EAS pulls the most recent finished iOS build.
2. Uses the ASC API Key to authenticate to App Store Connect.
3. Uploads the `.ipa` to Apple's processing pipeline.
4. Returns a submission URL.

Apple then takes **10–30 minutes** to process the build. You'll receive
an email at `grantwhitmer3@gmail.com` when it's ready to test.

### If EAS asks for Apple ID password interactively

Means §1.4 wasn't completed — the API key isn't registered. Either:

- Finish §1.4 and retry, or
- Run `eas submit --platform ios` (drop `--non-interactive`) and walk
  through the 2FA prompts. EAS will offer to save the credentials for
  next time.

---

## 4. Install TestFlight on the iPhone [Grant]

1. On the iPhone, open the **App Store**.
2. Search for **TestFlight** (first-party Apple app, free).
3. Install. Sign in with `grantwhitmer3@gmail.com`.
4. **If this is Grant's first time**: TestFlight will ask for permission
   to test apps — allow.

---

## 5. Accept the TestFlight invite [Grant]

### 5.1 — Internal tester setup (one-time per tester)

1. App Store Connect → **TestFlight** tab → **Internal Testing**.
2. Add Grant (`grantwhitmer3@gmail.com`) to the internal group — he's
   the account holder, so he may already be there.
3. Any build attached to the internal group gets a TestFlight email
   invite within seconds of processing completing.

### 5.2 — Redeem on-device

1. Email titled "You're invited to test Windy Word" arrives from
   `TestFlight <no-reply@email.apple.com>`.
2. Open it **on the iPhone** (not Mac — the "Start Testing" button
   deep-links into the TestFlight app).
3. Tap **Start Testing** → **Install**.
4. First launch: iOS shows a TestFlight-branded splash, then the real
   Windy Word splash.

### 5.3 — If the email never arrives

Check:
- App Store Connect → TestFlight → verify the build is **not** in
  "Expired" / "Testing Stopped" / "Missing Compliance" state.
- Most common: **Export Compliance** missing. Click the ⚠️ icon next to
  the build, answer the encryption questions (Windy Word uses only
  standard HTTPS; `app.json` already sets
  `ITSAppUsesNonExemptEncryption: false`, which clears most of this).
- Email went to spam. Check the TestFlight app directly — invites show
  up there even without email.

### 5.4 — Recovering from bundle-ID mismatch

If `eas submit` returns `ERROR ITMS-90006: bundle identifier
uk.thewindstorm.windypro does not match` (or similar), the ASC App
record was created against a different bundle ID. Options:

- **Easier**: Apple will let you rename the ASC record's bundle ID
  *only if the app has never had a published version*. Go to App Store
  Connect → App → **App Information** → "Bundle ID" dropdown → pick
  the correct identifier.
- **If renaming is greyed out**: create a new App record under the
  correct bundle ID (§1.2), update `eas.json` `ascAppId` to the new
  numeric ID, re-run `eas submit`.

---

## 6. On-device smoke test (post-install) [Grant]

These must be done on the physical iPhone. Check the box as you go.

### 6.1 — Launch + Home tab
- [ ] App opens from the TestFlight icon without crashing
- [ ] Splash screen (tornado emoji on dark background) → Home tab
- [ ] Title reads "Windy Pro" / "Voice to Text, Your Way"
- [ ] The big round record button is visible and taps registerable
- [ ] Sync status banner displays (may be empty — that's fine)

### 6.2 — Hatch CTA (Wave 8 deliverable)
- [ ] Home tab shows the lime-green "Hatch Your Agent" ribbon *if* Grant
  is signed in AND has no agent yet. Does not show if:
  - Not signed in (expected: ribbon hidden)
  - Already hatched an agent (expected: ribbon hidden)
- [ ] Tap the ribbon → opens the Hatch wizard (4-step flow)

### 6.3 — Sign-in via device-code
- [ ] Settings tab → "Sign In" → device code screen
- [ ] Pairing code (6-char alphanumeric) + short URL displayed
- [ ] On a desktop browser: open the URL, enter the code, log in
- [ ] iPhone screen transitions to "Signed in as {email}"

### 6.4 — Each tab renders
- [ ] **Word** (home) — Record screen
- [ ] **Chat** — Matrix room list
- [ ] **Fly** (Wave 8) — Fly tab shows either empty-state with Hatch CTA
  (if no agent) or live agent status (if hatched)
- [ ] **Mail** — WebView loads Windy Mail
- [ ] **Cloud** — Sync status, storage quota
- [ ] **More (Settings)** — All rows accessible

### 6.5 — Deep-link smoke (Wave 8 + legacy)

Open the iOS **Notes** app, paste each URL on its own line, tap each
with one finger. Expected: Notes greys the link out + a prompt "Open
in Windy Word?" → Yes → the right screen opens.

| URL | Expected |
| --- | --- |
| `windypro://record` | Home / record screen |
| `windyword://recording/smoke-001` | History or playback for `smoke-001` |
| `windychat://room/!abc:chat.windypro.com` | Chat room `!abc` (or chat tab if room missing) |
| `windymail://inbox` | Mail tab WebView |
| `windyfly://status` | Fly tab |
| `windyclone://discover` | Clone-data tab |
| `windyclone://order/ord-123` | Clone-data tab with order focused |
| `windycloud://dashboard` | Cloud tab |
| `windycloud://backup` | Cloud tab + sync queue drains |

If any fail silently: the scheme isn't registered in the installed
build. Check `app.json:9` matches what's in Info.plist
(`ios/Info.plist` URL types) and re-submit.

### 6.6 — Permission adversarial

Fresh install flow: uninstall the app → re-install via TestFlight →
deny each permission on first prompt. Expected:

| Permission | On deny | Expected UX |
| --- | --- | --- |
| Microphone | Cancel the alert | Home tap → Alert with "Open Settings" button (iOS) / Alert only (Android — known P2 gap, Wave 12) |
| Camera | Cancel the alert | Camera tab shows "Camera access needed" placeholder |
| Push notifications | Cancel the alert | App continues; no crash; notifications simply don't arrive |
| Location | Cancel the alert | Recording still works; location tag is null |
| Contacts (Chat onboarding only) | Cancel the alert | Chat onboarding proceeds without contact discovery |

Flag anything that **crashes** — that's a P0. "Silent-fail with a grey
screen" is P1. "Missing Open Settings button" is a P2.

---

## 7. Android — Play Console parallel track [Grant]

Windy Word doesn't have a Play Console record yet (as of 2026-04-18 —
update this doc when it does). Grant needs:

### 7.1 — Sign up for the Play Console

1. Go to https://play.google.com/console/signup.
2. $25 one-time fee, one-time identity verification (driver's
   license / passport — Google takes 1–3 business days to approve).
3. Create an **Organization** (not personal) account if Grant wants
   "Windy Word" in the publisher name instead of his legal name.

### 7.2 — Create the app

1. Play Console → **Create app**:
   - App name: **Windy Word**
   - Default language: English (US)
   - App or game: App
   - Free or paid: Free (IAPs handle paid unlocks)
   - Declare: `Windy Word complies with Play policies`, no ads.
2. **App content** checklist — complete all:
   - Privacy policy: `https://windyword.ai/privacy`
   - Data safety (sensitive; fill truthfully)
   - Content rating (Everyone — app is for productivity)
   - Target audience: 13+
   - News app: No
   - COVID-19 apps: No
   - Advertising ID: Not used
   - Government app: No

### 7.3 — Submit to Internal testing

```bash
eas submit --platform android --profile production --latest --non-interactive
```

Requires `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` set up (see §7.4). On first
success the AAB lands as a **draft** on the Internal testing track.

### 7.4 — Google Play service-account JSON (one-time)

1. Play Console → **Setup** → **API access** → **Link a Google Cloud
   project** → use or create a project.
2. Generate a service account with **Release Manager** permissions on
   the Windy Word app.
3. Download the JSON key. Save to `~/secrets/play-service-account.json`
   (or wherever `.env.production:GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
   points).
4. In the Play Console → Setup → API access, **grant access** to the
   service account for the Windy Word app specifically.

### 7.5 — Promote the draft

1. Play Console → **Release → Testing → Internal testing**.
2. Add testers: **Manage testers** → paste email addresses or invite a
   Google group.
3. Share the opt-in URL with Grant; he taps it once from his Android
   device → Play Store shows Windy Word as installable.
4. Install, run through §6 smoke tests (where applicable — some tabs
   will behave identically).

---

## 8. Rollback / hotfix

Neither platform lets you *remove* a published build, only ship a
higher one. If Wave 11 testing surfaces a P0:

1. Revert the offending commit on `main`.
2. Bump `app.json:version` by a patch (e.g. `2.0.1`). `autoIncrement`
   will take care of `buildNumber` / `versionCode`.
3. Re-run §2 + §3 (iOS) / §7.3 (Android).
4. Apple / Google expedited review if the fix is small and
   user-visible: **App Store Connect → App → Version → request
   expedited review**. Google has no formal expedited path, but
   internal-testing submissions clear within minutes regardless.

---

## 9. Checklist at a glance

Paste this into Wave 11's PR comment as you work through it.

- [ ] §1.1 — Apple agreements current
- [ ] §1.2 — ASC App record bundle ID = `uk.thewindstorm.windypro`
- [ ] §1.3 — `eas.json:ascAppId` matches real App Store Connect app
- [ ] §1.4 — ASC API Key generated + registered with EAS
- [ ] §2    — `eas build --platform ios --profile production` success
- [ ] §2    — `eas build --platform android --profile production` success
- [ ] §3    — `eas submit --platform ios` success
- [ ] §4    — TestFlight installed on Grant's iPhone
- [ ] §5    — TestFlight invite accepted, Windy Word installed
- [ ] §6.1  — Launch + Home tab pass
- [ ] §6.2  — Hatch CTA pass
- [ ] §6.3  — Sign-in pass
- [ ] §6.4  — All 6 tabs render
- [ ] §6.5  — 9 deep-link schemes route correctly
- [ ] §6.6  — 5 permission denial flows handled without crash
- [ ] §7.1  — Play Console account created
- [ ] §7.2  — Play app record created
- [ ] §7.4  — Google service account key uploaded
- [ ] §7.3  — `eas submit --platform android` success
- [ ] §7.5  — Android internal-testing install successful
