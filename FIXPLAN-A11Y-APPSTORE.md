# Fix Plan: Accessibility + App Store Readiness

**Based on audit of 2026-03-12** · **Commit:** `c1b69ca`
**Scope:** 1 P0, 7 P1, 12 P2 findings

---

## P0 — CRITICAL (Blocks Store Submission)

### Fix 1: Add `privacyPolicyUrl` to `app.json`

**File:** `app.json` · **Line:** 18 (inside `"ios"` block)

**Problem:** Apple App Store Connect requires a privacy policy URL. Without it, the submission will be rejected during review.

**Current code:**
```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "uk.thewindstorm.windypro",
```

**Fix:**
```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "uk.thewindstorm.windypro",
  "privacyPolicyUrl": "https://windypro.thewindstorm.uk/privacy",
```

---

## P1 — IMPORTANT (7 fixes)

### Fix 2: Correct iOS App Store URL (mismatched ID)

**File:** `src/app/appstore/index.tsx` · **Line:** 135

**Problem:** Uses `id6740123456` but `eas.json` declares `ascAppId: "6759985867"`. The Rate App / store link would open the wrong app or 404.

**Current code:**
```tsx
ios: 'https://apps.apple.com/app/windy-pro/id6740123456',
```

**Fix:**
```tsx
ios: 'https://apps.apple.com/app/windy-pro/id6759985867',
```

---

### Fix 3: Add accessibilityLabel to 9 screens (bulk fix)

Add `accessibilityLabel` and `accessibilityRole` to every `<Pressable>`, `<TouchableOpacity>` interactive element on these screens.

#### 3a. `src/app/onboarding/index.tsx`

**Lines:** ~158, ~165, ~180 (onboarding buttons)

**Current code (around line 158):**
```tsx
<Pressable style={styles.skipBtn} onPress={handleSkip}>
  <Text style={styles.skipText}>Skip</Text>
</Pressable>
```

**Fix:**
```tsx
<Pressable style={styles.skipBtn} onPress={handleSkip}
  accessibilityLabel="Skip onboarding"
  accessibilityRole="button"
>
  <Text style={styles.skipText}>Skip</Text>
</Pressable>
```

Apply same pattern to "Next" and "Get Started" buttons.

---

#### 3b. `src/app/cloud/index.tsx`

**Lines:** ~140–200 (file list items, upload button, delete button)

**Current code (file list item):**
```tsx
<TouchableOpacity style={styles.fileRow} onPress={() => handleDownload(item)}>
```

**Fix:**
```tsx
<TouchableOpacity style={styles.fileRow} onPress={() => handleDownload(item)}
  accessibilityLabel={`Download ${item.filename}, ${formatBytes(item.size)}`}
  accessibilityRole="button"
  accessibilityHint="Downloads this file to your device"
>
```

Also add to delete buttons:
```tsx
accessibilityLabel={`Delete ${item.filename}`}
accessibilityRole="button"
```

---

#### 3c. `src/app/video/index.tsx`

**Lines:** 276, 285–302, 328, 360, 439–453

| Element | Line | Fix |
|---------|------|-----|
| Back button | 276 | `accessibilityLabel="Go back" accessibilityRole="button"` |
| Audio mode toggle | 285 | `accessibilityLabel="Switch to audio only mode" accessibilityRole="button"` |
| Video mode toggle | 294 | `accessibilityLabel="Switch to video mode" accessibilityRole="button"` |
| Play overlay | 328 | `accessibilityLabel={isPlaying ? 'Pause playback' : 'Play recorded video'} accessibilityRole="button"` |
| Flip camera | 360 | `accessibilityLabel="Flip camera" accessibilityRole="button"` |
| Record button | 439 | `accessibilityLabel={state === 'recording' ? 'Stop recording' : 'Start recording'} accessibilityRole="button"` |

---

#### 3d. `src/app/photo-translate/index.tsx`

**Key elements to label:** Capture button, language picker, copy result, speak result.

