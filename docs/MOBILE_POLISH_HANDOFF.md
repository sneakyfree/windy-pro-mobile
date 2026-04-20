# Mobile Polish — Handoff Prompt for Fresh Claude Session

**Created:** 2026-04-19, end-of-day Wave 13 deploy session
**Purpose:** Self-contained brief for the next Claude session to pick up mobile app polish without context loss.

---

## Paste this to a fresh Claude session

> You're picking up `windy-pro-mobile` polish work after the Wave 13 backend deploy completed. **Read first**, in order:
>
> 1. `~/.claude/projects/-Users-thewindstorm/memory/MEMORY.md` (loads automatically)
> 2. `~/.claude/projects/-Users-thewindstorm/memory/project_wave13_launch_scope.md` — the strategic call deferring mobile from Wave 13 launch
> 3. `windy-pro-mobile/docs/wave12-testflight-report.md` — what shipped to TestFlight 2026-04-19 (build 16)
> 4. `windy-pro-mobile/docs/MOBILE_POLISH_HANDOFF.md` — this file
>
> Then proceed with the punch list below. Grant is not a developer — own the work, don't throw screenshots at him unless absolutely necessary. The TestFlight pipeline is now unblocked: any new build is one `eas build --platform ios --profile production` + `eas submit` away, and ASC group-add is a known one-click step (Team (Expo) is the existing internal group, group ID is grep-able in this repo's docs).

---

## Punch list (priority order)

### P0 — Blockers for "ship mobile in Wave 14"

