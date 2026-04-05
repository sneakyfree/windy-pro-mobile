# Screen Audit — Windy Pro Mobile

**Audit Date:** 2026-03-31
**Screens Audited:** 22

## Summary Table

| Screen | Loading State | Empty State | Error State | Dead Buttons | Broken Links | Issues |
|--------|-------------|-------------|-------------|-------------|-------------|--------|
| Record (tabs/index) | Spinner + "Processing..." | "Your transcript will appear here..." | Warning + error msg | None | None | No retry button on transcription error |
| Camera (tabs/camera) | Spinner + "Scanning..." | "No translations yet" | Error banner + dismiss | None | None | Clean |
| History (tabs/history) | Spinner in FlatList | "No recordings yet" emoji | Alert + pull-to-refresh | None | None | Clean |
| Clone Data (clone-data/index) | Spinner in ListEmpty | "No bundles" + filter msg | **SILENT FAILURE** | None | None | **No error UI on fetch fail** |
| Chat (chat/index) | Spinner + "Connecting..." | "No conversations yet" / login CTA | Alert + pull-to-refresh | None | None | Clean |
| Settings (tabs/settings) | **None** | "Calculating..." placeholders | **SILENT FAILURES** | None | None | **No loading indicator, silent errors** |
| Login (auth/login) | Spinner on button | Error box | Error from API | None | None | Clean |
| Register (auth/register) | Spinner on button | Error box | Error from API | None | None | Clean |
| Translate (translate/index) | Processing state tracked | Feature gate redirect | Alert on failure | None | None | Hardcoded pair CDN URL |
| Session Detail (session/[id]) | "Loading..." text | "Session not found" + back | Alert | None | None | Clean |
| Clone Training (clone/index) | Loading indicator | Progress display | Alert | None | None | Hardcoded clone API URL |
| Subscription (subscription/index) | Animation | Pricing display | Alert + Stripe fallback | None | None | Hardcoded Stripe/web URLs |
| Onboarding (onboarding/index) | None needed | Slide-based | Silent fallback | None | None | Clean |
| Video (video/index) | "Loading..." | Permission request | Alert | None | None | Clean |
| Privacy (legal/privacy) | None (static) | N/A | N/A | None | None | Clean |
| Terms (legal/terms) | None (static) | N/A | N/A | None | None | Clean |
| Cloud (cloud/index) | Spinner + "Loading..." | Zero-value stats | Alert | None | None | Clean |
| OCR (ocr/index) | Permission screen | Placeholder | Error banner | None | None | Hardcoded pair CDN URL |
| Quick Translate | Spinner on button | No result shown | Alert | None | None | Clean |
| Chat Room (chat/[roomId]) | Spinner | Blank message list | Error banner + retry | None | None | Clean |
| Chat Onboarding | Step-based | N/A | Error messages per step | None | None | Clean |
| Chat Profile | Spinner | Login CTA | Alert | None | None | Clean |
| Market screens (3) | Spinner variants | Category display | Alert on download fail | None | None | Hardcoded bundle/pair URLs |

## Critical Issues

### 1. Clone Data — Silent Error (HIGH)
**File:** `src/app/clone-data/index.tsx:41`
- `loadData()` catches errors with `console.warn()` only
- User sees empty state with no indication that a fetch failed
- **Fix:** Add Alert or error banner on catch

### 2. Settings — No Loading State, Silent Errors (MEDIUM)
**File:** `src/app/(tabs)/settings.tsx:57-147`
- `loadData()` fetches 6+ data sources with no visual loading indicator
- Individual fetch failures caught with `console.warn()` only
- User may see stale/incomplete data without knowing
- **Fix:** Add loading shimmer or spinner, show toast on partial failures

### 3. Hardcoded API URLs (LOW)
Found in 6 files — should use `apiUrl()` or constants from `src/config/api.ts`:
- `translate/index.tsx:181` — pair download URL
- `clone/index.tsx:22` — clone API endpoint
- `subscription/index.tsx:243,611` — Stripe checkout, Marco Polo web
- `ocr/index.tsx:234` — pair download URL
- `market/bundle-select.tsx:135` — bundle purchase URL
- `market/pair-detail.tsx:100` — pair purchase URL

Note: `settings.tsx` default server URL is intentionally hardcoded (user-editable field).

## Positive Findings

- **0 dead buttons** across all 22 screens
- **0 broken navigation links** — all `router.push()` targets verified
- **All screens have error handling** (try/catch on all fetches)
- **All screens have empty states** (no blank screens)
- **All interactive elements have accessibility labels**
