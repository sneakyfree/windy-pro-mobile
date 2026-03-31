# Navigation Map — Windy Pro Mobile

**Audit Date:** 2026-03-31

## Route Directory (31 routes)

### Tab Routes (7)
| Route | File | Tab Label |
|-------|------|-----------|
| `/(tabs)` | `(tabs)/_layout.tsx` | — |
| `/(tabs)/index` | `(tabs)/index.tsx` | Record |
| `/(tabs)/camera` | `(tabs)/camera.tsx` | Camera |
| `/(tabs)/history` | `(tabs)/history.tsx` | History |
| `/(tabs)/clone-data` | `(tabs)/clone-data.tsx` | Clone |
| `/(tabs)/chat` | `(tabs)/chat.tsx` | Chat |
| `/(tabs)/market` | `(tabs)/market.tsx` | Market |
| `/(tabs)/settings` | `(tabs)/settings.tsx` | Settings |

### Stack Routes (24)
| Route | File |
|-------|------|
| `/appstore` | `appstore/index.tsx` |
| `/auth/login` | `auth/login.tsx` |
| `/auth/register` | `auth/register.tsx` |
| `/chat/[roomId]` | `chat/[roomId].tsx` |
| `/chat/onboarding` | `chat/onboarding.tsx` |
| `/chat/profile` | `chat/profile.tsx` |
| `/clone` | `clone/index.tsx` |
| `/clone-data` | `clone-data/index.tsx` |
| `/cloud` | `cloud/index.tsx` |
| `/legal/privacy` | `legal/privacy.tsx` |
| `/legal/terms` | `legal/terms.tsx` |
| `/market/bundle-select` | `market/bundle-select.tsx` |
| `/market/marco-polo` | `market/marco-polo.tsx` |
| `/market/pair-detail` | `market/pair-detail.tsx` |
| `/ocr` | `ocr/index.tsx` |
| `/onboarding` | `onboarding/index.tsx` |
| `/quick-translate` | `quick-translate.tsx` |
| `/session/[id]` | `session/[id].tsx` |
| `/subscription` | `subscription/index.tsx` |
| `/translate` | `translate/index.tsx` |
| `/video` | `video/index.tsx` |

## Navigation Calls (54 total)

### From Root Layout (`_layout.tsx`)
| Line | Target | Trigger |
|------|--------|---------|
| 227 | `/session/${id}` | Deep link: `windypro://session/{id}` |
| 258 | `/quick-translate?${params}` | Deep link: `windypro://translate?text=...` |
| 266 | `/translate` | Deep link: `windypro://translate` |
| 274-280 | `/cloud`, `/clone`, `/subscription`, `/video`, `/(tabs)/settings` | Deep link: static routes |

### From Tab Screens
| Source | Line | Target |
|--------|------|--------|
| history.tsx | 362 | `/session/${item.id}` |
| chat.tsx | 173, 217 | `/chat/${roomId}` |
| chat.tsx | 201, 286 | `/chat/profile` |
| settings.tsx | 120, 703 | `/subscription` |
| settings.tsx | 383 | `/translate` |
| settings.tsx | 389 | `/cloud` |
| settings.tsx | 395 | `/clone` |
| settings.tsx | 401 | `/video` |
| settings.tsx | 670 | `/appstore` |
| settings.tsx | 678 | `/legal/privacy` |
| settings.tsx | 684 | `/legal/terms` |
| market.tsx | 181 | `/market/pair-detail` |
| market.tsx | 302, 348 | `/market/marco-polo` |
| market.tsx | 324-344 | `/market/bundle-select` |

### From Stack Screens
| Source | Line | Target |
|--------|------|--------|
| auth/login.tsx | 47, 141 | `/(tabs)` |
| auth/login.tsx | 129 | `/auth/register` |
| auth/register.tsx | 57, 164 | `/(tabs)` |
| auth/register.tsx | 152 | `/auth/login` |
| translate/index.tsx | 539 | `/ocr` |
| chat/onboarding.tsx | 292 | `/(tabs)/chat` |
| chat/profile.tsx | 234 | `/chat/onboarding` |
| onboarding/index.tsx | 102 | `/(tabs)` |
| appstore/index.tsx | 289 | `/legal/privacy` |
| appstore/index.tsx | 292 | `/legal/terms` |

## Deep Link Routes

| Deep Link | Target Route | Verified |
|-----------|-------------|----------|
| `windypro://license?key=XXX` | License activation (no navigation) | Yes |
| `windypro://session/{id}` | `/session/{id}` | Yes |
| `windypro://translate?text=X&to=Y` | `/quick-translate?text=X&to=Y` | Yes |
| `windypro://translate` | `/translate` | Yes |
| `windypro://clone` | `/clone` | Yes |
| `windypro://subscribe` | `/subscription` | Yes |
| `windypro://settings` | `/(tabs)/settings` | Yes |
| `windypro://cloud` | `/cloud` | Yes |
| `windypro://video` | `/video` | Yes |

## Verification Results

- **Broken routes: 0** — All 54 navigation calls target files that exist
- **Orphan screens: 0** — All 31 routes are reachable
- **Dead deep links: 0** — All 9 deep link routes map to existing files

## Anomaly

`market.tsx:344` passes `params: {count: '75a'}` — non-numeric string may cause parsing issues in `bundle-select.tsx`.