1. **Name unification: "Windy Pro" vs "Windy Word"**
   Three sources disagree:
   - `app.json` `expo.name` = "Windy Word"
   - `APP_STORE_METADATA.md` = "Windy Word"
   - App Store Connect record = "Windy Pro" (https://appstoreconnect.apple.com/apps/6759985867)
   - Running app on iPhone shows "Windy Pro"
   Per Grant's branding memory (`feedback_branding_rules.md`), it should be **Windy Word**. The fix:
   - Rename in ASC (App Information → Name → "Windy Word"). Apple may require a new version submission for the rename to apply.
   - Verify `app.json.name` and `infoPlist.CFBundleDisplayName` both say "Windy Word".
   - Sweep the codebase for hardcoded "Windy Pro" strings in user-facing copy.
   - Bundle ID stays `uk.thewindstorm.windypro` (changing it would orphan all installs — never change a shipped bundle ID).

2. **iOS 26 SDK / Xcode 26 deadline — 2026-04-28**
   Apple stops accepting iOS 18.2-built uploads. Build 16 used iOS 18.2 SDK. Once EAS publishes an Xcode 26 image, pin it in `eas.json` under `build.production.ios.image` and re-submit. Check `eas-cli` release notes or `https://docs.expo.dev/build-reference/infrastructure/` for the image tag. If 2026-04-28 has already passed when you read this, this becomes urgent — every new build will reject until pinned.

3. **Profile / sign-in UX is missing.** On build 16, the app opens claiming "already logged in" with no visible profile avatar, no way to see who you are, no way to sign out, no way to sign in fresh. Find where session state is read (search for `identityApi` and `useSession` or similar in `src/`) and surface a real profile screen — at minimum: email shown, "Sign Out" button, "Switch Account" affordance.

### P0.5 — Grant's on-device findings from build 16 (2026-04-19 evening)

Grant installed build 16 and tested hands-on. Direct quotes:

- **"Build 4 looked much better than build 16."** Somewhere between Mar 3 (build 4) and Apr 19 (build 16), the UI regressed. The waves between were: Wave 8 Grandma Ribbon (in-app hatch CTA + Fly tab + deep-links), Wave 9 Launch Prep, Wave 10 Cleanup, Wave 11 Hardening, Wave 12 TestFlight unblock. Most likely regression sources: Wave 8 squeezing layouts to fit the ribbon row, or Wave 11 safe-area / deployment-target shuffles.
- **"The nav buttons on the bottom are very, very small."** Tab bar icons/labels shrunk. Check the tab bar config in `src/App.tsx` or wherever `createBottomTabNavigator` is used — tab bar height, icon size, label size, safe-area bottom insets.
- **"It still says Windy Pro everywhere."** See P0 #1 below — this is the naming unification item, confirmed user-visible.

**Concrete remediation plan:**
1. Check out build 4's commit (`git log --oneline -- app.json | tail -10` to find the buildNumber=4 commit) into a worktree. Side-by-side screenshot build 4 and build 16 on the same test device (iOS Simulator is fine). Identify which screens regressed.
2. For tab bar: bump `tabBarStyle.height` to ≥60pt on iPhone 14+, `tabBarIconStyle` font/icon size to 24–28pt, ensure `tabBarLabelStyle.fontSize` is ≥11pt. Grandma test: can a 65-year-old with reading glasses hit the right tab without squinting?
3. Open a PR with before/after screenshots. Get Grant's explicit sign-off on the tab bar sizes before merging.

### P1 — Required for grandma test

4. **Hatch CTA never tested on-device against live AWS backends.** The Wave 8 Grandma Ribbon shipped the CTA but build 16 has not been verified end-to-end against the live `https://windyword.ai/api/...` endpoints. Walk through: open app → sign in → tap hatch CTA → verify it provisions an agent against `pro.windyword.ai`'s `/api/v1/agent/credentials/issue` and deep-links into Fly. Search `src/services/hatchApi.ts` for the call sites.

5. **Backend URL config is fragile.** `eas.json` hardcodes `EXPO_PUBLIC_API_URL=https://windyword.ai`. The Wave 13 service mesh actually lives on subdomains (`pro.windyword.ai`, `cloud.windyword.ai`, `chat.windyword.ai`, `fly.windyword.ai`). Verify whether `windyword.ai/api/...` correctly proxies to the right backends, or whether the mobile app needs its own URL map. Check `src/config/api.ts` and `src/services/cloudApi.ts` for any hardcoded hostnames.

### P2 — Cleanup / hygiene

6. **Branch cleanup.** 4 local branches: `main`, `wave9/launch-prep`, `wave11/hardening`, `wave12/testflight-unblock`. Latest is `wave12/testflight-unblock` (10h ago). Decide which branches got merged to `main` and `git branch -d` the rest.

7. **Android Gradle plugin blocker** unchanged from Wave 11: `Plugin [id: 'expo-module-gradle-plugin'] was not found`. Hands-on Android SDK debugging required. Lower priority than iOS since iOS has TestFlight working.

---

## Constraints / things to know

- **Grant's role:** Founder, non-developer, gets exhausted by drag-and-drop and screenshot work. Use APIs/CLIs you have access to (EAS, ASC if there's a key in `~/.config/expo`, gh, etc.) before asking him for anything.
- **TestFlight pipeline is solved.** Don't re-debug it. If a new build needs to ship: `cd windy-pro-mobile && eas build --platform ios --profile production` → `eas submit --platform ios --latest` → wait ~10 min → ASC: Apps → Windy Pro → TestFlight → iOS Builds → click new build → "Provide Export Compliance" (None of the algorithms above) → Groups (+) → Team (Expo). Grant's iPhone will see it after force-quitting TestFlight.
- **Pro account-server lives on AWS** at `pro.windyword.ai` (Phase 1 of Wave 13). Identity, JWKS, /credentials/issue + /credentials/verify all live there. Mobile app should be hitting it.
- **Apple Developer:** Team ID `VXZ434QL89`, Apple ID `grantwhitmer3@gmail.com`. ASC App ID `6759985867`. Bundle ID `uk.thewindstorm.windypro`.
- **Branching policy:** Per `windy-pro-mobile/CLAUDE.md`, all changes go through PR against `main`. No direct commits except `docs/*`.

---

## Success criteria

You're done when:
- [ ] App on TestFlight shows "Windy Word" everywhere (or Grant has explicitly approved keeping "Windy Pro")
- [ ] Profile screen exists, shows current user, has Sign Out
- [ ] Hatch CTA verified end-to-end against AWS backends with a screen recording or written walkthrough
- [ ] iOS 26 SDK build shipped to TestFlight before 2026-04-28
- [ ] Grant has installed the resulting build and confirmed it feels "ship-quality"
