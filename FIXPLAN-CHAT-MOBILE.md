# Windy Chat — Mobile Audit + Fix Plan

**Date:** 2026-03-12 · **Commit:** `cb34725` · **Scope:** 6 files, 1,973 lines

---

## FILES AUDITED

| File | Lines | Role |
|------|------:|------|
| `src/services/chatClient.ts` | 587 | Matrix SDK wrapper (singleton) |
| `src/services/chatTranslate.ts` | 196 | LRU-cached translation middleware |
| `src/app/(tabs)/chat.tsx` | 5 | Re-export barrel |
| `src/app/chat/index.tsx` | 404 | Chat home (room list) |
| `src/app/chat/[roomId].tsx` | 364 | Conversation (message view) |
| `src/app/chat/profile.tsx` | 417 | Login/profile/settings |
| `src/services/__tests__/chatTranslate.test.ts` | 264 | 14 tests (passing) |

---

## AUDIT 1 — PROTOCOL COMPLIANCE

### Finding PC-1: `Room.timeline` event name is SDK-version-dependent · **P1**

**File:** `chatClient.ts` · **Line:** 258

**Problem:** The event name `'Room.timeline'` is the legacy (v1) event name. In matrix-js-sdk v19+, the proper way to listen is via `client.on(RoomEvent.Timeline, ...)` using the `RoomEvent` enum. If the bundled SDK version is v19+, the string form may still work but is deprecated and could break in future versions.

**Current:**
```ts
this.client.on('Room.timeline', (event: any, room: any) => { ... });
```

**Fix:**
```ts
import { RoomEvent, RoomMemberEvent } from 'matrix-js-sdk';
this.client.on(RoomEvent.Timeline, (event, room) => { ... });
```

---

### Finding PC-2: `RoomMember.typing` event name is deprecated · **P1**

**File:** `chatClient.ts` · **Line:** 278

**Same issue as PC-1.** Should use `RoomMemberEvent.Typing`.

**Current:**
```ts
this.client.on('RoomMember.typing', (event: any, member: any) => { ... });
```

**Fix:**
```ts
this.client.on(RoomMemberEvent.Typing, (event, member) => { ... });
```

---

### Finding PC-3: `register()` ignores interactive authentication (UIAA) · **P1**

**File:** `chatClient.ts` · **Lines:** 143–184

**Problem:** Most Matrix homeservers use User-Interactive Authentication API (UIAA) for registration. The current code passes `type: 'm.login.dummy'` which only works on servers with no auth requirements. On `matrix.org` (the default), registration requires reCAPTCHA or email verification, so `register()` will always fail with a 401 containing `flows` data.

**Current:** User sees generic "Registration failed" with no guidance.

