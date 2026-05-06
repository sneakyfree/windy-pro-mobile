# Windy Chat Module — Standalone Extraction Guide

This document maps every chat-related file and its dependencies, to make it easy to fork the chat module into a standalone Windy Chat mobile app.

## Chat-Specific Files (copy as-is)

### Screens (`src/app/chat/`)
| File | Purpose | Lines |
|------|---------|-------|
| `index.tsx` | Chat home — DM list, search, agent card, presence dots | ~640 |
| `[roomId].tsx` | Conversation — message bubbles, translation, voice input | ~510 |
| `onboarding.tsx` | K2 signup — phone/email, OTP verification, profile setup | ~350 |
| `profile.tsx` | Chat profile — login form, Matrix advanced login, encryption | ~300 |

### Services (`src/services/`)
| File | Purpose | Key Exports |
|------|---------|-------------|
| `chatClient.ts` | Matrix SDK wrapper — login, messages, presence, offline queue | `chatClient`, `isAgentRoom()`, types |
| `chatOnboarding.ts` | K2 verification flow — phone/email → OTP → Matrix credentials | `chatOnboardingService` |
| `chatTranslate.ts` | On-device translation middleware — detects language, translates, caches | `chatTranslateService` |

### Components used by chat
| File | Purpose |
|------|---------|
| `src/components/VoiceChatButton.tsx` | Mic button for voice-to-text in chat input |
| `src/components/EternitasBadge.tsx` | Passport badge for verified agents |
| `src/components/EternitasPassport.tsx` | Compact passport card display |
| `src/components/ScreenErrorBoundary.tsx` | Error boundary wrapper |

## Shared Dependencies (need shims or copy)

### Required — must include in standalone app

| Dependency | Type | Why Chat Needs It |
|-----------|------|-------------------|
| `@/theme` (colors, fontSizes, spacing) | Theme | All UI styling |
| `@/stores/useSettingsStore` | Zustand store | User language, ecosystem status, identity |
| `@/config/api` | Config | Homeserver URL, CDN endpoints, API base URL |
| `@/services/logger` | Utility | Structured logging (`createLogger()`) |
| `@/utils/fetch-timeout` | Utility | Network requests with timeout |
| `@/utils/validation` | Utility | URL validation for homeserver |
| `expo-secure-store` | Native module | JWT token, Matrix credentials |
| `expo-haptics` | Native module | Haptic feedback on send |
| `expo-router` | Navigation | Screen routing |
| `matrix-js-sdk` | npm package | Core Matrix protocol SDK |
| `@matrix-org/olm` | npm package | E2E encryption (optional) |

### Optional — can be stubbed out for standalone

| Dependency | Type | What to Stub |
|-----------|------|-------------|
| `@/services/translation` | Service | Return text unchanged (no translation) |
| `@/services/pairManager` | Service | Return empty/no-op (no offline pairs) |
| `@/services/subscription` | Service | Always return `{ success: false }` |
| `@/services/transcription` | Service | Not needed if no voice input |
| `@/services/audio-capture` | Service | Not needed if no voice input |
| `@/services/ecosystem-status` | Service | Return null (no ecosystem integration) |
| `@/services/network-monitor` | Service | Return `{ isOnline: true }` |

## NPM Dependencies (chat-specific)

```json
{
  "matrix-js-sdk": "^34.0.0",
  "@matrix-org/olm": "^3.2.15",
  "expo-secure-store": "~14.0.1",
  "expo-haptics": "~14.0.1",
  "expo-router": "~4.0.0",
  "react-native-safe-area-context": "4.14.0",
  "zustand": "^5.0.0",
  "@react-native-async-storage/async-storage": "1.23.1"
}
```

## Architecture Notes

### Matrix Integration
- Chat uses `matrix-js-sdk` via lazy `require()` in `chatClient.ts` (saves ~200KB at startup)
- Session stored in SecureStore: token, userId, deviceId, homeserverUrl
- SDK loaded on first use, not at import time
- E2E encryption via `@matrix-org/olm` — initialized if available, graceful fallback

### Offline Support
- Pending message queue (up to 50 messages, stored in memory)
- Auto-flush when connection restored
- Retry up to 5x before dropping
- Connection state tracked: syncing, reconnecting, error, stopped

### Translation Pipeline
- `chatTranslateService` wraps every incoming/outgoing message
- Detects language → checks if pair downloaded → translates or shows original
- In-message "Download pair" CTA for missing language pairs
- Can be completely removed for standalone (messages show as-is)

### Agent Detection
- `isAgentRoom(room)` checks for 2-member DM with `@windy_*:chat.windychat.ai`
- Agent rooms sorted to top of contact list
- Pinned agent card with Eternitas badge, trust score
- "Just hatched" banner when new agent DM appears

## Forking Checklist

To create the standalone Windy Chat app:

1. **Copy** all files listed in "Chat-Specific Files" above
2. **Copy** shared components: ScreenErrorBoundary, EternitasBadge, EternitasPassport, VoiceChatButton
3. **Copy** theme, config/api, stores/useSettingsStore, utils
4. **Stub** optional services (translation, pairManager, subscription) with no-ops
5. **Keep** chatClient, chatOnboarding, chatTranslate as-is
6. **Update** expo-router layout to use chat screens as root tabs
7. **Configure** app.json with standalone bundle ID and app name
8. **Test** login flow, message send/receive, offline queue, presence
