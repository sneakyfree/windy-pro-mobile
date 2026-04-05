# Performance Audit — Windy Pro Mobile

**Audit Date:** 2026-03-31

---

## Summary

| Category | Status | Priority |
|----------|--------|----------|
| FlatList renderItem | 7 inline, 3 extracted | HIGH |
| JS Thread Blocking | Properly deferred | GOOD |
| Image Caching | No explicit policy | MEDIUM |
| Audio Resource Cleanup | Properly handled | GOOD |
| Bundle Size | @matrix-org/olm adds weight | LOW |

---

## 1. FlatList Inline Arrow Functions

Inline arrow functions in `renderItem` create a new function reference on every render, causing FlatList to re-render all visible items unnecessarily.

### Issues Found (7 instances)

| File | Line | Component | Fix |
|------|------|-----------|-----|
| `src/app/chat/index.tsx` | 344 | Contact/room list | Extract to `useCallback` |
| `src/app/chat/[roomId].tsx` | 303 | Message list | Extract to `useCallback` |
| `src/app/clone-data/index.tsx` | 149 | File list | Extract to `useCallback` |
| `src/app/clone-data/index.tsx` | 179 | Bundle list | Extract to `useCallback` |
| `src/app/translate/index.tsx` | 763 | Translation history | Extract to `useCallback` |
| `src/components/LanguagePickerSheet.tsx` | 92 | Language list | Extract to `useCallback` |
| `src/components/TranscriptionViewer.tsx` | 266 | Segment list | Extract to `useCallback` |

### Already Optimized (3 instances)

| File | Line | Approach |
|------|------|----------|
| `src/app/(tabs)/history.tsx` | 543 | Extracted `renderSession` function |
| `src/app/market/bundle-select.tsx` | 292 | Extracted + `useCallback` |
| `src/app/onboarding/index.tsx` | 240 | Extracted + `useCallback` |

### Recommended Fix Pattern

```tsx
// Before (causes re-renders)
<FlatList renderItem={({ item }) => <Card data={item} />} />

// After (stable reference)
const renderItem = useCallback(({ item }) => <Card data={item} />, []);
<FlatList renderItem={renderItem} />
```

---

## 2. JS Thread Usage

### Properly Deferred Initialization

`src/app/_layout.tsx:109` uses `InteractionManager.runAfterInteractions()` to defer non-critical services:
- Push notification registration
- Offline pack loading
- Subscription status check
- Cloud session restore

This prevents blocking the first frame render.

### Audio/Transcription Threading

- **On-device transcription** (whisper.rn): Runs on native thread via C++ bindings — does not block JS
- **Cloud transcription**: HTTP POST and WebSocket operate on network thread
- **Audio capture** (expo-av): Native recording module, no JS thread blocking
- **No Reanimated worklets found** — animations use standard `Animated` API, which is adequate for the current UI complexity

---

## 3. Image Caching

### Finding

Only one `Image` component found in the codebase:
- **File:** `src/app/video/index.tsx:414`
- **Usage:** `<Image source={{ uri: thumbnailUri }} style={styles.thumbnail} />`
- **Issue:** No explicit `cachePolicy` set

### Recommendation

The app is text-heavy with minimal image usage. No immediate performance concern, but for the video thumbnail:

```tsx
// Option 1: Use expo-image for better caching
import { Image } from 'expo-image';
<Image source={{ uri: thumbnailUri }} cachePolicy="memory-disk" />

// Option 2: Standard RN Image with cache header
<Image source={{ uri: thumbnailUri, cache: 'force-cache' }} />
```

---

## 4. Audio Resource Cleanup

### Record Tab (`src/app/(tabs)/index.tsx`)

Properly implemented:

1. **Unmount cleanup (lines 517-532):**
   - Clears duration interval
   - Cancels active recording via `audioCaptureService.cancelRecording()`
   - Cancels video capture via `videoCaptureService.cancelVideoCapture()`
   - Unloads playback sound via `playbackSound.unloadAsync()`

2. **Playback cleanup (lines 193-196):**
   - Calls `unloadAsync()` before creating new Sound instance

3. **Audio Capture Service (`src/services/audio-capture.ts`):**
   - `cancelRecording()` (line 130): Calls `stopAndUnloadAsync()` + deletes temp file
   - `stopRecording()` (line 90): Calls `stopAndUnloadAsync()` + clears meter callback

4. **Whisper Manager (`src/services/whisper-manager.ts:137`):**
   - `release()`: Calls `ctx.release()` and nulls references

**Status:** No memory leaks detected in audio pipeline.

---

## 5. Bundle Size Considerations

### @matrix-org/olm

- Adds ~300KB to the JS bundle (WASM module)
- Runtime-checked — only loaded if available
- Trade-off is acceptable for E2E encryption support

### matrix-js-sdk

- Large dependency (~500KB minified)
- Only imported in `chatClient.ts` — should be lazy-loaded if chat is not the primary use case

### Recommendation

Consider lazy-loading the Matrix SDK:

```tsx
// Lazy load on first chat open
const sdk = await import('matrix-js-sdk');
```

---

## 6. Additional Observations

### Memory

- `SyncManager` queue is capped at 500 items (`MAX_QUEUE_SIZE`) — prevents unbounded growth
- `CloneBundleService` stores bundle metadata in AsyncStorage — no memory pressure
- History tab uses extracted `renderSession` with proper FlatList optimization

### Network

- All API calls have 30s timeout (`REQUEST_TIMEOUT_MS`)
- Retry queue in `cloudApi.ts` limited to 5 retries per file
- Chunked uploads (2MB) prevent large memory allocation for big files

### Startup

- `_layout.tsx` defers 5 service initializations with `InteractionManager`
- Font loading is async with splash screen hold
- No synchronous file I/O on startup path
