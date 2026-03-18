# PRE-HANDTEST ANDROID AUDIT — Windy Pro Mobile

**Date:** 2026-03-18
**Auditor:** Hostile QA (automated code-level + static analysis)
**App Version:** 2.0.0 (versionCode 10)
**Package:** `uk.thewindstorm.windypro`

---

## Device / Emulator Specs

| Item | Value |
|------|-------|
| ADB | `/home/thewindstorm/Android/Sdk/platform-tools/adb` — installed ✅ |
| ANDROID_HOME | `/home/thewindstorm/Android/Sdk` |
| Connected device/emulator | **NONE** — `adb devices` shows empty list |
| Runtime testing | ❌ Not possible — no emulator or physical device available |
| Target SDK | 34 |
| Compile SDK | 35 |
| Min SDK | 24 (Android 7.0) |
| Kotlin | 1.9.25 |
| Build Tools | 35.0.0 |
| NDK | 26.1.10909125 |

> ⚠️ **No emulator/device was connected.** Phase 3 (runtime testing) and Phase 4 (performance) could not be executed. This audit is based on exhaustive static code analysis only.

---

## Build Status

| Profile | Status | Notes |
|---------|--------|-------|
| `eas.json` development | ✅ Configured | `developmentClient: true`, `distribution: internal` |
| `eas.json` preview | ✅ Configured | APK build via `:app:assembleRelease` |
| `eas.json` production | ✅ Configured | AAB via `:app:bundleRelease`, `credentialsSource: remote` |
| `android/` directory | ✅ Exists | Full native project generated |
| `build.gradle` SDK targets | ✅ SDK 35/34/24 | Meets Play Store 2025 requirements |
| ProGuard rules | ✅ Comprehensive | All custom native modules + Expo modules kept |
| Hermes engine | ✅ Enabled | Default JS engine |
| **Build execution** | ❌ **NOT TESTED** | No device/emulator to validate |

---

## Issue Table

