# Windy Chat Module — Architecture & Extraction Guide

The chat module is designed to be extractable into a standalone **Windy Chat** mobile app. This document defines the module boundary, interface contract, and extraction steps.

## Module Boundary

### Chat Module Provides

```typescript
// Entry points the host app uses
export { ChatHomeScreen } from './app/chat/index';
export { ConversationScreen } from './app/chat/[roomId]';
export { ChatOnboardingScreen } from './app/chat/onboarding';
export { ChatProfileScreen } from './app/chat/profile';

// Headless services
export { chatClient, isAgentRoom } from './services/chatClient';
export { chatOnboardingService } from './services/chatOnboarding';
export { chatTranslateService } from './services/chatTranslate';

// Components for embedding in other screens
export { default as VoiceChatButton } from './components/VoiceChatButton';

// Badge for tab bar
export function getUnreadCount(): number;
```

### Chat Module Receives (injected by host app)

```typescript
interface ChatModuleConfig {
    // Auth — provided by the host app's auth system
    getAuthToken(): string | null;
    getWindyIdentityId(): string | null;
    getUserEmail(): string | null;

    // Server config
    homeserverUrl: string;       // Matrix homeserver (default: chat.windychat.ai)
    apiBaseUrl: string;          // Account server for K2 onboarding

    // User preferences
    userLanguage: string;        // ISO 639-1 code for translation
    voiceChatMode: 'dictate' | 'autosend';

    // Optional integrations (can be null/no-op for standalone)
    translationService?: TranslationProvider | null;
    ecosystemStatus?: EcosystemStatus | null;
    audioCapture?: AudioCaptureProvider | null;
    transcriptionService?: TranscriptionProvider | null;
}
```

## File Inventory

### Core Chat Files (7 files, ~4,500 lines)

| File | Purpose | Can Run Standalone? |
|------|---------|-------------------|
| `src/app/chat/index.tsx` | Contact list, agent card, search | Yes |
| `src/app/chat/[roomId].tsx` | Conversation, bubbles, voice input | Yes |
| `src/app/chat/onboarding.tsx` | K2 signup flow (phone/email → Matrix) | Yes |
| `src/app/chat/profile.tsx` | Login, advanced Matrix, encryption | Yes |
| `src/services/chatClient.ts` | Matrix SDK wrapper, offline queue | Yes |
| `src/services/chatOnboarding.ts` | K2 verification API client | Yes |
| `src/services/chatTranslate.ts` | Message translation middleware | Needs translation stub |

### Chat-Adjacent Components (4 files)

| File | Purpose | Required? |
|------|---------|----------|
| `src/components/VoiceChatButton.tsx` | Mic button for voice input | Optional (text-only works fine) |
| `src/components/EternitasBadge.tsx` | Passport badge for agents | Optional (shows "AI" tag fallback) |
| `src/components/EternitasPassport.tsx` | Compact passport card | Optional |
| `src/components/ScreenErrorBoundary.tsx` | Error boundary wrapper | Required |

### Shared Infrastructure (copy or create shims)

| File | What Chat Uses | Shim Strategy |
|------|---------------|---------------|
| `src/theme/` | `colors`, `fontSizes`, `spacing` | Copy theme constants |
| `src/stores/useSettingsStore.ts` | `defaultLanguage`, `voiceChatMode`, `ecosystemStatus` | Create minimal store |
| `src/config/api.ts` | `getChatHomeserver()`, `apiUrl()`, `ENDPOINTS` | Copy with chat-only endpoints |
| `src/utils/fetch-timeout.ts` | `fetchWithTimeout()` | Copy (30 lines) |
| `src/utils/validation.ts` | `validateUrl()`, `INPUT_LIMITS` | Copy (small) |
| `src/services/logger.ts` | `createLogger()` | Copy or console wrapper |

### Optional Integrations (stub for standalone)

| Service | What Chat Uses | Standalone Stub |
|---------|---------------|-----------------|
| `translationService` | Language detection + translation | `return { translated: original }` |
| `pairManager` | Offline translation pair downloads | `return { downloaded: false }` |
| `subscriptionService` | In-message pair purchase | `return { success: false }` |
| `audioCapture` | Voice note recording | Remove mic button |
| `transcriptionService` | Voice-to-text | Remove mic button |
| `ecosystemStatus` | Agent provisioning state | `return null` |

## NPM Dependencies

### Required for Chat

