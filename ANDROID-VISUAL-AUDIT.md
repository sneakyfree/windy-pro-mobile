# ANDROID-VISUAL-AUDIT — Windy Pro Mobile

**Date:** 2026-03-18
**Auditor:** Hostile QA (emulator-based)
**App Version:** 2.0.0 (versionCode 10)
**Package:** `uk.thewindstorm.windypro`

---

## Environment

| Item | Value |
|------|-------|
| ADB | `/home/thewindstorm/Android/Sdk/platform-tools/adb` ✅ |
| AVD | `Pixel_7` (1080×2400, 420dpi) |
| System image | `sdk_gphone64_x86_64`, API 34 |
| Host OS | Linux |
| Build target | debug APK (`app-debug.apk`, 160MB) |
| Gradle build | ✅ **PASSED** — 3m7s, 979 tasks |
| APK location | `android/app/build/outputs/apk/debug/app-debug.apk` |

---

## ❌ EMULATOR FAILURE — VISUAL SCREENSHOTS NOT OBTAINED

### What Happened

The Android emulator's `PackageManagerService` (PMS) never becomes functional, preventing APK installation. Four separate launch strategies were attempted:

| # | Launch Flags | Boot Time | PMS Status | Screencap |
|---|-------------|-----------|------------|-----------|
| 1 | Default (snapshot) | Instant | `Can't find service: package` | N/A |
| 2 | `-no-snapshot-load` | ~140s (cold) | `Can't find service: package` (despite 277 services listed) | N/A |
| 3 | `-wipe-data -no-snapshot-load -gpu swiftshader_indirect` | Never completed (`boot_completed` never set after 5+ min) | N/A | `Error: No such file` |
| 4 | `-no-snapshot-load -gpu host` | ~50s | `Service package: found` ✅ but install hangs | `Permission denied` |

### Install Attempts on Attempt #4 (best case)

| Method | Result |
|--------|--------|
| `adb install -r -t` | `Failure calling service package: Broken pipe (32)` after 5+ min |
| `adb push` + `adb shell pm install` | Push: ✅ 266s for 160MB. Install: **hangs indefinitely** — no output |
| `adb shell pm list packages` | `Can't find service: package` (intermittent) |
| `adb shell screencap` | `Permission denied` |

### Root Cause Analysis

The `Pixel_7` AVD with API 34 system image has a corrupted or incompatible `system.img`. Key indicators:
1. `sys.boot_completed` returns `1` (kernel says booted)
2. `adb shell service list` shows 277 services (system_server runs)
3. But `service check package` returns `not found` or the service crashes with `Broken pipe` when accessed
4. `screencap` fails with `Permission denied` (suggests SELinux or init issues)
5. The `-gpu swiftshader_indirect` variant can't even complete boot animation

**This is a host environment issue, not an app issue.** The emulator system image or AVD configuration needs:
- Reinstallation of the system image: `sdkmanager "system-images;android-34;google_apis;x86_64" --install`
- Or creating a new AVD with a different system image (e.g., `google_apis_playstore` variant)
- Or using a physical Android device for testing

---

## Build Verification (PASSED ✅)

Despite the emulator failure, the Android build was fully verified:

```
BUILD SUCCESSFUL in 3m 7s
979 actionable tasks: 71 executed, 908 up-to-date
```

| Check | Status |
|-------|--------|
| Gradle sync | ✅ No errors |
| Kotlin compilation | ✅ All 7 native modules compiled |
| Hermes JSC bundling | ✅ |
| Resource merging | ✅ |
| Debug APK generation | ✅ `app-debug.apk` (160MB) |
| Debug signing | ✅ Signed with debug.keystore |
| Metro bundler startup | ✅ Started on port 8081 |

---

## Screenshots

**❌ ZERO screenshots obtained.** The emulator's broken PackageManagerService prevented app installation and `screencap` access.

### Screens That Need Verification (on a working device)

| # | Screen | Priority |
|---|--------|----------|
| 01 | Onboarding Screen 1 (Welcome) | High |
| 02 | Onboarding Screen 2 (Permissions) | High |
| 03 | Onboarding Screen 3 (Engine) | High |
| 04 | Main Record Tab (idle) | High |
| 05 | Main Record Tab (recording active) | High |
| 06 | History Tab (empty state) | Medium |
| 07 | Settings Tab | Medium |
| 08 | Language Picker | Medium |
| 09 | Translate Screen | Medium |
| 10 | Camera/OCR Screen | Medium |
| 11 | Clone Data Dashboard | Medium |
| 12 | Marketplace/Pair Browser | Medium |
| 13 | Subscription Screen | High |
| 14 | Chat Login Screen | Medium |
| 15 | About/Legal Screen | Low |
| 16 | Dark Mode (all major screens) | Medium |
| 17 | Landscape Mode | Low |
| 18 | Offline Mode (error banners) | High |
| 19 | Post-Recording (history entry) | High |
| 20 | Error/Permission Dialogs | Medium |

---

## Known Issues from Static Code Audit

These visual issues were identified through code analysis (see `PRE-HANDTEST-ANDROID-AUDIT.md` for full details):

| Issue | Visual Impact | Severity |
|-------|-------------|----------|
| `Dimensions.get('window')` at module scope | Layout won't update on fold/unfold/split-screen | P2 |
| `SCREEN_WIDTH` cached at import in `onboarding/index.tsx` | Onboarding slides may have wrong width on rotation | P2 |
| Notification uses `android.R.drawable.ic_btn_speak_now` | Generic system icon in notification shade | P2 |
| Splash `expo_splash_screen_status_bar_translucent` = `false` | Visual jump from opaque (splash) to transparent (app) status bar | P2 |
| No root-level back button exit confirmation | Pressing Back on home tab exits immediately | P2 |

---

## Verdict

# ❌ FAIL — VISUAL AUDIT BLOCKED

| Category | Status |
|----------|--------|
| Build | ✅ PASS |
| Emulator launch | ❌ FAIL (PackageManagerService broken) |
| APK install | ❌ FAIL (install hangs) |
| Screenshots captured | ❌ 0 of 20 |
| Visual bugs found | ❌ Cannot assess |

### Recommendations

1. **P0: Fix the emulator environment**
   - Run: `sdkmanager --install "system-images;android-34;google_apis_playstore;x86_64"`
   - Delete and recreate AVD: `avdmanager delete avd -n Pixel_7 && avdmanager create avd -n Pixel_7 -k "system-images;android-34;google_apis_playstore;x86_64" -d pixel_7`
   - Or use a **physical Android device** with USB debugging enabled

2. **P0: Re-run this audit on a working device**
   - Connect a physical device or working emulator
   - Run: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
   - Screenshot all 20 screens per the checklist above

3. **P1: Investigate the 160MB debug APK size**
   - Debug APK is 160MB — very large for React Native
   - Check if `x86`, `x86_64`, `armeabi-v7a`, `arm64-v8a` are all included (they are per `gradle.properties`)
   - For faster emulator install, build for x86_64 only: `./gradlew assembleDebug -PreactNativeArchitectures=x86_64`