| # | Area | Issue | Severity | Details |
|---|------|-------|----------|---------|
| 1 | **Native Bridge** | `WindyOverlayModule.getName()` returns `"WindyOverlayModule"` but JS accesses `NativeModules.WindyOverlay` | **P0** | Name mismatch means `NativeModules.WindyOverlay` will be `undefined` at runtime. Every overlay call will silently no-op because `isAvailable` check = `false`. The module should return `"WindyOverlay"` to match the JS side. File: `WindyOverlayModule.kt:47` vs `overlay.ts:20` |
| 2 | **Native Bridge** | `requestOverlayPermission()` has no `Promise` parameter but JS `await`s it | **P0** | `WindyOverlayModule.kt:107` — `requestOverlayPermission()` is a fire-and-forget method that opens Settings. But `overlay.ts:54` does `await WindyOverlay.requestOverlayPermission()` expecting a boolean result. This will either return `undefined` or throw at runtime. |
| 3 | **Native Bridge** | JS calls `WindyOverlay.hasOverlayPermission()` — method doesn't exist | **P0** | The Kotlin module only exposes `checkPermissions()` (line 98), not `hasOverlayPermission()`. JS `overlay.ts:35` calls `WindyOverlay.hasOverlayPermission()` which will throw `undefined is not a function`. |
| 4 | **Native Bridge** | JS calls `WindyOverlay.startOverlay()` / `stopOverlay()` — return type mismatch | **P1** | `overlay.ts:86` calls `await WindyOverlay.startOverlay()` expecting void but Kotlin resolves `true`. Minor, but `startOverlay()` may also reject with `PERMISSION_DENIED` which JS side doesn't catch individually. |
| 5 | **Native Bridge** | JS calls `WindyOverlay.isOverlayActive()` — exists in Kotlin ✅ | **OK** | Method exists at line 93. |
| 6 | **Native Bridge** | JS calls `WindyOverlay.pasteText(text)` — method doesn't exist | **P0** | Kotlin module has `onTranscriptionResult(text)` (line 128) but JS calls `WindyOverlay.pasteText(text)` (overlay.ts:114). Method name mismatch — will crash. |
| 7 | **Native Bridge** | JS calls `WindyOverlay.setOverlayState(state)` — method doesn't exist | **P1** | No `setOverlayState` method in `WindyOverlayModule.kt`. JS `overlay.ts:122` calls it. Will throw at runtime. |
| 8 | **Release Signing** | Production release uses **debug keystore** | **P0** | `app/build.gradle:112`: `release { signingConfig signingConfigs.debug }`. This means the release APK/AAB is signed with a debug key. Play Store will reject, and any existing users will fail to update. EAS `credentialsSource: remote` may override this, but the local build config is wrong. |
| 9 | **Back Button** | BackHandler is a no-op — always returns `false` | **P2** | `_layout.tsx:143`: `return false` — This means expo-router handles all back navigation. No root-screen exit confirmation dialog. Users on the home tab pressing Back will immediately exit the app without warning. Consider at least a double-tap-to-exit pattern. |
| 10 | **Back Button** | No BackHandler on modals/full-screen screens | **P2** | Screens like `session/[id]`, `translate`, `clone`, `ocr`, `subscription` are presented as modals but have no custom back handling. The hardware Back button should dismiss them, and expo-router likely handles this, but it's untested. |
| 11 | **Permissions** | `app.json` permissions missing `INTERNET` | **P2** | `app.json:50-54` lists only `RECORD_AUDIO`, `CAMERA`, `POST_NOTIFICATIONS`. However, the generated `AndroidManifest.xml` **does** include `android.permission.INTERNET` (line 7), so Expo correctly adds it. This is cosmetic but could confuse future developers. |
| 12 | **Permissions** | `app.json` missing `FOREGROUND_SERVICE` / `SYSTEM_ALERT_WINDOW` / `VIBRATE` / etc. | **P2** | AndroidManifest has these but `app.json` doesn't list them. They're added by Expo plugins and the native project, so functionality works, but the `app.json` permissions array is incomplete as documentation. |
| 13 | **Adaptive Icon** | Missing `backgroundImage` in adaptive icon config | **P2** | `app.json:44-47` only sets `foregroundImage` + `backgroundColor`. Best practice is to also provide a proper background layer image for better visual results across launcher styles. Currently uses solid `#0f172a`. |
| 14 | **Dimensions** | `Dimensions.get('window')` called at module scope | **P2** | Files `appstore/index.tsx:15`, `camera.tsx:19`, `onboarding/index.tsx:19`, `translate/index.tsx:36` all call `Dimensions.get('window')` outside components. These values are cached at module load and won't update on fold/unfold, split-screen, or rotation (even though orientation is locked, split-screen on Android still changes dimensions). Should use `useWindowDimensions()` hook instead. |
| 15 | **Overlay Service** | `startForegroundService()` without version check | **P1** | `WindyOverlayModule.kt:73` calls `reactContext.startForegroundService(intent)`. This API requires API 26+. Min SDK is 24. On API 24-25 devices, this will throw `NoSuchMethodError`. Should fall back to `startService()` for API < 26. |
| 16 | **Overlay Service** | `FloatingOverlayService` uses `startForeground()` in `onCreate()` without time limit awareness | **P2** | Android 12+ (API 31+) has stricter foreground service launch restrictions. The service uses `FOREGROUND_SERVICE_SPECIAL_USE` type which requires justification in Play Console. |
| 17 | **Overlay Service** | `hideOverlay()` removes view but doesn't stop the service | **P1** | `FloatingOverlayService.kt:375-380`: When long-press hides the overlay, the view is removed but the foreground service keeps running (notification persists, memory consumed). Only `ACTION_STOP` calls `stopSelf()`. |
| 18 | **Overlay Service** | Notification uses system icon `android.R.drawable.ic_btn_speak_now` | **P2** | `FloatingOverlayService.kt:149`: Uses a generic Android system icon instead of a branded Windy Pro icon. This looks unprofessional in the notification shade and may not exist on all manufacturer ROMs. |
| 19 | **Accessibility** | `AccessibilityNodeInfo.obtain()` deprecated in API 34+ | **P2** | `PasteAccessibilityService.kt:60,91,159` use the deprecated `AccessibilityNodeInfo.obtain()` static method. Should migrate to `new AccessibilityNodeInfo(source)` constructor for target API 34. |
| 20 | **Accessibility** | Clipboard access may fail on Android 13+ (API 33) | **P1** | `PasteAccessibilityService.kt:110`: Reading `clipboard.primaryClip?.getItemAt(0)?.text` throws `SecurityException` on Android 13+ unless the app is the default IME or has focus. AccessibilityService may bypass this, but it should be tested on API 33+ devices. |
| 21 | **Backup** | `allowBackup="true"` exposes local DB to cloud backup | **P2** | `AndroidManifest.xml:21`: `allowBackup="true"`. While `backup_rules.xml` excludes SharedPrefs, databases, and expo-secure-store, audio recording files in `files/` will still be backed up. Consider if this is intentional — recording files could be large and contain sensitive audio. |
| 22 | **Splash Screen** | `expo_splash_screen_status_bar_translucent` is `"false"` | **P2** | `strings.xml:4`: Status bar is NOT translucent during splash, but the app itself uses `translucent backgroundColor="transparent"` (`_layout.tsx:320`). This creates a visual jump from opaque status bar (splash) to transparent (app). |
| 23 | **Notification** | Push notification registration doesn't pass `deviceId` or `appVersion` | **P2** | `push-notifications.ts:129-130`: Sends `Device.modelName` and `Constants.expoConfig?.version` but no unique device identifier. Model name alone isn't enough to target specific devices. |
| 24 | **Notification** | `trigger: null` deprecated in expo-notifications | **P1** | `push-notifications.ts:151,168,185`: Uses `trigger: null` for immediate notifications. In recent expo-notifications versions, this should be `trigger: { type: 'timeInterval', seconds: 1, repeats: false }` or similar. |
| 25 | **Deep Links** | `windypro://` and `uk.thewindstorm.windypro://` both registered | **P2** | `AndroidManifest.xml:34-35`: Two custom schemes registered. Having the package name as a second scheme is unusual and could cause conflicts. Consider if both are needed. |
| 26 | **Deep Links** | App Links `autoVerify` configured but `.well-known/assetlinks.json` not verified | **P2** | `AndroidManifest.xml:38`: `android:autoVerify="true"` for `https://windypro.thewindstorm.uk/app`. If the Digital Asset Links file isn't hosted properly, verified links will silently fail and show a disambiguation dialog. |
| 27 | **RevenueCat** | Same API key used for iOS and Android | **P2** | `app.json:114-115`: `revenueCatIosKey` and `revenueCatAndroidKey` both use value `"test_sRWCoNXTMzpinPzDkvknRgtsQDh"`. They should be different per platform. Also using a **test key** (`test_`) — must be replaced with production keys before release. |
| 28 | **Play Console** | `eas.json` submit is set to `internal` track + `draft` | **OK** | `eas.json:46-47`: Correct for initial testing, but must change to `production` track for public release. |
| 29 | **Onboarding** | Overlay permission request uses `WindyOverlayModule` (different name than `WindyOverlay`) | **P0** | `onboarding/index.tsx:157`: `const { WindyOverlayModule } = NativeModules;` — This accesses the module by a DIFFERENT name than `overlay.ts` which uses `WindyOverlay`. Due to issue #1 (getName returns `"WindyOverlayModule"`), the onboarding screen will actually work, but `overlay.ts` won't. Inconsistent naming across codebase. |
| 30 | **Error Handling** | `overlay.ts` methods swallow errors with `console.warn` | **P2** | Lines 36, 71, 104: All errors in overlay bridge are caught and only logged with `console.warn`. No user-facing error feedback if overlay operations fail. |