```
matrix-js-sdk          ^34.0.0    Matrix protocol SDK (lazy-loaded)
@matrix-org/olm        ^3.2.15    E2E encryption (optional)
expo-secure-store       ~14.0.1    Token storage
expo-haptics            ~14.0.1    Feedback
expo-router             ~4.0.0     Navigation
react-native-safe-area-context  4.14.0  Safe area
zustand                 ^5.0.0     State management
@react-native-async-storage/async-storage  1.23.1  Persistence
```

### Optional (for voice features)

```
expo-av                 ~15.0.2    Audio recording
expo-file-system        ~18.0.0    File I/O
```

## Interface Contracts

### Auth Token Flow

The chat module reads auth tokens from `expo-secure-store` under these keys:
- `windy_matrix_token` — Matrix access token
- `windy_matrix_user` — Matrix user ID (@user:server)
- `windy_matrix_server` — Homeserver URL
- `windy_matrix_device` — Device ID

For K2 onboarding (the default path), the account server provisions Matrix credentials. The standalone app would need its own K2 endpoint or direct Matrix registration.

### Message Translation

Chat messages flow through `chatTranslateService` which:
1. Detects source language
2. Checks if translation pair is downloaded
3. Translates if possible, shows original if not
4. Caches translated messages

For standalone without translation: messages display as-is in original language.

### Agent Detection

Agent rooms are identified by the pattern `@windy_*:chat.windychat.ai` in 2-member DMs. The standalone app can:
- Keep this pattern for Windy ecosystem agents
- Extend with custom patterns for other bot systems

## Extraction Steps

### Phase 1: Create Standalone Expo Project

```bash
npx create-expo-app windy-chat --template blank-typescript
cd windy-chat
npx expo install matrix-js-sdk @matrix-org/olm expo-secure-store expo-haptics expo-router zustand @react-native-async-storage/async-storage react-native-safe-area-context
```

### Phase 2: Copy Chat Module

```bash
# Core files
cp -r windy-pro-mobile/src/app/chat/ windy-chat/src/app/chat/
cp windy-pro-mobile/src/services/chatClient.ts windy-chat/src/services/
cp windy-pro-mobile/src/services/chatOnboarding.ts windy-chat/src/services/
cp windy-pro-mobile/src/services/chatTranslate.ts windy-chat/src/services/

# Shared infrastructure
cp -r windy-pro-mobile/src/theme/ windy-chat/src/theme/
cp windy-pro-mobile/src/utils/fetch-timeout.ts windy-chat/src/utils/
cp windy-pro-mobile/src/utils/validation.ts windy-chat/src/utils/
cp windy-pro-mobile/src/services/logger.ts windy-chat/src/services/
cp windy-pro-mobile/src/components/ScreenErrorBoundary.tsx windy-chat/src/components/
```

### Phase 3: Create Stubs

```typescript
// src/services/translation.ts (stub)
export const translationService = {
    detectLanguage: async () => ({ language: 'en', confidence: 1.0 }),
    translateText: async (_text: string) => null,
};

// src/stores/useSettingsStore.ts (minimal)
export const useSettingsStore = create(() => ({
    defaultLanguage: 'en',
    voiceChatMode: 'dictate' as const,
    ecosystemStatus: null,
    // ... add setters
}));
```

### Phase 4: Configure App

- Set bundle ID: `uk.thewindstorm.windychat`
- Set app name: "Windy Chat"
- Configure Matrix homeserver in config/api.ts
- Add K2 onboarding endpoint
- Submit to App Store / Play Store

## Architecture Decisions

### Why Lazy SDK Loading
`matrix-js-sdk` is ~200KB+ gzipped. In the full Windy Pro app, many users never open chat. Lazy `require()` in `chatClient.ts` defers this cost until first use.

### Why K2 Onboarding
The K2 flow (phone/email → OTP → auto-provisioned Matrix account) lets users start chatting without knowing what Matrix is. The account server handles all the Matrix registration behind the scenes.

### Why Translation Middleware
`chatTranslateService` sits between the Matrix SDK and the UI. It intercepts messages, translates them using downloaded offline pairs, and caches results. This means grandma sees messages in her language without any config.

### Why Voice Input is Optional
The `VoiceChatButton` component is self-contained. It requires `audio-capture` and `transcription` services which depend on `expo-av` and Windy Word cloud/local engines. For a lightweight standalone chat app, simply don't include the button — the text input works standalone.