**Fix:** Detect UIAA 401 response, extract supported flows, and either:
1. Redirect to web-based registration (`openURL` to homeserver's Element registration page)
2. Or show a message: "Registration on matrix.org requires browser verification. Please register at element.io and then sign in here."

---

### Finding PC-4: `sendTyping` timeout of 20000ms is spec-compliant but fires on every single keystroke · **P2**

**File:** `chatClient.ts` · **Line:** 425 | `chat/[roomId].tsx` · **Line:** 106

**Problem:** `handleTextChange` calls `chatClient.sendTyping()` on every character typed. The Matrix spec says typing notifications should be debounced. This generates excessive HTTP requests (one per keystroke).

**Current (`[roomId].tsx:103–108`):**
```ts
const handleTextChange = (text: string) => {
    setInputText(text);
    if (roomId) {
        chatClient.sendTyping(roomId, text.length > 0);
    }
};
```

**Fix:** Debounce typing notifications:
```ts
const typingTimeout = useRef<NodeJS.Timeout | null>(null);

const handleTextChange = (text: string) => {
    setInputText(text);
    if (roomId && text.length > 0) {
        if (!typingTimeout.current) {
            chatClient.sendTyping(roomId, true);
        }
        clearTimeout(typingTimeout.current!);
        typingTimeout.current = setTimeout(() => {
            chatClient.sendTyping(roomId, false);
            typingTimeout.current = null;
        }, 3000);
    } else if (roomId) {
        clearTimeout(typingTimeout.current!);
        typingTimeout.current = null;
        chatClient.sendTyping(roomId, false);
    }
};
```

---

### Finding PC-5: `setPresence` called but no `offline` on unmount · **P2**

**File:** `chat/[roomId].tsx` · **Lines:** 79, 81–84

**Problem:** `chatClient.setPresence('online')` is called when entering the room, but presence is never set back to `'unavailable'` when leaving.

**Fix:** Add to cleanup:
```ts
return () => {
    unsubMsg();
    unsubTyping();
    chatClient.setPresence('unavailable');
};
```

---

### Finding PC-6: No E2EE verification despite profile claiming "E2E encrypted" · **P2**

**File:** `chat/profile.tsx` · **Line:** 271

**Problem:** The profile screen displays "Matrix (E2E encrypted)" but the `initClient()` call in `chatClient.ts` does not configure Olm/Megolm encryption. E2E encryption requires `cryptoCallbacks`, `olmDevice`, and session key storage. Without this, messages are sent unencrypted despite the UI claim.

**Fix:** Either:
1. Remove the "E2E encrypted" label and replace with "Transit encrypted (TLS)"
2. Or implement full E2EE using `client.initCrypto()` after `startClient()`

---

## AUDIT 2 — MEMORY LEAKS

### Finding ML-1: Matrix sync never stops · **P0**

**File:** `chatClient.ts` · **Lines:** 291–294

**Problem:** `client.startClient()` starts a long-polling sync loop that runs forever. The singleton pattern means it's never stopped except on explicit `logout()`. If the user navigates away from all chat screens, the sync loop continues running, consuming CPU, memory, and network bandwidth indefinitely.

**Current:**
```ts
if (!this.started) {
    await this.client.startClient({ initialSyncLimit: 20 });
    this.started = true;
}
```

**Fix:** Add a `stopSync()` method and call it when no chat screens are mounted:
```ts
stopSync(): void {
    if (this.client && this.started) {
        this.client.stopClient();
        this.started = false;
    }
}
```
Use a reference counter in chat screens:
```ts
// In each chat screen's useEffect:
chatClient.incrementActiveScreens();
return () => chatClient.decrementActiveScreens();

// In chatClient:
private activeScreens = 0;
incrementActiveScreens() { this.activeScreens++; }
decrementActiveScreens() {
    this.activeScreens--;
    if (this.activeScreens <= 0) {
        this.stopSync();
    }
}
```

---

### Finding ML-2: Event listeners on the Matrix client are never removed · **P1**

**File:** `chatClient.ts` · **Lines:** 258–288

**Problem:** `this.client.on('Room.timeline', ...)` and `this.client.on('RoomMember.typing', ...)` are registered in `initClient()` but never removed with `.off()`. If `initClient()` is called multiple times (e.g., after session restore → logout → login), listeners accumulate.

**Fix:** Store handler references and remove in `logout()`:
```ts
private timelineHandler: ((...args: any[]) => void) | null = null;
private typingHandler: ((...args: any[]) => void) | null = null;

// In initClient:
this.timelineHandler = (event, room) => { ... };
this.client.on('Room.timeline', this.timelineHandler);

// In logout:
if (this.timelineHandler) {
    this.client.off('Room.timeline', this.timelineHandler);
}
```

---

### Finding ML-3: Translation callback can fire after `[roomId]` screen unmount · **P1**

**File:** `chat/[roomId].tsx` · **Lines:** 64–71

**Problem:** `chatTranslateService.translateMessage(msg)` is async. If the user navigates away while a translation is in progress, the `await` resolves and calls `setMessages()` on an unmounted component. This triggers the React warning: "Can't perform a React state update on an unmounted component."

**Current:**
```ts
const unsubMsg = chatClient.onMessage(async (msg: ChatMessage) => {
    if (msg.roomId !== roomId) return;
    const translated = await chatTranslateService.translateMessage(msg);
    setMessages(prev => [...prev, translated]);  // ← may fire after unmount
    ...
});
```

**Fix:** Use a mounted ref:
```ts
const isMounted = useRef(true);
useEffect(() => {
    return () => { isMounted.current = false; };
}, []);

// In listener:
const translated = await chatTranslateService.translateMessage(msg);
if (!isMounted.current) return;  // ← guard
setMessages(prev => [...prev, translated]);
```

---

### Finding ML-4: `handleSearch` has no debounce — fires API call on every keystroke · **P2**

**File:** `chat/index.tsx` · **Lines:** 89–99

**Problem:** `handleSearch` calls `chatClient.searchUsers(query.trim())` on every character after 2 chars. With fast typing, this creates many concurrent API requests (each a full HTTP round-trip to the homeserver's `/user_directory/search`).

**Fix:** Debounce with 300ms delay:
```ts
const searchDebounce = useRef<NodeJS.Timeout | null>(null);

const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (query.trim().length < 2) {
        setSearchResults([]);
        return;
    }
    searchDebounce.current = setTimeout(async () => {
        setSearching(true);
        const results = await chatClient.searchUsers(query.trim());
        setSearchResults(results);
        setSearching(false);
    }, 300);
};
```

---

## AUDIT 3 — RACE CONDITIONS

### Finding RC-1: Double-tap can send duplicate messages · **P1**

**File:** `chat/[roomId].tsx` · **Lines:** 89–99

**Problem:** The `sending` guard is set AFTER `handleSend` is entered. With fast double-taps, two calls can pass the `if (!text || !roomId || sending) return` check before `setSending(true)` takes effect (React state is batched and not immediately visible).

**Current:**
```ts
const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !roomId || sending) return;
    setSending(true);           // ← not visible synchronously
    setInputText('');
    await chatClient.sendMessage(roomId, text, ...);
    setSending(false);
};
```

**Fix:** Use a `useRef` for the guard:
```ts
const sendingRef = useRef(false);

const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !roomId || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setInputText('');
    await chatClient.sendMessage(roomId, text, chatTranslateService.getSendLanguage());
    sendingRef.current = false;
    setSending(false);
};
```

---

### Finding RC-2: Messages can arrive before `loadMessages` completes · **P1**

**File:** `chat/[roomId].tsx` · **Lines:** 55–85

**Problem:** `useEffect` for `loadMessages` (line 55) and `useEffect` for real-time listeners (line 61) fire independently. The message listener can fire BEFORE `loadMessages` has populated the initial state, causing a new message to appear first and then the history to overwrite it.

**Timeline:**
1. Component mounts → both effects fire
2. `onMessage` listener is active immediately
3. A message arrives → added to empty `messages` state
4. `loadMessages` finishes → `setMessages(translated)` overwrites state — the message from step 3 is lost

**Fix:** Combine into a single effect, or start listening only after initial load:
```ts
useEffect(() => {
    let mounted = true;
    const init = async () => {
        await loadMessages();
        if (!mounted || !roomId) return;
        
        const unsubMsg = chatClient.onMessage(async (msg) => {
            if (msg.roomId !== roomId || !mounted) return;
            const translated = await chatTranslateService.translateMessage(msg);
            if (!mounted) return;
            setMessages(prev => [...prev, translated]);
        });
        // ...
        return () => { unsubMsg(); unsubTyping(); };
    };
    const cleanup = init();
    return () => { mounted = false; cleanup.then(fn => fn?.()); };
}, [roomId]);
```

---

### Finding RC-3: `batch translateMessages` calls `Promise.all` with unbounded concurrency · **P2**

**File:** `chatTranslate.ts` · **Line:** 184

**Problem:** `translateMessages()` fires ALL translations in parallel via `Promise.all`. With 100 messages requiring translation on initial load, this creates 100 concurrent calls to `translationService.translate()` which may overwhelm the on-device translation engine or exceed API rate limits.

**Fix:** Use a concurrency limiter (e.g., process in batches of 5):
```ts
async translateMessages(messages: ChatMessage[]): Promise<TranslatedMessage[]> {
    const BATCH_SIZE = 5;
    const results: TranslatedMessage[] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const translated = await Promise.all(batch.map(m => this.translateMessage(m)));
        results.push(...translated);
    }
    return results;
}
```

---

### Finding RC-4: Presence dot is hardcoded green regardless of actual presence · **P2**

**File:** `chat/index.tsx` · **Line:** 241

**Problem:** The presence dot for every contact always shows green (`#22c55e`), regardless of the member's actual online/offline status.

**Current:**
```tsx
<View style={[styles.presenceDot, { backgroundColor: '#22c55e' }]} />
```

**Fix:** Use the room member's actual presence:
```tsx
const memberPresence = chatClient.getContacts()
    .find(c => item.members.includes(c.userId))?.presence || 'offline';
<View style={[styles.presenceDot, { backgroundColor: presenceColor(memberPresence) }]} />
```

---

## AUDIT 4 — TESTING GAPS

### Current Coverage

| File | Tests | Status |
|------|------:|--------|
| `chatTranslate.ts` | 14 | ✅ All passing |
| `chatClient.ts` | 0 | ❌ No tests |
| `chat/index.tsx` | 0 | ❌ No tests |
| `chat/[roomId].tsx` | 0 | ❌ No tests |
| `chat/profile.tsx` | 0 | ❌ No tests |

### Required Test Cases

#### `chatClient.test.ts` — 18 test cases needed

| # | Test Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | `login()` with valid credentials | Sets session, persists to SecureStore, starts sync |
| 2 | `login()` with invalid credentials | Returns `{ success: false, error: '...' }` |
| 3 | `login()` with unreachable server | Returns error, does not set session |
| 4 | `register()` success | Same as login |
| 5 | `register()` UIAA 401 | Returns descriptive error about interactive auth |
| 6 | `restoreSession()` with valid stored token | Restores session, returns `true` |
| 7 | `restoreSession()` with missing token | Returns `false` |
| 8 | `restoreSession()` with expired token | Handles gracefully |
| 9 | `logout()` | Clears session, stops client, deletes SecureStore keys |
| 10 | `getDMs()` | Returns sorted DMs with correct room mapping |
| 11 | `getOrCreateDM()` existing DM | Returns existing room ID |
| 12 | `getOrCreateDM()` new DM | Creates room, updates `m.direct`, returns ID |
| 13 | `sendMessage()` success | Sends event with correct content + lang metadata |
| 14 | `sendMessage()` when disconnected | Returns `false` |
| 15 | `getMessages()` | Returns mapped ChatMessage array from timeline |
| 16 | `onMessage()` listener cleanup | Listener removed after calling unsubscribe function |
| 17 | `onMessage()` duplicate listeners | Multiple listeners all receive events |
| 18 | `sendTyping()` debounce | Only sends one typing event per debounce window |

#### `chatScreen.test.tsx` — 12 test cases needed

| # | Test Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Not logged in → shows "Set Up Chat" button | Renders empty state with CTA |
| 2 | Logged in → shows room list | Renders FlatList with rooms |
| 3 | Room row shows unread badge | Badge renders when `unreadCount > 0` |
| 4 | Pull-to-refresh updates room list | `loadRooms` called again |
| 5 | Search triggers user lookup | After 2+ chars, `searchUsers` called |
| 6 | Search result tap creates DM | `getOrCreateDM` called, navigates |
| 7 | New message updates room list | `onMessage` callback triggers re-render |
| 8 | Unmount unsubscribes listener | `onMessage` unsub function called |
| 9 | Presence dot shows correct color | Maps presence to green/yellow/gray |
| 10 | Empty room list shows empty state | ListEmptyComponent renders |
| 11 | Loading state shows ActivityIndicator | Spinner visible during load |
| 12 | Search debounce limits API calls | Only 1 search per 300ms |

#### `conversationScreen.test.tsx` — 10 test cases needed

| # | Test Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Messages load with translation | `translateMessages` called on mount |
| 2 | Send message clears input | Input empty after send |
| 3 | Double-tap blocked by ref guard | Only 1 send event for rapid taps |
| 4 | Typing indicator shows when others type | `typingUsers` renders bar |
| 5 | Translation badge shown for foreign msg | `wasTranslated` → badge visible |
| 6 | Own messages show on right side | `bubbleRowOwn` style applied |
| 7 | Unmount unsubscribes both listeners | Both unsub functions called |
| 8 | Unmount stops translation callbacks | `isMounted.current = false` |
| 9 | New message scrolls to bottom | `scrollToEnd` called |
| 10 | `sending` disables send button | Button has disabled style |

#### `profileScreen.test.tsx` — 8 test cases needed

| # | Test Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Session restore → logged in view | Profile header renders |
| 2 | No session → login form | Form fields visible |
| 3 | Login success → navigates to profile view | `isLoggedIn` becomes true |
| 4 | Login failure → shows error | `authError` rendered |
| 5 | Empty fields → validation error | "Please fill in all fields" |
| 6 | Logout confirmation dialog | Alert.alert called |
| 7 | Logout clears session | `logout()` called, form shown |
| 8 | Availability toggle → presence update | `setPresence` called |

---

## FULL FINDINGS — SORTED BY SEVERITY

### P0 — Critical

| # | Area | Finding |
|---|------|---------|
| ML-1 | Memory | **Matrix sync loop never stops** — runs forever once started, even when user leaves all chat screens |

### P1 — Important

| # | Area | Finding |
|---|------|---------|
| PC-1 | Protocol | `Room.timeline` string event name deprecated in matrix-js-sdk v19+ |
| PC-2 | Protocol | `RoomMember.typing` string event name deprecated |
| PC-3 | Protocol | `register()` ignores UIAA interactive auth — always fails on matrix.org |
| ML-2 | Memory | Event listeners on Matrix client never removed — accumulate on re-login |
| ML-3 | Memory | Translation callback can fire after `[roomId]` screen unmount |
| RC-1 | Race | Double-tap can send duplicate messages (React state batching) |
| RC-2 | Race | Real-time listener fires before `loadMessages` completes — messages lost |

### P2 — Minor

| # | Area | Finding |
|---|------|---------|
| PC-4 | Protocol | `sendTyping` fires on every keystroke — no debounce |
| PC-5 | Protocol | No `offline`/`unavailable` presence set on screen unmount |
| PC-6 | Protocol | UI claims "E2E encrypted" but Olm/Megolm not configured |
| ML-4 | Memory | `handleSearch` fires API on every keystroke — no debounce |
| RC-3 | Race | `translateMessages` unbounded `Promise.all` for 100 messages |
| RC-4 | Race | Presence dot hardcoded green — ignores actual presence |

### Testing

| Area | Status |
|------|--------|
| `chatTranslate.ts` | ✅ 14 tests |
| `chatClient.ts` | ❌ 0/18 needed |
| Chat screens | ❌ 0/30 needed |
| **Total gap** | **48 tests needed** |

---

## IMPLEMENTATION ORDER

1. **P0 ML-1** → Add `stopSync()` + screen reference counter (prevents battery drain)
2. **P1 RC-1** → Add `sendingRef` guard (prevents duplicate messages)
3. **P1 RC-2** → Sequence listeners after initial load (prevents lost messages)
4. **P1 ML-3** → Add `isMounted` ref guard (prevents React warnings)
5. **P1 ML-2** → Store and remove event listeners on logout
6. **P1 PC-3** → Handle UIAA in register flow (prevents user confusion)
7. **P1 PC-1/2** → Migrate to enum-based event names
8. **P2** → Debounce typing/search, fix presence dot, remove E2EE claim
9. **Tests** → Write `chatClient.test.ts` (18), screen tests (30)