---

## Android-Specific Features Audit

### Floating Overlay (FloatingTornado)
| Check | Status | Notes |
|-------|--------|-------|
| Native Kotlin modules exist | ✅ | All 5 files present: `FloatingOverlayService.kt`, `OverlayPermissionHelper.kt`, `PasteAccessibilityService.kt`, `WindyOverlayModule.kt`, `WindyOverlayPackage.kt` |
| Package registered in MainApplication | ✅ | `WindyOverlayPackage()` added in `MainApplication.kt:27` |
| AndroidManifest service declarations | ✅ | Both `FloatingOverlayService` and `PasteAccessibilityService` declared |
| SYSTEM_ALERT_WINDOW permission | ✅ | In AndroidManifest + requested at runtime |
| JS ↔ Native bridge functional | ❌ **BROKEN** | Module name mismatch (P0 #1), missing methods (P0 #3, #6), missing Promise params (P0 #2) |
| ProGuard keep rules | ✅ | All custom classes kept |

### Notification Channels
| Channel | Importance | Status |
|---------|------------|--------|
| `translation` | HIGH | ✅ With vibration + sound |
| `subscription` | DEFAULT | ✅ |
| `updates` | LOW | ✅ |
| `sync` | LOW | ✅ With description |
| `windy_overlay_channel` | LOW | ✅ Created in FloatingOverlayService |

### Accessibility Service
| Check | Status | Notes |
|-------|--------|-------|
| `accessibility_service_config.xml` | ✅ | Proper event types and flags |
| `@string/accessibility_service_description` | ✅ | Clear user-facing description |
| `BIND_ACCESSIBILITY_SERVICE` permission | ✅ | Correctly declared |

### Backup Rules
| Check | Status | Notes |
|-------|--------|-------|
| `backup_rules.xml` (pre-API 31) | ✅ | Excludes SharedPrefs, databases, expo-secure-store |
| `data_extraction_rules.xml` (API 31+) | ✅ | Same exclusions for cloud + device transfer |

---

## Files Verified

| File | Status |
|------|--------|
| `app.json` | ✅ Reviewed |
| `eas.json` | ✅ Reviewed |
| `android/build.gradle` | ✅ Reviewed |
| `android/app/build.gradle` | ✅ Reviewed |
| `android/app/proguard-rules.pro` | ✅ Reviewed |
| `AndroidManifest.xml` | ✅ Reviewed |
| `strings.xml` | ✅ Reviewed |
| `backup_rules.xml` | ✅ Reviewed |
| `data_extraction_rules.xml` | ✅ Reviewed |
| `accessibility_service_config.xml` | ✅ Reviewed |
| All 7 Kotlin native files | ✅ Reviewed |
| `src/services/overlay.ts` | ✅ Reviewed |
| `src/services/push-notifications.ts` | ✅ Reviewed |
| `src/app/_layout.tsx` | ✅ Reviewed |
| `src/app/onboarding/index.tsx` | ✅ Cross-referenced |
| `src/assets/icon.png` | ✅ Exists |
| `src/assets/adaptive-icon.png` | ✅ Exists |
| `src/assets/splash.png` | ✅ Exists |

---

## Runtime/Screenshot Testing

**❌ NOT PERFORMED** — No emulator or physical device connected.

The following screens need manual verification:
- [ ] Onboarding flow (3 screens)
- [ ] Main Record tab + mic button + waveform animation
- [ ] History tab
- [ ] Settings tab (all toggles)
- [ ] OCR Camera screen (permission prompt)
- [ ] Translate screen (language picker)
- [ ] Clone Data dashboard
- [ ] Subscription paywall
- [ ] App Store feature screen
- [ ] Dark mode toggle
- [ ] Rotation handling (locked to portrait — verify)
- [ ] Back button on every screen
- [ ] Airplane mode behavior
- [ ] Force-kill mid-recording recovery
- [ ] 5 back-to-back recordings (memory)

---

## Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| **P0** | **5** | Native bridge name mismatch, missing methods, broken overlay, debug keystore for release |
| **P1** | **4** | startForegroundService on API 24, overlay hide doesn't stop service, clipboard on API 33+, deprecated trigger:null |
| **P2** | **12** | cosmetic/minor: back button, Dimensions, splash bar, backup, icons, etc. |
| **OK** | **2** | Verified working as expected |
| **Not Tested** | **Many** | Runtime/UI testing blocked by no device |

---

## Verdict

# ❌ FAIL — NOT READY FOR ANDROID HAND-TEST

### Blocking Issues (must fix before any hand-testing):

1. **🔴 P0: Native bridge is completely broken.** `WindyOverlayModule.getName()` returns `"WindyOverlayModule"` but JS side accesses `NativeModules.WindyOverlay`. This means the entire floating overlay feature — the app's flagship Android-only feature — is silently dead. Fix: change `getName()` to return `"WindyOverlay"`.

2. **🔴 P0: 3 JS-called methods don't exist in Kotlin.** `hasOverlayPermission()`, `pasteText()`, and `setOverlayState()` are called from JS but never defined in the native module. These will throw runtime crashes if the name mismatch is ever fixed.

3. **🔴 P0: `requestOverlayPermission()` has no Promise.** JS awaits a boolean return but Kotlin returns void. This will resolve as `undefined` / behave unpredictably.

4. **🔴 P0: Release build signed with debug keystore.** Play Store will reject the AAB, and existing test users may not be able to update.

5. **🔴 P0: RevenueCat uses test keys.** Both platforms share the same `test_` key — production purchases will not work.

### Before hand-testing, fix all P0s, connect a device/emulator, and re-run this audit with runtime verification.