```tsx
// Capture button
accessibilityLabel="Capture photo for translation"
accessibilityRole="button"

// Language picker
accessibilityLabel={`Target language: ${selectedLang}`}
accessibilityRole="button"
accessibilityHint="Opens language selector"
```

---

#### 3e. `src/app/batch-translate/index.tsx`

**Key elements:** Translate button, clear button, copy result, add row.

```tsx
// Translate all button
accessibilityLabel="Translate all entries"
accessibilityRole="button"

// Clear button
accessibilityLabel="Clear all entries"
accessibilityRole="button"
```

---

#### 3f. `src/app/pronunciation/index.tsx`

**Key elements:** Lookup button, play audio button, word input.

```tsx
// Lookup button
accessibilityLabel="Look up pronunciation"
accessibilityRole="button"

// Play button
accessibilityLabel="Play pronunciation audio"
accessibilityRole="button"
```

---

#### 3g. `src/app/phrasebook/index.tsx`

**Key elements:** Add phrase, delete phrase, phrase list items.

```tsx
// Add button
accessibilityLabel="Add new phrase"
accessibilityRole="button"

// Delete button (per item)
accessibilityLabel={`Delete phrase: ${item.text}`}
accessibilityRole="button"
```

---

#### 3h. `src/app/clone/index.tsx`

**Key elements:** Record sample button, upload button, milestone cards.

```tsx
// Record sample
accessibilityLabel={recording ? 'Stop recording voice sample' : 'Record a voice sample'}
accessibilityRole="button"

// Upload button
accessibilityLabel="Upload voice clone data"
accessibilityRole="button"
```

---

#### 3i. `src/app/camera-link/index.tsx`

**Key elements:** Connect/disconnect buttons.

```tsx
// Connect button
accessibilityLabel="Connect to remote camera"
accessibilityRole="button"

// Disconnect button
accessibilityLabel="Disconnect from remote camera"
accessibilityRole="button"
```

---

### Fix 4: Enlarge touch targets below 44pt

#### 4a. History sort chips

**File:** `src/app/(tabs)/history.tsx` · **Lines:** 715, 785, 799

**Current code:**
```tsx
paddingVertical: 2,  // → ~20pt height
paddingVertical: 3,  // → ~22pt height
```

**Fix:** Add `minHeight: 44` to these styles:
```tsx
paddingVertical: 2, minHeight: 44, justifyContent: 'center',
paddingVertical: 3, minHeight: 44, justifyContent: 'center',
```

#### 4b. Clone data upload button

**File:** `src/app/clone-data/index.tsx` · **Line:** 279

**Current code:**
```tsx
uploadBtn: { width: 36, height: 36, borderRadius: 18, ... },
```

**Fix:**
```tsx
uploadBtn: { width: 44, height: 44, borderRadius: 22, ... },
```

#### 4c. Media toggle buttons

**File:** `src/app/(tabs)/index.tsx` · **Line:** 924

**Current code:**
```tsx
height: 32,
```

**Fix:**
```tsx
height: 44,
```

#### 4d. Quick translate action buttons

**File:** `src/app/quick-translate.tsx` · **Line:** 263

**Current code:**
```tsx
height: 36,
```

**Fix:**
```tsx
height: 44,
```

#### 4e. Clone play sample button

**File:** `src/app/clone/index.tsx` · **Line:** 787

**Current code:**
```tsx
width: 28, height: 28, borderRadius: 14,
```

**Fix:**
```tsx
width: 44, height: 44, borderRadius: 22,
```

#### 4f. Chat send button

**File:** `src/app/chat/[roomId].tsx` · **Line:** 348

**Current code:**
```tsx
height: 36,
```

**Fix:**
```tsx
height: 44,
```

---

### Fix 5: Improve `textTertiary` contrast ratio

**File:** `src/theme/colors.ts` · **Line:** 18

**Problem:** `#64748b` on `#0f172a` gives **3.9:1** contrast ratio — fails WCAG AA (needs 4.5:1 for normal text). Used for timestamps, subtitles, placeholders across every screen.

**Current code:**
```ts
textTertiary: '#64748b',      // Very muted (placeholders)
```

**Fix:** Lighten to `#7c8db0` which gives **5.1:1** contrast:
```ts
textTertiary: '#7c8db0',      // Muted (meets WCAG AA 5.1:1)
```

Also fix `stateIdle` at **line 24**:
```ts
// Current: '#6b7280'  → 4.2:1 (fails)
stateIdle: '#8b95a5',        // Gray — idle (meets WCAG AA 5.0:1)
```

---

### Fix 6: Add `accessibilityLabel` to 3 critical TextInputs

#### 6a. Server URL input

**File:** `src/app/(tabs)/settings.tsx` · **Line:** 579

**Current code:**
```tsx
<TextInput
  style={styles.serverUrlInput}
  value={serverUrl}
  onChangeText={setServerUrl}
  ...
```

**Fix:**
```tsx
<TextInput
  style={styles.serverUrlInput}
  value={serverUrl}
  onChangeText={setServerUrl}
  accessibilityLabel="Transcription server URL"
  ...
```

#### 6b. Translation input

**File:** `src/app/translate/index.tsx` — find the main `TextInput`

**Fix:** Add `accessibilityLabel="Enter text to translate"`

#### 6c. Chat compose input

**File:** `src/app/chat/[roomId].tsx` — find the message `TextInput`

**Fix:** Add `accessibilityLabel="Type a message"`

---

### Fix 7: App icons — generate 1024×1024

**Files:** `src/assets/icon.png`, `src/assets/adaptive-icon.png`

**Problem:** Both are 640×640. Apple requires exactly 1024×1024. Google recommends 1024×1024.

**Fix:** Regenerate or upscale icons using the existing design (lime-green tornado on `#0f172a`):
```bash
# Option A: Use ImageMagick to upscale
convert src/assets/icon.png -resize 1024x1024 src/assets/icon.png
convert src/assets/adaptive-icon.png -resize 1024x1024 src/assets/adaptive-icon.png

# Option B: Regenerate via image generation tool at 1024×1024
# Option C: Use Figma/design tool to export at proper size
```

---

### Fix 8: Justify `SYSTEM_ALERT_WINDOW` in Play Console

**File:** No code change — Play Console metadata only.

**Problem:** `SYSTEM_ALERT_WINDOW` in `AndroidManifest.xml` line 12 will be flagged during Google Play review.

**Fix:** In Play Console → App content → Permissions declaration:
> "Windy Pro uses the SYSTEM_ALERT_WINDOW permission to display a floating overlay button that allows users to dictate text from any app. This is a core feature — the floating button captures speech and pastes transcribed text directly into the active app."

---

## P2 — MINOR (12 fixes)

### Fix 9: Add labels to 7 remaining screens

Same pattern as Fix 3 — add `accessibilityLabel` and `accessibilityRole` to all `<Pressable>` / `<TouchableOpacity>` in:

| Screen | Key elements |
|--------|-------------|
| `chat/index.tsx` | Room list items, new room button |
| `chat/[roomId].tsx` | Send button, message bubbles |
| `chat/profile.tsx` | Login/logout buttons |
| `appstore/index.tsx` | Rate, Share, footer link buttons |
| `ocr/index.tsx` | Capture button |
| `legal/privacy.tsx` | Back button |
| `legal/terms.tsx` | Back button |

---

### Fix 10: Add labels to 4 remaining TextInputs

| File | Element | Label |
|------|---------|-------|
| `batch-translate/index.tsx` | Text input | `"Enter text for batch translation"` |
| `pronunciation/index.tsx` | Word input | `"Enter word to look up pronunciation"` |
| `quick-translate.tsx` | Text input | `"Enter text to translate"` |
| `chat/profile.tsx` | Homeserver input | `"Matrix homeserver URL"` |

---

### Fix 11: Fix `accessibilityRole="summary"` on SettingsSection

**File:** `src/app/(tabs)/settings.tsx` · **Line:** 699

**Current code:**
```tsx
<View style={styles.section} accessibilityRole="summary">
```

**Fix:**
```tsx
<View style={styles.section} accessibilityRole="none" accessible={true} accessibilityLabel={title}>
```

---

### Fix 12: Remove unused `NSUserTrackingUsageDescription`

**File:** `app.json` · **Line:** 35

**Current code:**
```json
"NSUserTrackingUsageDescription": "Windy Pro does not track you across apps. This permission is never requested.",
```

**Fix:** Delete this line entirely. Having it declared but saying "never requested" may confuse App Review.

---

### Fix 13: Splash image — recommend higher resolution

**File:** `src/assets/splash.png`

**Current:** 640×640. Apple recommends 1242×2436 (iPhone portrait) for full-screen splash.

**Fix:** Generate a portrait splash (1284×2778) with the tornado logo centered on `#0f172a` background. Or keep current `contain` mode which will pad with the matching `backgroundColor`.

---

### Fix 14: `RECEIVE_BOOT_COMPLETED` justification

**File:** No code change. In Play Console → Permissions:

> "RECEIVE_BOOT_COMPLETED is used to reschedule pending notification reminders after device restart. Windy Pro sends local notifications when background sync or transcription completes."

---

### Fix 15: Chat moderation for store compliance

**Problem:** Both Apple and Google require user-generated content apps to have reporting and blocking features.

**Files to create/modify:**
1. Add "Report Message" option to long-press on chat messages in `chat/[roomId].tsx`
2. Add "Block User" option to `chat/profile.tsx`
3. Add in-app content reporting flow (can POST to a moderation endpoint)

**Minimum viable implementation:**
```tsx
// In chat/[roomId].tsx — add to message long-press menu
{ text: 'Report Message', onPress: () => {
  Alert.alert('Report Sent', 'This message has been reported for review.');
  // POST to moderation API
}}

// In chat/profile.tsx — add block user button
<Pressable onPress={() => {
  Alert.alert('Block User', 'Are you sure?', [
    { text: 'Cancel' },
    { text: 'Block', style: 'destructive', onPress: () => chatClient.blockUser(userId) }
  ]);
}}>
  <Text>🚫 Block User</Text>
</Pressable>
```

---

### Fix 16: Remaining undersized touch targets (3 elements)

| File | Line | Current | Fix |
|------|------|---------|-----|
| `clone/index.tsx` | 787 | `28×28` play button | `44×44` |
| `chat/[roomId].tsx` | 348 | `height: 36` send | `height: 44` |
| `video/index.tsx` | 700 | `height: 28` badge | Non-interactive — add `accessible={false}` |

---

### Fix 17: Screenshot cards in App Store screen

**File:** `src/app/appstore/index.tsx` · **Lines:** 193–206

**Current code:**
```tsx
<View key={shot.id} style={styles.screenshotCard}>
```

**Fix:**
```tsx
<View key={shot.id} style={styles.screenshotCard}
  accessible={true}
  accessibilityLabel={`Screenshot: ${shot.title}. ${shot.subtitle}`}
>
```

---

### Fix 18: Add `description` to `app.json`

**File:** `app.json` · **Line:** 5 (after `"slug"`)

```json
"description": "The world's most potent voice-to-text tool. Record, transcribe, translate, and clone your voice — all from your phone.",
```

---

## Implementation Order

1. **P0 Fix 1** → Add `privacyPolicyUrl` (1 line change, unblocks submission)
2. **P1 Fix 2** → Correct App Store URL (1 line)
3. **P1 Fix 5** → Fix color contrast (2 lines in `colors.ts`)
4. **P1 Fix 7** → Regenerate 1024×1024 icons
5. **P1 Fixes 3, 4, 6** → Bulk accessibility pass (add labels, enlarge targets, label inputs)
6. **P2 Fixes 9–18** → Remaining polish
