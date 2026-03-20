# 🧬 WINDY PRO MOBILE — DNA STRAND MASTER PLAN

**Version:** 2.0.0
**Created:** 2026-03-01
**Last Updated:** 2026-03-18
**Authors:** Antigravity + Grant Whitmer
**Philosophy:** Every cell has the blueprint to build the whole organism. This plan is so atomic, even the dumbest ribosome can execute it.

---

## 🗣️ TERMINOLOGY STANDARD

| Internal / Technical | User-Facing / Marketing |
|---------------------|------------------------|
| Model, LLM, weights | **Voice Engine** or **Engine** |
| Model selection | **Engine selection** |
| Model catalog | **Engine library** |
| Download models | **Download engines** |
| WindyTune auto-select | **WindyTune** |
| Speech-to-text | **Voice to text** |
| Floating overlay | **Windy Button** |
| Keyboard extension | **Windy Keyboard** |

**Rule:** Users never see "model," "STT," "ASR," or any ML jargon. Ever.

---

## 🎯 THE CLEAR VISION

### One Sentence
**Windy Pro Mobile is a bomb-proof, privacy-first voice-to-text tool that lives in your pocket — tap one button, talk, get polished text. It just works.**

### The Core Loop
```
TAP → TALK → TEXT

1. User taps the Windy Button (floating tornado or keyboard button)
2. Green strobe pulses — recording is live
3. User talks — words appear in real-time
4. User taps again — yellow strobe (processing)
5. Polished text pastes at cursor position
6. Session auto-archived in background

Total interaction: 2 taps. That's it.
```

### What It IS
- The world's most potent, simplified voice-to-text capture tool
- A purified, stripped-down voice machine — one screen, one button, one flow
- Privacy-first — local processing by default, cloud is opt-in
- Platform for ALL voice-to-text use cases: prompts, emails, texts, archives, clone data
- Pay once, use forever — no subscriptions, no tricks

### What It Is NOT
- Not a feature-bloated Swiss Army knife
- Not trying to replicate the desktop app
- Not cloud-dependent
- Not complicated to install or use

### The Use Cases (All Served by the Same Core Loop)
| Use Case | How Windy Pro Serves It |
|----------|------------------------|
| Vibe coding prompts | Talk your prompt → copy → paste into Claude/ChatGPT |
| Email composition | Talk your email → text appears → send |
| Text messages | Tap tornado on any messaging app → talk → text pastes |
| Meeting notes | Background recording → full transcript when done |
| Travel translation | Windy Translate → bidirectional conversation mode |
| Voice clone data | Every session silently builds toward 10+ hour threshold |
| Avatar clone data | Toggle video on → captures face data as byproduct |

### Success Metrics

| Metric | Target |
|--------|--------|
| App to recording | < 2 seconds |
| End-to-end latency (on-device) | < 800ms |
| End-to-end latency (cloud) | < 1.5s |
| Crash rate | 0% (zero tolerance) |
| Works offline | 100% core features |
| Data loss rate | 0% (every segment persisted before callback) |
| Install to first transcription | < 60 seconds |

---

## 🏗️ ARCHITECTURE OVERVIEW

### Platform Strategy
```
ONE CODEBASE → TWO NATIVE EXPERIENCES

React Native + Expo (TypeScript)
├── 85% shared code (recording, transcription, UI, storage, sync)
├── Android-specific: Floating Tornado Overlay + Accessibility Paste
└── iOS-specific: Custom Keyboard Extension + Dynamic Island + Action Button
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | React Native 0.76 + Expo SDK 52 |
| **Language** | TypeScript (strict mode) |
| **Routing** | Expo Router (file-based) |
| **State** | Zustand |
| **Audio Recording** | expo-av |
| **Speech-to-Text (on-device)** | whisper.rn (whisper.cpp React Native bindings) |
| **Speech-to-Text (cloud)** | WebSocket to Windy Cloud API (NVIDIA 5090) |
| **Camera** | expo-camera |
| **Local DB** | expo-sqlite |
| **File Storage** | expo-file-system |
| **Cloud Storage** | AWS SDK (S3-compatible → MinIO cluster) |
| **HTTP** | fetch / axios |
| **Payments** | Web-based Stripe checkout |
| **Push Notifications** | expo-notifications |
| **Device Info** | expo-device + expo-constants |
| **Background Tasks** | expo-background-fetch + expo-task-manager |
| **Haptics** | expo-haptics |
| **Audio Feedback** | expo-av (playback for blip sounds) |

### Project Structure
```
windy-pro-mobile/
├── app/                              # Expo Router screens
│   ├── (tabs)/
│   │   ├── _layout.tsx               # Tab bar config (3 tabs)
│   │   ├── index.tsx                 # Main: Record + Transcribe
│   │   ├── history.tsx               # Session history browser
│   │   └── settings.tsx              # All settings
│   ├── session/
│   │   └── [id].tsx                  # Session detail view
│   ├── translate/
│   │   └── index.tsx                 # Windy Translate conversation
│   ├── clone/
│   │   └── index.tsx                 # Clone progress dashboard
│   ├── onboarding/
│   │   └── index.tsx                 # First-run setup (3 screens max)
│   └── _layout.tsx                   # Root layout
│
├── src/
│   ├── components/                   # Reusable UI components
│   │   ├── RecordButton.tsx          # The big record button
│   │   ├── FloatingTornado.tsx       # Android overlay button (shared logic)
│   │   ├── AudioWaveform.tsx         # Real-time waveform visualization
│   │   ├── TranscriptView.tsx        # Live + final transcript display
│   │   ├── QualityBadge.tsx          # Audio quality score indicator
│   │   ├── MediaToggles.tsx          # Audio/Video/Text toggles
│   │   ├── LanguagePicker.tsx        # Language selection dropdown
│   │   ├── ProgressMeter.tsx         # Clone progress bar
│   │   ├── SessionCard.tsx           # History list item
│   │   ├── StrobeIndicator.tsx       # Green/yellow/red state indicator
│   │   └── EngineSelector.tsx        # Manual engine selection
│   │
│   ├── services/                     # Business logic & API clients
│   │   ├── audio-capture.ts          # Recording pipeline (expo-av)
│   │   ├── transcription.ts          # STT engine manager
│   │   ├── windy-tune.ts             # Auto-config engine selection
│   │   ├── cloud-api.ts              # Cloud transcription WebSocket client
│   │   ├── translation.ts            # Translation engine wrapper
│   │   ├── storage-local.ts          # Local file + SQLite manager
│   │   ├── storage-cloud.ts          # MinIO/S3 upload client
│   │   ├── sync-engine.ts            # Background Wi-Fi sync orchestrator
│   │   ├── quality-scorer.ts         # Audio quality analysis (0-100)
│   │   ├── clone-tracker.ts          # Clone progress calculator
│   │   ├── license.ts                # License key validation
│   │   └── paste-service.ts          # Text injection at cursor
│   │
│   ├── stores/                       # Zustand state stores
│   │   ├── useRecordingStore.ts      # Recording state machine
│   │   ├── useTranscriptStore.ts     # Current transcript segments
│   │   ├── useSessionStore.ts        # Session history
│   │   ├── useSettingsStore.ts       # User preferences (persisted)
│   │   └── useCloneStore.ts          # Clone progress data
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── useAudioRecorder.ts       # Audio recording lifecycle
│   │   ├── useSpeechRecognition.ts   # STT integration hook
│   │   ├── useCloudSync.ts           # Sync status hook
│   │   ├── useDeviceCapabilities.ts  # Hardware detection hook
│   │   └── useNetworkState.ts        # Wi-Fi / cellular / offline
│   │
│   ├── theme/                        # Design system
│   │   ├── colors.ts                 # Color palette
│   │   ├── typography.ts             # Font styles
│   │   └── spacing.ts                # Layout constants
│   │
│   ├── types/                        # TypeScript type definitions
│   │   ├── recording.ts              # Recording-related types
│   │   ├── session.ts                # Session data types
│   │   ├── engine.ts                 # Engine config types
│   │   └── api.ts                    # API request/response types
│   │
│   ├── utils/                        # Pure utility functions
│   │   ├── constants.ts              # App-wide constants
│   │   ├── formatters.ts             # Time, size, number formatters
│   │   ├── audio-utils.ts            # PCM conversion, level calculation
│   │   ├── device-info.ts            # Device capability detection
│   │   └── crypto.ts                 # License key hashing
│   │
│   └── i18n/                         # Localization
│       ├── en.json                   # English (source of truth)
│       └── index.ts                  # i18n loader
│
├── android/                          # Android-specific native code
│   └── app/src/main/java/com/windypro/mobile/
│       ├── FloatingOverlayService.kt # Floating tornado overlay
│       ├── PasteAccessibilityService.kt # Paste at cursor
│       └── OverlayPermissionHelper.kt # Permission management
│
├── ios/                              # iOS-specific native code
│   └── WindyKeyboard/                # Keyboard extension target
│       ├── KeyboardViewController.swift
│       ├── AudioRecorderBridge.swift
│       └── Info.plist
│
├── assets/
│   ├── images/
│   │   ├── tornado.png              # Default button icon
│   │   ├── tornado-recording.png    # Recording state icon
│   │   └── icon.png                 # App icon
│   ├── fonts/
│   │   └── Inter-Variable.ttf       # Primary typeface
│   └── sounds/
│       ├── record-start.wav         # Blip: recording started
│       ├── record-stop.wav          # Blip: recording stopped
│       └── milestone.wav            # Clone milestone celebration
│
├── docs/                             # Project documentation (existing)
├── DNA_STRAND_MASTER_PLAN.md         # THIS FILE
├── app.json                          # Expo configuration
├── package.json
├── tsconfig.json
└── .gitignore
```

### Data Flow
```
┌─────────────────────────────────────────────────────────────────┐
│                    WINDY PRO MOBILE DATA FLOW                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User taps Windy Button (tornado overlay OR keyboard button)     │
│         │                                                        │
│         ▼                                                        │
│  expo-av starts audio capture (44.1kHz mono WAV)                 │
│         │                                                        │
│         ├──► Audio level → StrobeIndicator (green pulse)         │
│         │                                                        │
│         ▼                                                        │
│  WindyTune routes to optimal engine:                             │
│         │                                                        │
│         ├─── ON-DEVICE: whisper.rn (whisper.cpp)                 │
│         │    ├── High-end phone → large-v3-turbo                 │
│         │    ├── Mid-range → small/medium                        │
│         │    └── Low-end → tiny/base                             │
│         │                                                        │
│         └─── CLOUD: WebSocket to Windy Cloud API                 │
│              └── NVIDIA 5090 (32GB VRAM) via Kit 0 VPS           │
│                                                                  │
│         ▼                                                        │
│  Transcript segments arrive (partial → final)                    │
│         │                                                        │
│         ├──► TranscriptView displays real-time text              │
│         │                                                        │
│         ▼                                                        │
│  User taps again → recording stops                               │
│         │                                                        │
│         ├──► Yellow strobe (processing final segments)            │
│         ├──► Text pasted at cursor position                      │
│         │                                                        │
│         ▼                                                        │
│  Session auto-archived:                                          │
│         ├── Audio WAV → local file system                        │
│         ├── Transcript → SQLite + JSON file                      │
│         ├── Video (if toggled) → local file system               │
│         ├── Metadata → SQLite (quality score, duration, etc.)    │
│         │                                                        │
│         ▼                                                        │
│  Sync Engine (background, when Wi-Fi + plugged in):              │
│         └── Upload un-synced sessions to:                        │
│             ├── Windy Cloud (MinIO cluster, 1,831 GB)            │
│             └── OR user's custom S3-compatible endpoint          │
│                                                                  │
│  Clone Tracker (background):                                     │
│         └── Recalculate total usable hours → update progress     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Network Architecture
```
┌──────────────────┐
│  User's Phone    │
│  (Windy Pro App) │
└────────┬─────────┘
         │ HTTPS / WSS
┌────────▼─────────┐
│  Cloudflare      │
│  (CDN + proxy)   │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Kit 0 VPS       │
│  72.60.118.54    │
│  (gateway)       │
└────────┬─────────┘
         │ WireGuard VPN
    ┌────┴────┬──────────┐
    │         │          │
┌───▼───┐ ┌──▼────┐ ┌───▼────┐
│ Cloud │ │ MinIO │ │ Stripe │
│ API   │ │Cluster│ │Webhook │
│(5090) │ │1831GB │ │        │
└───────┘ └───────┘ └────────┘
```

---

## 🚨 CRITICAL PATH TO MVP

```
┌─────────────────────────────────────────────────────────────────┐
│                 WHAT BLOCKS WHAT (Dependency Graph)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  M1 (App Shell) ──┬──► M2 (Audio Capture) ──► M3 (Transcription)│
│                   │                                │             │
│                   │                                ▼             │
│                   │                    M4 (Android Overlay)      │
│                   │                    M5 (iOS Keyboard)         │
│                   │                                              │
│                   ├──► M7 (Local Storage) ──► M8 (Cloud Sync)   │
│                   │                                              │
│                   ├──► M11 (Settings)                            │
│                   │                                              │
│                   └──► M10 (Payments) ──► Feature Gating         │
│                                                                  │
│  M3 (Transcription) ──► M6 (Translate)                          │
│  M7 (Local Storage) ──► M9 (Clone Pipeline)                     │
│  M2 (Audio Capture) ──► M12 (Video Capture)                     │
│                                                                  │
│  ALL STRANDS ──► M13 (App Store Submission)                     │
│                                                                  │
│  M6 (Translate) ──► L1+L2 (Marketplace + DRM)                  │
│  L1+L2 (Marketplace) ──► M10* (IAP via RevenueCat)              │
│                                                                  │
│  Legend: 🔲 Not Started | 🟡 In Progress | ✅ Done              │
└─────────────────────────────────────────────────────────────────┘
```

### MVP Phase 1 (Ship This First)
```
M1 (Shell) + M2 (Audio) + M3 (Transcription) + M7 (Storage) + M11 (Settings)
= User can open app, record, get transcript, view history
```

### MVP Phase 2 (System-Level Integration)
```
M4 (Android Overlay) + M5 (iOS Keyboard) + M10 (Payments)
= User can record from any app, paste at cursor, upgrade tiers
```

### MVP Phase 3 (Cloud + Sync + Translate)
```
M6 (Translate) + M8 (Cloud Sync) + M9 (Clone) + M12 (Video) + M13 (App Store)
= Full product, ready for store submission
```

---

## 🧬 DNA CODONS — ATOMIC COMPONENTS

Each codon is the smallest unit of work. Build these correctly, the organism lives.

**Status Legend:**
- ✅ Complete and tested
- 🟡 In progress / partially complete
- 🔲 Not started
- ⏸️ Blocked by dependency

---

### STRAND M1: APP SHELL & NAVIGATION

#### M1.1: Root Layout & Theme 🔲
```
FILE: app/_layout.tsx
STATUS: 🔲 NOT STARTED
DEPENDS ON: Nothing (first thing built)

CODONS:
├── M1.1.1 Root Layout Component 🔲
│   ├── Wrap entire app in ThemeProvider
│   ├── Wrap in Zustand store providers
│   ├── Initialize expo-splash-screen (keep visible until ready)
│   ├── Load custom fonts (Inter) via expo-font
│   ├── Initialize i18n
│   └── Render <Stack> navigator (Expo Router)
│
├── M1.1.2 Theme Constants 🔲
│   FILE: src/theme/colors.ts
│   ├── background: '#0f172a'        (deep navy-black)
│   ├── surface: '#1e293b'           (card/panel background)
│   ├── surfaceLight: '#334155'      (elevated surface)
│   ├── accent: '#a3e635'            (lime green — primary action)
│   ├── accentSecondary: '#2dd4bf'   (cyan/teal — secondary)
│   ├── textPrimary: '#f8fafc'       (white text)
│   ├── textSecondary: '#94a3b8'     (muted text)
│   ├── stateRecording: '#22c55e'    (green strobe — recording)
│   ├── stateProcessing: '#eab308'   (yellow — processing)
│   ├── stateError: '#ef4444'        (red — error)
│   ├── stateIdle: '#6b7280'         (gray — idle)
│   └── border: '#475569'            (subtle borders)
│
├── M1.1.3 Typography Constants 🔲
│   FILE: src/theme/typography.ts
│   ├── fontFamily: 'Inter'
│   ├── h1: { fontSize: 28, fontWeight: '700', lineHeight: 34 }
│   ├── h2: { fontSize: 22, fontWeight: '600', lineHeight: 28 }
│   ├── h3: { fontSize: 18, fontWeight: '600', lineHeight: 24 }
│   ├── body: { fontSize: 16, fontWeight: '400', lineHeight: 24 }
│   ├── bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 }
│   ├── caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 }
│   └── mono: { fontSize: 14, fontFamily: 'monospace' }
│
└── M1.1.4 Spacing Constants 🔲
    FILE: src/theme/spacing.ts
    ├── xs: 4
    ├── sm: 8
    ├── md: 16
    ├── lg: 24
    ├── xl: 32
    ├── xxl: 48
    ├── screenPadding: 20
    └── borderRadius: { sm: 8, md: 12, lg: 16, xl: 24 }
```

#### M1.2: Tab Navigation 🔲
```
FILE: app/(tabs)/_layout.tsx
STATUS: 🔲 NOT STARTED
DEPENDS ON: M1.1

CODONS:
├── M1.2.1 Tab Bar Configuration 🔲
│   ├── 3 tabs only (purified, minimal):
│   │   ├── Tab 1: "Record" (index.tsx) — microphone icon
│   │   ├── Tab 2: "History" (history.tsx) — clock/list icon
│   │   └── Tab 3: "Settings" (settings.tsx) — gear icon
│   │
│   ├── Tab bar style:
│   │   ├── backgroundColor: colors.surface
│   │   ├── borderTopColor: colors.border
│   │   ├── activeTintColor: colors.accent (lime green)
│   │   ├── inactiveTintColor: colors.textSecondary
│   │   ├── height: 60 (comfortable tap targets)
│   │   └── paddingBottom: safe area inset
│   │
│   └── Tab bar must be visible at all times EXCEPT:
│       └── During active recording in fullscreen mode → hide tab bar
│
└── M1.2.2 Stack Screens (non-tab) 🔲
    ├── session/[id] — Session detail (modal presentation)
    ├── translate/index — Windy Translate (full screen)
    ├── clone/index — Clone progress (full screen)
    └── onboarding/index — First-run (full screen, no back)
```

#### M1.3: First-Run Onboarding 🔲
```
FILE: app/onboarding/index.tsx
STATUS: 🔲 NOT STARTED
DEPENDS ON: M1.1, M1.2

CODONS:
├── M1.3.1 Onboarding Flow (3 screens max — respect user's time) 🔲
│   │
│   ├── Screen 1: Welcome + Permissions 🔲
│   │   ├── Tornado animation (Lottie or animated SVG)
│   │   ├── "Windy Pro — Voice to Text, Your Way"
│   │   ├── "Tap once to record. Tap again to paste."
│   │   ├── [Grant Microphone Access] button
│   │   │   └── Triggers Permissions.askAsync(Permissions.AUDIO_RECORDING)
│   │   ├── Explain WHY: "Windy Pro needs your microphone to
│   │   │   convert your speech to text. Audio stays on your device."
│   │   └── Cannot proceed without mic permission
│   │
│   ├── Screen 2: WindyTune Auto-Configure 🔲
│   │   ├── "Scanning your device..."
│   │   ├── Animated progress (device detection)
│   │   ├── Show results:
│   │   │   ├── Device: "iPhone 15 Pro" / "Samsung Galaxy S24"
│   │   │   ├── Recommended engine: "Large v3 Turbo (best for your device)"
│   │   │   ├── Processing: "On-device (100% private)" or "Cloud (fastest)"
│   │   │   └── Download size: "1.2 GB" (if on-device model needed)
│   │   ├── [Download Engine] or [Use Cloud] button
│   │   └── Progress bar during model download
│   │
│   └── Screen 3: Ready 🔲
│       ├── "You're ready!"
│       ├── Quick visual: tap tornado → talk → text appears
│       ├── [Start Using Windy Pro] button
│       └── Saves onboarding_complete: true to AsyncStorage
│
├── M1.3.2 Onboarding State Tracking 🔲
│   ├── Check AsyncStorage('onboarding_complete') on app launch
│   ├── If false or missing → redirect to onboarding
│   ├── If true → go straight to Record tab
│   └── Never show onboarding again after completion
│
└── M1.3.3 Android-Specific Permissions 🔲
    ├── Screen 1 also requests:
    │   ├── "Draw Over Other Apps" (for floating tornado)
    │   │   └── Settings.canDrawOverlays() check
    │   │   └── If not granted → Intent to Settings.ACTION_MANAGE_OVERLAY_PERMISSION
    │   └── Accessibility Service (for paste-at-cursor)
    │       └── Guide user to Settings → Accessibility → Windy Pro → Enable
    └── These are OPTIONAL — app works without them, just without overlay
```

#### M1.4: TypeScript Type Definitions 🔲
```
FILE: src/types/recording.ts
STATUS: 🔲 NOT STARTED

TYPES:
├── RecordingState = 'idle' | 'recording' | 'processing' | 'error'
│
├── RecordingConfig {
│   sampleRate: number          // 44100 (device max)
│   channels: 1                 // mono always
│   encoding: 'wav'             // uncompressed during capture
│   meteringEnabled: boolean    // for waveform UI
│   maxDuration: number         // seconds (1800 = 30 min for Pro)
│ }
│
├── TranscriptSegment {
│   id: string                  // uuid
│   text: string                // transcribed text
│   startTime: number           // seconds from session start
│   endTime: number             // seconds from session start
│   confidence: number          // 0.0 - 1.0
│   isPartial: boolean          // true = still being processed
│   speakerId: string | null    // for diarization (Pro feature)
│   language: string            // ISO 639-1 detected language
│ }
│
├── AudioQuality {
│   score: number               // 0-100
│   label: 'excellent' | 'good' | 'fair' | 'poor'
│   snrDb: number               // signal-to-noise ratio
│   speechRatio: number         // 0.0-1.0 (% of recording that is speech)
│   hasClipping: boolean        // audio distortion detected
│   sampleRate: number          // actual capture sample rate
│ }
│
└── MediaCapture {
    audio: boolean              // default: true
    video: boolean              // default: false
    text: boolean               // default: true (always generate transcript)
  }

FILE: src/types/session.ts

TYPES:
├── Session {
│   id: string                  // uuid
│   createdAt: string           // ISO 8601
│   duration: number            // seconds
│   transcript: string          // full text
│   segments: TranscriptSegment[]
│   audioFilePath: string | null
│   videoFilePath: string | null
│   quality: AudioQuality
│   engineUsed: string          // engine ID that processed this
│   source: 'record' | 'translate' | 'keyboard' | 'overlay'
│   languages: string[]         // detected languages
│   mediaCapture: MediaCapture
│   fileSize: number            // total bytes (audio + video)
│   synced: boolean             // uploaded to cloud?
│   syncedAt: string | null     // when uploaded
│   cloneUsable: boolean        // good enough for clone training?
│   tags: string[]              // user-applied tags
│   location: { lat: number, lon: number } | null
│   deviceModel: string         // "iPhone 15 Pro", "Pixel 8"
│ }
│
├── SessionSummary {
│   id: string
│   createdAt: string
│   duration: number
│   previewText: string         // first 100 chars of transcript
│   quality: AudioQuality
│   synced: boolean
│   source: string
│   mediaCapture: MediaCapture
│ }
│
└── SessionFilter {
    dateRange: { start: string, end: string } | null
    source: string | null
    minQuality: number | null
    synced: boolean | null
    searchQuery: string | null
  }

FILE: src/types/engine.ts

TYPES:
├── EngineId = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3'
│            | 'large-v3-turbo' | 'cloud-standard' | 'cloud-turbo'
│
├── EngineConfig {
│   id: EngineId
│   displayName: string         // "Large v3 Turbo"
│   description: string         // "Best quality for powerful devices"
│   sizeBytes: number           // download size
│   ramRequired: number         // MB of RAM needed
│   isOnDevice: boolean         // true = local, false = cloud
│   isDownloaded: boolean       // local models only
│   downloadProgress: number    // 0-100 during download
│   languages: string[]         // supported language codes
│   quality: number             // 1-10 quality rating
│   speed: number               // 1-10 speed rating
│ }
│
├── WindyTuneResult {
│   recommendedEngine: EngineId
│   reason: string              // "Best quality for your NVIDIA GPU"
│   deviceProfile: DeviceProfile
│   allEngines: EngineConfig[]  // sorted by recommendation
│ }
│
└── DeviceProfile {
    model: string               // "iPhone 15 Pro"
    platform: 'ios' | 'android'
    osVersion: string           // "17.2"
    totalRam: number            // MB
    availableStorage: number    // MB
    cpuCores: number
    hasNeuralEngine: boolean    // iOS Neural Engine
    hasNPU: boolean             // Android NPU (Snapdragon, Tensor)
    chipset: string | null      // "A17 Pro", "Snapdragon 8 Gen 3"
  }

FILE: src/types/api.ts

TYPES:
├── CloudTranscribeMessage {
│   type: 'auth' | 'audio' | 'config' | 'stop'
│   // auth: { token: string }
│   // audio: binary PCM data
│   // config: { language: string, engine: string }
│   // stop: {}
│ }
│
├── CloudTranscribeResponse {
│   type: 'transcript' | 'state' | 'error' | 'ack'
│   // transcript: { text, partial, confidence, ... }
│   // state: { state: 'listening' | 'processing', previous: string }
│   // error: { message: string, code: string }
│   // ack: { action: string, success: boolean }
│ }
│
├── LicenseValidation {
│   key: string
│   tier: 'free' | 'pro' | 'translate' | 'translate_pro'
│   validUntil: string | null   // null = lifetime
│   devicesUsed: number
│   devicesMax: number          // 5
│   features: string[]          // unlocked feature list
│ }
│
└── SyncStatus {
    totalSessions: number
    syncedSessions: number
    pendingUploadBytes: number
    lastSyncAt: string | null
    storageUsed: number         // bytes on cloud
    storageQuota: number        // bytes allowed
  }
```

---

### STRAND M2: AUDIO CAPTURE PIPELINE

#### M2.1: Audio Recording Service 🔲
```
FILE: src/services/audio-capture.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M1.1 (theme for state colors)

CODONS:
├── M2.1.1 AudioCaptureService class 🔲
│   │
│   │  SINGLETON — only one recording at a time, app-wide
│   │
│   ├── Properties:
│   │   ├── recording: Audio.Recording | null
│   │   ├── state: RecordingState ('idle' | 'recording' | 'processing' | 'error')
│   │   ├── config: RecordingConfig
│   │   ├── sessionId: string | null         // uuid for current session
│   │   ├── startTime: number | null         // Date.now() when recording started
│   │   ├── meteringData: number[]           // audio levels for waveform
│   │   ├── onStateChange: (state: RecordingState) => void
│   │   ├── onMeteringUpdate: (level: number) => void  // 0.0-1.0
│   │   └── onDurationUpdate: (seconds: number) => void
│   │
│   ├── Methods:
│   │   ├── async initialize(): Promise<boolean> 🔲
│   │   │   ├── Request audio permissions if not granted
│   │   │   ├── Configure Audio.setAudioModeAsync({
│   │   │   │     allowsRecordingIOS: true,
│   │   │   │     playsInSilentModeIOS: true,
│   │   │   │     staysActiveInBackground: true,
│   │   │   │     interruptionModeIOS: InterruptionModeIOS.DoNotMix,
│   │   │   │     interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
│   │   │   │     shouldDuckAndroid: false,
│   │   │   │   })
│   │   │   └── Return true if mic permission granted, false otherwise
│   │   │
│   │   ├── async startRecording(): Promise<string> 🔲
│   │   │   ├── Generate sessionId (uuid)
│   │   │   ├── Create Audio.Recording with config:
│   │   │   │   ├── android: {
│   │   │   │   │     extension: '.wav',
│   │   │   │   │     outputFormat: Audio.AndroidOutputFormat.DEFAULT,
│   │   │   │   │     audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
│   │   │   │   │     sampleRate: 44100,
│   │   │   │   │     numberOfChannels: 1,
│   │   │   │   │     bitRate: 705600,
│   │   │   │   │   }
│   │   │   │   └── ios: {
│   │   │   │         extension: '.wav',
│   │   │   │         outputFormat: Audio.IOSOutputFormat.LINEARPCM,
│   │   │   │         audioQuality: Audio.IOSAudioQuality.MAX,
│   │   │   │         sampleRate: 44100,
│   │   │   │         numberOfChannels: 1,
│   │   │   │         bitRate: 705600,
│   │   │   │         linearPCMBitDepth: 16,
│   │   │   │         linearPCMIsBigEndian: false,
│   │   │   │         linearPCMIsFloat: false,
│   │   │   │       }
│   │   │   ├── Enable metering: recording.setOnRecordingStatusUpdate()
│   │   │   ├── Start recording: await recording.prepareToRecordAsync()
│   │   │   ├── Play record-start.wav blip sound
│   │   │   ├── Trigger haptic feedback (expo-haptics: ImpactFeedbackStyle.Medium)
│   │   │   ├── Set state → 'recording'
│   │   │   ├── Start duration timer (setInterval every 100ms)
│   │   │   └── Return sessionId
│   │   │
│   │   ├── async stopRecording(): Promise<RecordingResult> 🔲
│   │   │   ├── Set state → 'processing'
│   │   │   ├── Stop recording: await recording.stopAndUnloadAsync()
│   │   │   ├── Get file URI: recording.getURI()
│   │   │   ├── Play record-stop.wav blip sound
│   │   │   ├── Trigger haptic feedback (ImpactFeedbackStyle.Light)
│   │   │   ├── Stop duration timer
│   │   │   ├── Get file info (size, duration)
│   │   │   ├── Return { sessionId, uri, duration, fileSize }
│   │   │   └── Set state → 'idle'
│   │   │
│   │   ├── async cancelRecording(): Promise<void> 🔲
│   │   │   ├── Stop recording without saving
│   │   │   ├── Delete temp file
│   │   │   └── Set state → 'idle'
│   │   │
│   │   ├── getDuration(): number 🔲
│   │   │   └── Return elapsed seconds since startTime
│   │   │
│   │   ├── getCurrentLevel(): number 🔲
│   │   │   └── Return latest metering value (0.0-1.0)
│   │   │
│   │   └── isRecording(): boolean 🔲
│   │       └── Return state === 'recording'
│   │
│   └── RecordingResult type:
│       {
│         sessionId: string
│         uri: string               // file:///path/to/recording.wav
│         duration: number          // seconds
│         fileSize: number          // bytes
│       }
│
├── M2.1.2 Audio Level Processing 🔲
│   ├── expo-av provides metering in dB (typically -160 to 0)
│   ├── Convert dB to 0.0-1.0 linear scale:
│   │   level = Math.max(0, (dbValue + 60) / 60)
│   │   // -60dB or lower = 0.0 (silence)
│   │   // 0dB = 1.0 (max volume)
│   ├── Smooth with exponential moving average:
│   │   smoothed = 0.3 * current + 0.7 * previous
│   ├── Feed to onMeteringUpdate callback every 100ms
│   └── Store in meteringData[] for waveform rendering
│
└── M2.1.3 Background Recording Support 🔲
    ├── iOS: Audio session category .playAndRecord with .mixWithOthers
    │   └── staysActiveInBackground: true in Audio.setAudioModeAsync
    ├── Android: Foreground service notification required
    │   ├── Show persistent notification: "Windy Pro is recording"
    │   ├── Notification actions: [Pause] [Stop]
    │   └── Required for Android 12+ background recording
    └── Both: Continue recording when screen locks or app backgrounded
```

#### M2.2: Audio Quality Scoring 🔲
```
FILE: src/services/quality-scorer.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M2.1

CODONS:
├── M2.2.1 QualityScorer class 🔲
│   │
│   ├── async scoreRecording(uri: string): Promise<AudioQuality> 🔲
│   │   ├── Read audio file as PCM samples
│   │   ├── Calculate SNR (signal-to-noise ratio):
│   │   │   ├── Identify speech segments (energy > threshold)
│   │   │   ├── Identify silence segments (energy < threshold)
│   │   │   ├── SNR = 10 * log10(speechPower / noisePower)
│   │   │   └── Target: > 30dB = excellent, > 20dB = good
│   │   ├── Calculate speech ratio:
│   │   │   ├── speechFrames / totalFrames
│   │   │   └── Target: > 0.5 = good (user was actually talking)
│   │   ├── Detect clipping:
│   │   │   ├── Count samples at ±32767 (int16 max)
│   │   │   └── clippingRatio > 0.01 = hasClipping: true
│   │   ├── Compute weighted score:
│   │   │   ├── snrScore = clamp((snrDb + 10) / 50 * 100, 0, 100) * 0.50
│   │   │   ├── speechScore = speechRatio * 100 * 0.25
│   │   │   ├── clippingPenalty = hasClipping ? -15 : 0
│   │   │   ├── sampleRateBonus = sampleRate >= 44100 ? 10 : 0
│   │   │   └── score = clamp(snrScore + speechScore + clippingPenalty
│   │   │                     + sampleRateBonus, 0, 100)
│   │   └── Return AudioQuality { score, label, snrDb, speechRatio,
│   │         hasClipping, sampleRate }
│   │
│   └── getLabel(score: number): AudioQuality['label'] 🔲
│       ├── 90-100: 'excellent'
│       ├── 70-89: 'good'
│       ├── 50-69: 'fair'
│       └── 0-49: 'poor'
│
└── M2.2.2 Quality Badge Component 🔲
    FILE: src/components/QualityBadge.tsx
    ├── Props: { quality: AudioQuality }
    ├── Display: emoji + label + score
    │   ├── excellent: "⭐ Excellent (92)"
    │   ├── good: "✅ Good (75)"
    │   ├── fair: "⚠️ Fair (55)"
    │   └── poor: "❌ Poor (30)"
    ├── Color matches label:
    │   ├── excellent: colors.accent (lime green)
    │   ├── good: colors.accentSecondary (teal)
    │   ├── fair: colors.stateProcessing (yellow)
    │   └── poor: colors.stateError (red)
    └── Tappable → shows detail tooltip with tips:
        └── poor/fair: "Try recording in a quieter space 🎤"
```

---

### STRAND M3: TRANSCRIPTION ENGINE

#### M3.1: WindyTune — Auto-Configuration 🔲
```
FILE: src/services/windy-tune.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M1.4 (types)

CODONS:
├── M3.1.1 WindyTune class 🔲
│   │
│   │  WindyTune detects device capabilities and selects the
│   │  optimal voice engine. The user never makes this decision
│   │  unless they WANT to override it in Settings.
│   │
│   ├── async detectDevice(): Promise<DeviceProfile> 🔲
│   │   ├── model: Device.modelName             // "iPhone 15 Pro"
│   │   ├── platform: Platform.OS               // 'ios' | 'android'
│   │   ├── osVersion: Device.osVersion         // "17.2"
│   │   ├── totalRam: Device.totalMemory / 1e6  // MB
│   │   ├── availableStorage: check via expo-file-system
│   │   ├── cpuCores: (platform-specific detection)
│   │   ├── hasNeuralEngine: detect iOS Neural Engine
│   │   │   └── A11+ chips (iPhone 8+) have Neural Engine
│   │   │   └── Check by model name mapping
│   │   ├── hasNPU: detect Android NPU
│   │   │   └── Snapdragon 8 Gen 1+, Tensor G1+, Dimensity 9000+
│   │   │   └── Check by chipset string matching
│   │   └── chipset: (Android: Build.HARDWARE, iOS: model mapping)
│   │
│   ├── async recommend(): Promise<WindyTuneResult> 🔲
│   │   │
│   │   │  DECISION TREE (mirrors desktop B4.2):
│   │   │
│   │   ├── IF iOS + Neural Engine + RAM ≥ 6GB:
│   │   │   └── large-v3-turbo via Core ML
│   │   │       reason: "Best quality — optimized for your Apple chip"
│   │   │
│   │   ├── ELSE IF Android + NPU + RAM ≥ 8GB:
│   │   │   └── large-v3-turbo via ONNX/NNAPI
│   │   │       reason: "Best quality for your processor"
│   │   │
│   │   ├── ELSE IF RAM ≥ 6GB:
│   │   │   └── medium via whisper.rn (CPU)
│   │   │       reason: "High accuracy, good speed"
│   │   │
│   │   ├── ELSE IF RAM ≥ 4GB:
│   │   │   └── small via whisper.rn (CPU)
│   │   │       reason: "Balanced accuracy and speed"
│   │   │
│   │   ├── ELSE IF RAM ≥ 2GB:
│   │   │   └── base via whisper.rn (CPU)
│   │   │       reason: "Lightweight, works on your device"
│   │   │
│   │   └── ELSE (very low-end):
│   │       └── cloud-standard
│   │           reason: "Cloud processing — best experience for your device"
│   │
│   └── getAvailableEngines(): EngineConfig[] 🔲
│       └── Return all engines with isDownloaded status
│
├── M3.1.2 Engine Registry 🔲
│   │
│   │  CONSTANT: ENGINES map
│   │
│   ├── 'tiny':
│   │   displayName: "Tiny"
│   │   sizeBytes: 75_000_000       // 75 MB
│   │   ramRequired: 1000           // 1 GB
│   │   quality: 3, speed: 10
│   │   languages: ['en']           // English only
│   │
│   ├── 'base':
│   │   displayName: "Base"
│   │   sizeBytes: 140_000_000      // 140 MB
│   │   ramRequired: 1500           // 1.5 GB
│   │   quality: 5, speed: 8
│   │   languages: ['en', 'es', 'fr', ...]  // multilingual
│   │
│   ├── 'small':
│   │   displayName: "Small"
│   │   sizeBytes: 460_000_000      // 460 MB
│   │   ramRequired: 2500           // 2.5 GB
│   │   quality: 7, speed: 6
│   │   languages: ['en', 'es', 'fr', ...]
│   │
│   ├── 'medium':
│   │   displayName: "Medium"
│   │   sizeBytes: 1_500_000_000    // 1.5 GB
│   │   ramRequired: 4000           // 4 GB
│   │   quality: 8, speed: 4
│   │   languages: ['en', 'es', 'fr', ...]
│   │
│   ├── 'large-v3-turbo':
│   │   displayName: "Large v3 Turbo"
│   │   sizeBytes: 3_000_000_000    // 3 GB
│   │   ramRequired: 6000           // 6 GB
│   │   quality: 10, speed: 7       // turbo = fast despite size
│   │   languages: ['en', 'es', 'fr', ...]  // 99 languages
│   │
│   ├── 'cloud-standard':
│   │   displayName: "Cloud"
│   │   sizeBytes: 0                // no download
│   │   ramRequired: 0
│   │   quality: 9, speed: 8
│   │   isOnDevice: false
│   │   languages: all 99
│   │
│   └── 'cloud-turbo':
│       displayName: "Cloud Turbo"
│       sizeBytes: 0
│       ramRequired: 0
│       quality: 10, speed: 10
│       isOnDevice: false
│       languages: all 99
│       note: "NVIDIA 5090 32GB VRAM — maximum quality"
│
└── M3.1.3 Engine Download Manager 🔲
    ├── async downloadEngine(id: EngineId): Promise<void> 🔲
    │   ├── Check available storage first
    │   ├── Download from CDN (Cloudflare / Hugging Face)
    │   ├── Show progress: onProgress(percentage: number)
    │   ├── Resume interrupted downloads (range headers)
    │   ├── Verify checksum (SHA-256) after download
    │   ├── Store in app's private documents directory
    │   └── Mark engine as isDownloaded: true
    │
    ├── async deleteEngine(id: EngineId): Promise<void> 🔲
    │   ├── Remove model files from storage
    │   └── Mark engine as isDownloaded: false
    │
    └── getDownloadedEngines(): EngineConfig[] 🔲
        └── Scan local storage for installed models
```

#### M3.2: Transcription Service 🔲
```
FILE: src/services/transcription.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M3.1 (WindyTune), M2.1 (AudioCapture)

CODONS:
├── M3.2.1 TranscriptionService class 🔲
│   │
│   │  ROUTES audio to the correct engine (on-device or cloud)
│   │  based on WindyTune recommendation or user override.
│   │
│   ├── Properties:
│   │   ├── activeEngine: EngineId
│   │   ├── isProcessing: boolean
│   │   ├── onSegment: (segment: TranscriptSegment) => void
│   │   ├── onError: (error: Error) => void
│   │   └── segments: TranscriptSegment[]
│   │
│   ├── async transcribeFile(uri: string, engine?: EngineId):
│   │   Promise<TranscriptSegment[]> 🔲
│   │   │
│   │   ├── If engine not specified → use WindyTune recommendation
│   │   ├── If engine.isOnDevice:
│   │   │   └── Call localTranscribe(uri, engine)
│   │   ├── Else (cloud):
│   │   │   └── Call cloudTranscribe(uri, engine)
│   │   ├── Score quality: QualityScorer.scoreRecording(uri)
│   │   └── Return complete segments array
│   │
│   ├── async localTranscribe(uri: string, engine: EngineId):
│   │   Promise<TranscriptSegment[]> 🔲
│   │   │
│   │   │  Uses whisper.rn (React Native bindings for whisper.cpp)
│   │   │
│   │   ├── Load model if not already loaded:
│   │   │   └── whisper.initWhisper({ filePath: modelPath })
│   │   ├── Transcribe audio file:
│   │   │   └── whisper.transcribe(audioUri, {
│   │   │         language: settingsStore.language || 'auto',
│   │   │         maxLen: 0,        // no max segment length
│   │   │         translate: false,  // transcription only
│   │   │         onProgress: (progress) => {},
│   │   │         onNewSegments: (segments) => {
│   │   │           // Fire onSegment callback for each new segment
│   │   │           // This enables real-time display during processing
│   │   │         }
│   │   │       })
│   │   ├── Convert whisper.rn segments to TranscriptSegment[]
│   │   └── Return segments
│   │
│   ├── async cloudTranscribe(uri: string, engine: EngineId):
│   │   Promise<TranscriptSegment[]> 🔲
│   │   │
│   │   │  WebSocket streaming to Windy Cloud API
│   │   │  Server: wss://windypro.thewindstorm.uk/ws/transcribe
│   │   │  Backend: NVIDIA 5090 (32GB VRAM) via Kit 0 VPS gateway
│   │   │
│   │   ├── Open WebSocket connection
│   │   ├── Send auth message: { type: 'auth', token: licenseToken }
│   │   ├── Send config: { type: 'config', language, engine }
│   │   ├── Read audio file in chunks (16KB)
│   │   ├── Send each chunk as binary WebSocket message
│   │   ├── Receive transcript segments via onmessage
│   │   │   ├── { type: 'transcript', text, partial, confidence, ... }
│   │   │   └── Fire onSegment callback for real-time display
│   │   ├── Send stop: { type: 'stop' }
│   │   ├── Wait for final segments
│   │   ├── Close WebSocket
│   │   └── Return all segments
│   │
│   ├── async switchToCloud(): Promise<void> 🔲
│   │   │  Called when on-device engine fails, overheats, or user requests
│   │   ├── Set activeEngine to 'cloud-standard'
│   │   ├── Persist preference
│   │   └── Show toast: "Switched to cloud processing"
│   │
│   └── async switchToLocal(engine: EngineId): Promise<void> 🔲
│       ├── Verify engine is downloaded
│       ├── Set activeEngine to engine
│       ├── Persist preference
│       └── Show toast: "Switched to on-device processing"
│
└── M3.2.2 Real-Time Streaming Transcription 🔲
    │
    │  For LIVE transcription (words appear as you speak),
    │  NOT post-recording batch processing.
    │
    ├── On-Device Real-Time:
    │   ├── whisper.rn supports streaming via audio buffer feeding
    │   ├── Feed 5-second audio chunks while recording continues
    │   ├── Each chunk → partial segment → display immediately
    │   ├── When chunk finalized → update segment (isPartial: false)
    │   └── Latency target: < 800ms per chunk
    │
    └── Cloud Real-Time:
        ├── WebSocket stays open during entire recording session
        ├── Stream audio chunks every 100ms
        ├── Server responds with partial + final segments
        ├── Latency target: < 1.5s round-trip
        └── Reconnect automatically on WebSocket drop
```

---

### STRAND M4: FLOATING TORNADO OVERLAY (Android)

#### M4.1: Overlay Service 🔲
```
FILE: android/app/src/main/java/com/windypro/mobile/FloatingOverlayService.kt
STATUS: 🔲 NOT STARTED
DEPENDS ON: M2.1 (AudioCapture), M3.2 (Transcription)
PLATFORM: Android only

THE KILLER FEATURE: A floating tornado icon that persists over ALL apps.
User taps it to record, taps again to stop and paste text at cursor.

CODONS:
├── M4.1.1 FloatingOverlayService (extends Service) 🔲
│   │
│   ├── onCreate():
│   │   ├── Create WindowManager.LayoutParams (TYPE_APPLICATION_OVERLAY)
│   │   ├── Set initial position (bottom-right, 80dp from edges)
│   │   ├── Inflate floating button view (tornado ImageView)
│   │   ├── Set button size: 56dp × 56dp (standard FAB size)
│   │   ├── Apply strobe animation (green glow behind tornado)
│   │   └── Add view to WindowManager
│   │
│   ├── Touch handling:
│   │   ├── Single tap → toggleRecording()
│   │   │   ├── If idle → startRecording()
│   │   │   │   ├── Play record-start.wav blip
│   │   │   │   ├── Haptic feedback (EFFECT_CLICK)
│   │   │   │   ├── Start green strobe animation
│   │   │   │   ├── Tornado icon jiggles (rotation animation)
│   │   │   │   └── Start AudioCaptureService via React Native bridge
│   │   │   └── If recording → stopAndPaste()
│   │   │       ├── Play record-stop.wav blip
│   │   │       ├── Yellow strobe (processing)
│   │   │       ├── Get transcript from TranscriptionService
│   │   │       ├── Paste text at cursor via AccessibilityService
│   │   │       ├── Flash green (success) → return to idle
│   │   │       └── Haptic feedback (EFFECT_HEAVY_CLICK)
│   │   │
│   │   ├── Drag gesture → move button:
│   │   │   ├── Detect drag start (ACTION_MOVE after ACTION_DOWN)
│   │   │   ├── Update LayoutParams.x, LayoutParams.y
│   │   │   ├── Call WindowManager.updateViewLayout()
│   │   │   ├── Snap to nearest edge when released
│   │   │   └── Save position to SharedPreferences
│   │   │
│   │   ├── Double-tap → dismiss:
│   │   │   ├── Detect double-tap (< 300ms between taps)
│   │   │   ├── Animate out (scale to 0 + fade)
│   │   │   ├── Remove view from WindowManager
│   │   │   ├── Show toast: "Triple-tap anywhere to bring back Windy"
│   │   │   └── Register triple-tap listener via AccessibilityService
│   │   │
│   │   └── Triple-tap (when dismissed) → reappear:
│   │       ├── Detected via AccessibilityService gesture monitoring
│   │       ├── Button reappears at tap location
│   │       ├── Animate in (scale from 0 + fade in)
│   │       └── If user taps a 4th time quickly → start recording
│   │
│   ├── Strobe Animation:
│   │   ├── Green glow behind tornado (recording):
│   │   │   ├── Animated circle behind icon
│   │   │   ├── Scale pulse: 1.0 → 1.3 → 1.0, 1-second cycle
│   │   │   ├── Opacity pulse: 0.4 → 0.8 → 0.4
│   │   │   └── Color: #22c55e (stateRecording green)
│   │   ├── Yellow glow (processing):
│   │   │   ├── Solid yellow circle, no pulse
│   │   │   └── Color: #eab308
│   │   ├── Idle state:
│   │   │   ├── Subtle shadow, no glow
│   │   │   └── Slight breathing animation (very subtle scale)
│   │   └── Error state:
│   │       ├── Red flash (1 second)
│   │       └── Return to idle
│   │
│   └── Lifecycle:
│       ├── START_STICKY — restart if killed
│       ├── startForeground() with notification:
│       │   ├── "Windy Pro — Tap tornado to record"
│       │   ├── Low importance (no sound/vibration)
│       │   └── Notification action: [Open App] [Hide Tornado]
│       └── onDestroy(): remove view from WindowManager
│
├── M4.1.2 Permission Management 🔲
│   FILE: android/.../OverlayPermissionHelper.kt
│   ├── checkOverlayPermission(): Boolean
│   │   └── Settings.canDrawOverlays(context)
│   ├── requestOverlayPermission():
│   │   └── startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
│   └── React Native bridge:
│       └── @ReactMethod fun requestOverlay(promise: Promise)
│
└── M4.1.3 Customizable Button Icon 🔲
    ├── Default: tornado.png (bundled asset)
    ├── User can change in Settings → "Windy Button Icon"
    ├── Options:
    │   ├── Tornado (default)
    │   ├── Microphone
    │   ├── Windy Pro logo
    │   └── Custom image (pick from gallery)
    ├── Icon stored in app private storage
    └── FloatingOverlayService reads icon preference on create
```

#### M4.2: Accessibility Paste Service (Android) 🔲
```
FILE: android/.../PasteAccessibilityService.kt
STATUS: 🔲 NOT STARTED
DEPENDS ON: M4.1

CODONS:
├── M4.2.1 PasteAccessibilityService (extends AccessibilityService) 🔲
│   │
│   ├── pasteTextAtCursor(text: String):
│   │   ├── Get currently focused node: rootInActiveWindow.findFocus(FOCUS_INPUT)
│   │   ├── If editable text field found:
│   │   │   ├── Copy text to clipboard (ClipboardManager)
│   │   │   ├── Perform ACTION_PASTE on focused node
│   │   │   └── Restore previous clipboard content
│   │   ├── If no text field focused:
│   │   │   ├── Copy text to clipboard only
│   │   │   ├── Show toast: "Text copied — paste wherever you need it"
│   │   │   └── Haptic feedback
│   │   └── Error handling:
│   │       └── If paste fails → fallback to clipboard-only
│   │
│   ├── onAccessibilityEvent(): Monitor for triple-tap gesture
│   │   ├── Track consecutive taps within 500ms window
│   │   ├── If 3 taps detected → broadcast to FloatingOverlayService
│   │   └── Only active when tornado is dismissed
│   │
│   └── Service configuration (accessibility_service_config.xml):
│       ├── accessibilityEventTypes: typeAllMask
│       ├── accessibilityFeedbackType: feedbackGeneric
│       ├── canRetrieveWindowContent: true
│       └── canPerformGestures: true
│
└── M4.2.2 React Native Bridge 🔲
    FILE: android/.../WindyOverlayModule.kt
    ├── @ReactMethod startOverlay()
    ├── @ReactMethod stopOverlay()
    ├── @ReactMethod isOverlayActive(): Boolean
    ├── @ReactMethod pasteText(text: String)
    └── Registered in MainApplication as NativeModule
```

---

### STRAND M5: WINDY KEYBOARD EXTENSION (iOS)

#### M5.1: Custom Keyboard 🔲
```
FILE: ios/WindyKeyboard/KeyboardViewController.swift
STATUS: 🔲 NOT STARTED
DEPENDS ON: M2.1 (AudioCapture), M3.2 (Transcription)
PLATFORM: iOS only

THE iOS EQUIVALENT: A custom keyboard with a big tornado
record button. Available in any app with a text field.

CODONS:
├── M5.1.1 KeyboardViewController (extends UIInputViewController) 🔲
│   │
│   ├── viewDidLoad():
│   │   ├── Set up keyboard UI:
│   │   │   ├── Dark background (#0f172a)
│   │   │   ├── Big tornado record button (center, 72pt)
│   │   │   ├── Strobe indicator ring around button
│   │   │   ├── Mini transcript preview area (above button)
│   │   │   ├── Language indicator (bottom-left)
│   │   │   └── Globe key (bottom-right, switches keyboards)
│   │   ├── Keyboard height: 260pt (standard + transcript area)
│   │   └── Load preferences from App Group shared container
│   │
│   ├── Record Button Behavior:
│   │   ├── Tap to start recording:
│   │   │   ├── Request microphone (requestsOpenAccess in Info.plist)
│   │   │   ├── Start AVAudioRecorder
│   │   │   ├── Green strobe animation on button ring
│   │   │   ├── Show live transcript in preview area
│   │   │   └── Haptic feedback (UIImpactFeedbackGenerator)
│   │   │
│   │   ├── Tap to stop and insert:
│   │   │   ├── Stop recording → process with whisper.cpp
│   │   │   ├── Yellow strobe during processing
│   │   │   ├── Insert text via textDocumentProxy.insertText()
│   │   │   │   └── This is iOS's official way to type into any text field
│   │   │   ├── No clipboard needed — direct insertion
│   │   │   └── Return to idle state
│   │   │
│   │   └── Long press → show options:
│   │       ├── Switch engine (on-device / cloud)
│   │       ├── Change language
│   │       └── Open Windy Pro app
│   │
│   ├── App Group Shared Container:
│   │   ├── group.com.windypro.mobile
│   │   ├── Shares: settings, license status, engine path
│   │   ├── Keyboard reads user preferences from shared UserDefaults
│   │   └── Audio files saved to shared container for main app access
│   │
│   └── Limitations (iOS keyboard extensions):
│       ├── 30MB memory limit (must use tiny/base model, or cloud)
│       ├── Cannot access network without RequestsOpenAccess = true
│       ├── User must enable "Allow Full Access" in Settings
│       └── Must include globe key for switching keyboards
│
├── M5.1.2 Keyboard Info.plist Configuration 🔲
│   ├── NSExtension:
│   │   ├── NSExtensionPointIdentifier: com.apple.keyboard-service
│   │   └── NSExtensionPrincipalClass: WindyKeyboard.KeyboardViewController
│   ├── RequestsOpenAccess: true (needed for mic + network)
│   ├── NSMicrophoneUsageDescription: "Windy Pro Keyboard needs
│   │   microphone access to convert your speech to text."
│   └── PrefersDefaultHeight: 260
│
└── M5.1.3 iOS Dynamic Island Integration 🔲
    ├── When recording starts from keyboard OR main app:
    │   ├── Show Live Activity in Dynamic Island
    │   ├── Compact: green dot + "Recording..."
    │   ├── Expanded: waveform + duration + [Stop] button
    │   └── Tap Dynamic Island → open main app with active session
    ├── Requires: ActivityKit framework
    ├── Widget target: WindyProLiveActivity
    └── Works on iPhone 14 Pro and later
```

#### M5.2: iOS System Integration 🔲
```
STATUS: 🔲 NOT STARTED

CODONS:
├── M5.2.1 Home Screen Widget 🔲
│   ├── Small widget (2×2): Tornado icon + "Tap to Record"
│   │   └── Tap → opens Windy Pro and starts recording immediately
│   ├── Medium widget (4×2): Recent session preview + Record button
│   ├── Implemented via WidgetKit (SwiftUI)
│   └── Widget target: WindyProWidget
│
├── M5.2.2 Lock Screen Widget 🔲
│   ├── Circular widget: Tornado icon
│   ├── Tap → opens app and starts recording
│   └── Available iOS 16+
│
├── M5.2.3 Action Button Mapping 🔲
│   ├── iPhone 15 Pro/16: Action Button can trigger Windy Pro
│   ├── Via Shortcuts integration:
│   │   └── "Start Windy Pro Recording" shortcut
│   ├── Physical button → instant recording without touching screen
│   └── Best accessibility feature: eyes-free recording
│
├── M5.2.4 Back Tap Shortcut 🔲
│   ├── Settings → Accessibility → Touch → Back Tap
│   ├── Double-tap back of phone → "Start Windy Pro Recording"
│   ├── Triple-tap back → "Stop and Paste"
│   ├── Via Shortcuts app integration
│   └── Guide user during onboarding if they want this
│
└── M5.2.5 Siri Shortcut 🔲
    ├── "Hey Siri, Record with Windy"
    ├── Donates shortcut via INInteraction
    ├── Appears in Siri Suggestions
    └── App Intents framework (iOS 16+)
```

---

### STRAND M6: WINDY TRANSLATE (Conversation Mode)

#### M6.1: Translation Engine 🔲
```
FILE: src/services/translation.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M3.2 (Transcription)
TIER: Windy Translate ($79) and Translate Pro ($149)

CODONS:
├── M6.1.1 TranslationService class 🔲
│   │
│   ├── Properties:
│   │   ├── sourceLang: string     // ISO 639-1
│   │   ├── targetLang: string
│   │   ├── isActive: boolean
│   │   └── mode: 'manual' | 'auto' | 'split-screen'
│   │
│   ├── async translate(text: string, from: string, to: string):
│   │   Promise<{ translated: string, confidence: number }> 🔲
│   │   │
│   │   ├── ON-DEVICE (Translate Pro — offline):
│   │   │   ├── Use CTranslate2 via React Native native module
│   │   │   ├── NLLB-200 models (Meta's No Language Left Behind)
│   │   │   ├── Model selection based on hardware (mirrors WindyTune):
│   │   │   │   ├── High-end: NLLB-3.3B (6GB, GPU/NPU)
│   │   │   │   ├── Mid-range: NLLB-1.3B (2.5GB, CPU)
│   │   │   │   ├── Low-end: NLLB-600M (1.2GB, CPU)
│   │   │   │   └── Minimal: OPUS-MT bilingual (300MB per pair)
│   │   │   └── Latency target: < 200ms per sentence
│   │   │
│   │   ├── CLOUD (Windy Translate — requires internet):
│   │   │   ├── POST https://windypro.thewindstorm.uk/api/translate
│   │   │   ├── Body: { text, source: from, target: to }
│   │   │   ├── Response: { translated, confidence }
│   │   │   └── Latency target: < 500ms
│   │   │
│   │   └── HYBRID (auto-select):
│   │       ├── If offline → use on-device model
│   │       ├── If online + model not downloaded → use cloud
│   │       └── If online + model downloaded → use on-device (faster)
│   │
│   └── swapLanguages(): void 🔲
│       └── Swap sourceLang ↔ targetLang
│
└── M6.1.2 Supported Languages 🔲
    ├── Tier 1 (Launch — 15 languages):
    │   en, es, fr, de, pt, it, zh, ja, ko, ar, hi, ru, tr, vi, nl
    ├── Tier 2 (Month 2 — +30):
    │   pl, sv, no, da, fi, th, id, ms, tl, uk, cs, ro, hu, el,
    │   he, fa, ur, bn, ta, te, sw, am, ha, yo, ig, zu, af, ca, eu
    └── Tier 3 (Month 3+ — to 99 total):
        Fill from NLLB-200 list based on user demand
```

#### M6.2: Conversation Mode UI 🔲
```
FILE: app/translate/index.tsx
STATUS: 🔲 NOT STARTED
DEPENDS ON: M6.1, M2.1, M3.2

CODONS:
├── M6.2.1 Conversation Screen Layout 🔲
│   │
│   ├── Header:
│   │   ├── [← Back] "Windy Translate"
│   │   ├── Language selectors: [English 🇺🇸] ⇄ [Spanish 🇪🇸]
│   │   │   └── Tap to swap, tap language name to change
│   │   └── Mode toggle: [Manual] [Auto] [Split]
│   │
│   ├── Conversation Area (scrollable):
│   │   ├── Chat-bubble style layout
│   │   ├── Speaker A bubble (left, blue tint):
│   │   │   ├── Original text (smaller, muted)
│   │   │   └── Translated text (larger, bright)
│   │   ├── Speaker B bubble (right, green tint):
│   │   │   ├── Original text (smaller, muted)
│   │   │   └── Translated text (larger, bright)
│   │   └── Auto-scroll to latest bubble
│   │
│   └── Control Area (bottom):
│       ├── MANUAL MODE:
│       │   ├── Big button: "I'm speaking" / "They're speaking"
│       │   ├── Tap to switch active speaker
│       │   └── Active speaker's mic is live
│       ├── AUTO MODE:
│       │   ├── Single record button (always listening)
│       │   ├── Language detection determines speaker
│       │   └── "Just talk — Windy figures out who's who"
│       └── SPLIT-SCREEN MODE:
│           ├── Screen divided horizontally
│           ├── Top half: Speaker A's view (translated for them)
│           ├── Bottom half: Speaker B's view (translated for them)
│           └── Phone laid flat on table between speakers
│
├── M6.2.2 Text-to-Speech Output 🔲
│   ├── After translation, optionally speak it aloud
│   ├── Use expo-speech (uses system TTS voices)
│   ├── Voice selection per language
│   ├── Speed adjustable: 0.75x - 1.5x
│   ├── Toggle: Settings → Translate → "Speak translations"
│   └── Earphone mode: original in one ear, translation in other
│       └── Requires stereo audio routing (advanced, Phase 3)
│
└── M6.2.3 Conversation Export 🔲
    ├── [Export] button → choose format:
    │   ├── .txt (plain text, interleaved)
    │   ├── .md (formatted, bilingual columns)
    │   └── .srt (subtitles, timestamped)
    ├── Share via system share sheet
    ├── Auto-saved to session history
    └── Includes metadata: languages, duration, speakers
```

---

### STRAND M7: MEDIA ARCHIVE & LOCAL STORAGE

#### M7.1: Local Database 🔲
```
FILE: src/services/storage-local.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M1.4 (types)

CODONS:
├── M7.1.1 Database Schema (expo-sqlite) 🔲
│   │
│   │  TABLE: sessions
│   │  ├── id TEXT PRIMARY KEY        -- uuid
│   │  ├── created_at TEXT            -- ISO 8601
│   │  ├── duration REAL              -- seconds
│   │  ├── transcript TEXT            -- full text
│   │  ├── segments_json TEXT         -- JSON array of TranscriptSegment
│   │  ├── audio_path TEXT            -- relative path to audio file
│   │  ├── video_path TEXT            -- relative path to video file
│   │  ├── quality_score INTEGER      -- 0-100
│   │  ├── quality_json TEXT          -- full AudioQuality JSON
│   │  ├── engine_used TEXT           -- engine ID
│   │  ├── source TEXT                -- 'record'|'translate'|'keyboard'|'overlay'
│   │  ├── languages_json TEXT        -- JSON array of language codes
│   │  ├── media_audio BOOLEAN        -- was audio captured?
│   │  ├── media_video BOOLEAN        -- was video captured?
│   │  ├── file_size INTEGER          -- total bytes
│   │  ├── synced BOOLEAN DEFAULT 0
│   │  ├── synced_at TEXT
│   │  ├── clone_usable BOOLEAN
│   │  ├── tags_json TEXT             -- JSON array of strings
│   │  ├── latitude REAL
│   │  ├── longitude REAL
│   │  └── device_model TEXT
│   │
│   │  TABLE: settings
│   │  ├── key TEXT PRIMARY KEY
│   │  └── value TEXT                 -- JSON-encoded
│   │
│   │  TABLE: engines
│   │  ├── id TEXT PRIMARY KEY
│   │  ├── downloaded BOOLEAN
│   │  ├── file_path TEXT
│   │  ├── size_bytes INTEGER
│   │  └── downloaded_at TEXT
│   │
│   │  TABLE: sync_queue
│   │  ├── session_id TEXT PRIMARY KEY
│   │  ├── queued_at TEXT
│   │  ├── status TEXT                -- 'pending'|'uploading'|'done'|'failed'
│   │  ├── attempts INTEGER DEFAULT 0
│   │  └── error TEXT
│   │
│   │  INDEX: idx_sessions_created ON sessions(created_at DESC)
│   │  INDEX: idx_sessions_synced ON sessions(synced)
│   │  INDEX: idx_sessions_source ON sessions(source)
│   │  INDEX: idx_sessions_quality ON sessions(quality_score)
│   │
│   └── Migration system:
│       ├── Version tracking in settings table
│       ├── Run migrations on app start
│       └── Each migration is idempotent
│
├── M7.1.2 LocalStorageService class 🔲
│   │
│   ├── async initialize(): Promise<void> 🔲
│   │   ├── Open/create SQLite database
│   │   ├── Run pending migrations
│   │   └── Create directories if needed
│   │
│   ├── async saveSession(session: Session): Promise<void> 🔲
│   │   ├── Insert into sessions table
│   │   ├── Move audio file from temp to permanent location:
│   │   │   └── {documentsDir}/windy/audio/{date}/{sessionId}.wav
│   │   ├── Move video file if exists:
│   │   │   └── {documentsDir}/windy/video/{date}/{sessionId}.mp4
│   │   ├── Save transcript as separate file:
│   │   │   └── {documentsDir}/windy/text/{date}/{sessionId}.json
│   │   ├── Add to sync queue if cloud sync enabled
│   │   └── Update clone tracker
│   │
│   ├── async getSessions(filter?: SessionFilter):
│   │   Promise<SessionSummary[]> 🔲
│   │   ├── Query sessions table with optional filters
│   │   ├── Return summaries (not full transcript for performance)
│   │   ├── Paginated: limit 50, offset-based
│   │   └── Ordered by created_at DESC (newest first)
│   │
│   ├── async getSession(id: string): Promise<Session> 🔲
│   │   └── Full session with all segments
│   │
│   ├── async deleteSession(id: string): Promise<void> 🔲
│   │   ├── Delete from sessions table
│   │   ├── Delete audio/video/text files
│   │   ├── Remove from sync queue
│   │   └── Update clone tracker (subtract hours)
│   │
│   ├── async searchSessions(query: string): Promise<SessionSummary[]> 🔲
│   │   ├── Full-text search on transcript column
│   │   ├── WHERE transcript LIKE '%query%'
│   │   └── Return matching sessions with highlighted snippets
│   │
│   └── async getStorageUsage(): Promise<StorageUsage> 🔲
│       ├── audioBytes: sum of audio files
│       ├── videoBytes: sum of video files
│       ├── textBytes: sum of text files
│       ├── engineBytes: sum of downloaded model files
│       ├── totalBytes: sum of all
│       └── sessionCount: total sessions
│
└── M7.1.3 File Organization 🔲
    │
    │  DIRECTORY STRUCTURE (on device):
    │
    │  {documentsDir}/windy/
    │  ├── audio/
    │  │   ├── 2026-03/
    │  │   │   ├── abc123-def456.wav
    │  │   │   └── abc123-def456.json   (metadata)
    │  │   └── 2026-04/
    │  │       └── ...
    │  ├── video/
    │  │   └── 2026-03/
    │  │       └── ghi789-jkl012.mp4
    │  ├── text/
    │  │   └── 2026-03/
    │  │       └── abc123-def456.json   (full transcript + segments)
    │  ├── engines/
    │  │   ├── ggml-base.bin
    │  │   ├── ggml-small.bin
    │  │   └── ...
    │  └── windy.db                     (SQLite database)
    │
    └── Auto-cleanup: if device storage < 500MB free → prompt user
        to move sessions to cloud or delete low-quality ones
```

---

### STRAND M8: CLOUD SYNC ENGINE

#### M8.1: Sync Service 🔲
```
FILE: src/services/sync-engine.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M7.1 (LocalStorage), M10 (License — need tier check)

THE iCLOUD MODEL: Completely invisible. When user is on Wi-Fi
and plugged in, upload everything that hasn't been uploaded yet.
User sets destination once, forgets about it forever.

CODONS:
├── M8.1.1 SyncEngine class 🔲
│   │
│   ├── Properties:
│   │   ├── isEnabled: boolean          // user opt-in
│   │   ├── isSyncing: boolean          // currently uploading
│   │   ├── destination: SyncDestination
│   │   ├── syncConditions: SyncConditions
│   │   └── onProgress: (status: SyncProgress) => void
│   │
│   ├── SyncDestination type:
│   │   ├── type: 'windy-cloud' | 'custom-s3' | 'none'
│   │   ├── endpoint: string            // MinIO URL or custom S3
│   │   ├── bucket: string              // default: 'windy-users'
│   │   ├── accessKey: string
│   │   ├── secretKey: string
│   │   └── region: string
│   │
│   ├── SyncConditions type:
│   │   ├── wifiOnly: boolean           // default: true
│   │   ├── pluggedInOnly: boolean      // default: true
│   │   ├── syncAudio: boolean          // default: true
│   │   ├── syncVideo: boolean          // default: true
│   │   └── syncText: boolean           // default: true
│   │
│   ├── Methods:
│   │   ├── async startSync(): Promise<void> 🔲
│   │   │   ├── Check conditions:
│   │   │   │   ├── Is sync enabled? (isEnabled)
│   │   │   │   ├── Is user on Wi-Fi? (NetInfo)
│   │   │   │   ├── Is device plugged in? (expo-battery)
│   │   │   │   ├── Is license tier sufficient? (Pro+ for cloud)
│   │   │   │   └── If any condition fails → skip, try later
│   │   │   ├── Query sync_queue for pending items
│   │   │   ├── For each pending session:
│   │   │   │   ├── Upload audio file to S3:
│   │   │   │   │   PUT /{userId}/audio/{date}/{sessionId}.wav
│   │   │   │   ├── Upload video file (if exists):
│   │   │   │   │   PUT /{userId}/video/{date}/{sessionId}.mp4
│   │   │   │   ├── Upload metadata JSON:
│   │   │   │   │   PUT /{userId}/text/{date}/{sessionId}.json
│   │   │   │   ├── Mark session as synced in SQLite
│   │   │   │   ├── Update sync_queue status → 'done'
│   │   │   │   └── If upload fails:
│   │   │   │       ├── Increment attempts counter
│   │   │   │       ├── Set status → 'failed'
│   │   │   │       ├── Retry with exponential backoff
│   │   │   │       └── After 5 failures → skip, log error
│   │   │   └── Fire onProgress callback after each file
│   │   │
│   │   ├── async registerBackgroundSync(): Promise<void> 🔲
│   │   │   ├── Use expo-background-fetch:
│   │   │   │   TaskManager.defineTask('WINDY_SYNC', async () => {
│   │   │   │     await syncEngine.startSync();
│   │   │   │     return BackgroundFetch.BackgroundFetchResult.NewData;
│   │   │   │   })
│   │   │   ├── Register with minimum interval: 15 minutes
│   │   │   ├── iOS: Background App Refresh must be enabled
│   │   │   └── Android: WorkManager for reliable scheduling
│   │   │
│   │   └── async getSyncStatus(): Promise<SyncStatus> 🔲
│   │       ├── totalSessions: count all sessions
│   │       ├── syncedSessions: count where synced = true
│   │       ├── pendingUploadBytes: sum file sizes of unsynced
│   │       ├── lastSyncAt: most recent synced_at value
│   │       ├── storageUsed: query cloud API for usage
│   │       └── storageQuota: from license tier
│   │
│   └── Windy Cloud Configuration (MinIO):
│       ├── Endpoint: https://windypro.thewindstorm.uk/storage
│       ├── Gateway: Kit 0 VPS (72.60.118.54)
│       ├── Cluster: 5 nodes, 1,831 GB total
│       │   ├── OC5 iMac: 786 GB
│       │   ├── OC2 HP ProBook: 395 GB
│       │   ├── OC4 Lenovo: 414 GB
│       │   ├── OC3 Dell: 168 GB
│       │   └── Kit 0 VPS: 68 GB
│       ├── Protocol: S3-compatible API
│       ├── Encryption: AES-256 at rest, TLS in transit
│       └── User bucket path: windy-users/{userId}/
│
└── M8.1.2 S3 Upload Client 🔲
    FILE: src/services/storage-cloud.ts
    ├── Uses @aws-sdk/client-s3 (S3-compatible → works with MinIO)
    ├── async uploadFile(localPath, remotePath): Promise<void>
    │   ├── Multipart upload for files > 5MB
    │   ├── Progress callback for UI
    │   ├── Retry on network failure (3 attempts)
    │   └── Verify upload with HEAD request after
    ├── async getUsage(): Promise<{ used: number, quota: number }>
    └── async deleteRemote(remotePath): Promise<void>
```

---

### STRAND M9: CLONE PIPELINE & PROGRESS

#### M9.1: Clone Tracker 🔲
```
FILE: src/services/clone-tracker.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M7.1 (LocalStorage), M2.2 (QualityScorer)

Every recording session silently accumulates data toward
the user's voice/avatar clone. This strand tracks progress
toward the 10+ hour threshold needed for quality clone training.

CODONS:
├── M9.1.1 CloneTracker class 🔲
│   │
│   ├── Properties:
│   │   ├── totalHours: number          // total usable audio hours
│   │   ├── qualityDistribution: {      // breakdown by quality tier
│   │   │     excellent: number,
│   │   │     good: number,
│   │   │     fair: number,
│   │   │     poor: number
│   │   │   }
│   │   ├── milestones: CloneMilestone[]
│   │   └── cloneReadiness: number      // 0-100 overall score
│   │
│   ├── CloneMilestone type:
│   │   ├── threshold: number           // hours (2.5, 5, 7.5, 10)
│   │   ├── label: string               // "25%", "50%", "75%", "Ready!"
│   │   ├── reached: boolean
│   │   └── reachedAt: string | null
│   │
│   ├── async recalculate(): Promise<CloneProgress> 🔲
│   │   ├── Query all sessions WHERE clone_usable = true
│   │   ├── Sum durations by quality tier
│   │   ├── Weight by quality:
│   │   │   ├── excellent: 1.0x credit
│   │   │   ├── good: 0.8x credit
│   │   │   ├── fair: 0.5x credit
│   │   │   └── poor: 0.0x credit (doesn't count)
│   │   ├── totalHours = sum of weighted hours
│   │   ├── cloneReadiness = min(100, (totalHours / 10) * 100)
│   │   ├── Check milestones:
│   │   │   ├── 25% (2.5 hours) → notification + celebration
│   │   │   ├── 50% (5 hours) → notification + celebration
│   │   │   ├── 75% (7.5 hours) → notification + celebration
│   │   │   └── 100% (10 hours) → BIG notification + confetti
│   │   └── Persist to settings store
│   │
│   └── getProgress(): CloneProgress 🔲
│       └── Return { totalHours, qualityDistribution,
│             milestones, cloneReadiness, estimatedTimeToReady }
│
└── M9.1.2 Clone Progress UI 🔲
    FILE: app/clone/index.tsx
    ├── Circular progress meter (0-100%)
    ├── Hour breakdown by quality tier (stacked bar)
    ├── Milestone badges (25% / 50% / 75% / 100%)
    ├── Estimated time to completion based on daily usage
    ├── Tips: "Record in quiet spaces for best clone quality 🎤"
    ├── Video hours tracked separately (for avatar clone)
    └── "What's a voice clone?" — educational section
```

---

### STRAND M10: PAYMENT & LICENSING

#### M10.1: License Validation 🔲
```
FILE: src/services/license.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M1.1 (Shell)

CODONS:
├── M10.1.1 LicenseService class 🔲
│   │
│   ├── Properties:
│   │   ├── tier: 'free' | 'pro' | 'translate' | 'translate_pro'
│   │   ├── licenseKey: string | null
│   │   ├── isValidated: boolean
│   │   └── features: string[]         // unlocked feature list
│   │
│   ├── Tier Feature Matrix:
│   │   ├── FREE:
│   │   │   ├── 1 language (English)
│   │   │   ├── 3 engines (tiny, base, cloud-standard)
│   │   │   ├── 5-minute recording max
│   │   │   ├── No cloud sync
│   │   │   ├── No translation
│   │   │   └── No Speaker ID
│   │   │
│   │   ├── PRO ($49 one-time):
│   │   │   ├── 99 languages
│   │   │   ├── All engines (including large-v3-turbo + cloud-turbo)
│   │   │   ├── 30-minute recording max
│   │   │   ├── Cloud sync enabled
│   │   │   ├── LLM text cleanup
│   │   │   ├── Speaker ID (diarization)
│   │   │   ├── Batch mode
│   │   │   └── 5 device limit
│   │   │
│   │   ├── TRANSLATE ($79 one-time):
│   │   │   ├── All Pro features
│   │   │   ├── Real-time translation (5 language pairs)
│   │   │   ├── Conversation mode
│   │   │   └── Cloud translation API
│   │   │
│   │   └── TRANSLATE PRO ($149 one-time):
│   │       ├── All Translate features
│   │       ├── 99 language pairs
│   │       ├── Offline translation models
│   │       ├── TTS output
│   │       ├── Medical/Legal glossaries
│   │       └── Priority cloud processing
│   │
│   ├── async validateLicense(key: string): Promise<LicenseValidation> 🔲
│   │   ├── POST https://windypro.thewindstorm.uk/api/license/validate
│   │   ├── Body: { key, deviceId: Constants.deviceId }
│   │   ├── Response: LicenseValidation object
│   │   ├── Cache validation result locally (24h expiry)
│   │   ├── If offline → use cached validation
│   │   └── If no cache + offline → degrade to free tier
│   │
│   ├── isFeatureUnlocked(feature: string): boolean 🔲
│   │   └── Check tier against feature matrix
│   │
│   └── async openPurchasePage(): Promise<void> 🔲
│       ├── Web-based Stripe checkout (avoid App Store commissions):
│       │   ├── Open: https://windypro.thewindstorm.uk/pricing?device={deviceId}
│       │   ├── User completes purchase in browser
│       │   ├── License key delivered via redirect URL + email
│       │   └── App detects license key from deep link redirect
│       └── Fallback: RevenueCat in-app purchase (if Apple requires)
│
└── M10.1.2 RevenueCat + Stripe Integration ✅
    │
    │  ⚠️  APP STORE COMPLIANCE (updated 2026-03-18):
    │  All in-app purchases go through RevenueCat (Apple/Google IAP).
    │  Website sales (windytraveler.com) are handled outside the app via Stripe.
    │  The app NEVER links to or references website purchases.
    │  The app only knows the user's tier from the license server.
    │
    ├── RevenueCat (in-app — iOS/Android):
    │   ├── Package: react-native-purchases
    │   ├── Products:
    │   │   ├── windy_bundle_traveler: $49 (25 pairs)
    │   │   ├── windy_bundle_polyglot: $149 (200 pairs)
    │   │   └── windy_bundle_marco_polo: $999 (all pairs, lifetime)
    │   ├── Apple/Google take 30% on IAP
    │   └── Webhooks → server sets tier in license DB
    │
    ├── Stripe (website only — NOT referenced in app):
    │   ├── Products mirror RevenueCat lineup (same tiers)
    │   ├── Webhook: POST /api/stripe/webhook
    │   │   ├── checkout.session.completed → generate license
    │   │   ├── payment_intent.succeeded → log payment
    │   │   └── charge.refunded → revoke license (Layer 3 DRM)
    │   └── Coupons:
    │       ├── WINDY30: 30% off
    │       └── BETATESTER: 50% off
    │
    └── Entitlement Flow:
        1. User buys via IAP (RevenueCat) or website (Stripe)
        2. Server processes webhook → sets tier in license DB
        3. App calls GET /api/v1/license/verify → gets tier
        4. App unlocks features based on tier
        5. App has NO knowledge of which payment channel was used
```

---

### STRAND M11: SETTINGS & PREFERENCES

#### M11.1: Settings Screen 🔲
```
FILE: app/(tabs)/settings.tsx
STATUS: 🔲 NOT STARTED
DEPENDS ON: M1.2 (Navigation), M3.1 (WindyTune), M10.1 (License)

CODONS:
├── M11.1.1 Settings Layout 🔲
│   │
│   ├── Section: Account
│   │   ├── License tier badge (Free / Pro / Translate / Translate Pro)
│   │   ├── [Upgrade] button (if not Translate Pro)
│   │   ├── License key display (masked: XXXX-XXXX-XXXX-1234)
│   │   └── Device count: "2 of 5 devices"
│   │
│   ├── Section: Voice Engine
│   │   ├── Current engine: "Large v3 Turbo (recommended)"
│   │   ├── [Change Engine] → engine selection sheet
│   │   ├── WindyTune toggle: "Auto-select best engine" (default: ON)
│   │   ├── Cloud fallback toggle: "Use cloud if device struggles" (ON)
│   │   └── Downloaded engines list with [Delete] option
│   │
│   ├── Section: Recording
│   │   ├── Default language: [Language Picker]
│   │   ├── Audio quality: High (44.1kHz) / Standard (16kHz)
│   │   ├── Media toggles default: Audio [ON] / Video [OFF] / Text [ON]
│   │   ├── Max recording duration: 5 min (free) / 30 min (pro)
│   │   └── Location tagging: ON / OFF
│   │
│   ├── Section: Windy Button (Android) / Keyboard (iOS)
│   │   ├── Android:
│   │   │   ├── Floating tornado: ON / OFF
│   │   │   ├── Button icon: [Tornado / Microphone / Custom]
│   │   │   ├── Button size: Small / Medium / Large
│   │   │   └── Haptic feedback: ON / OFF
│   │   ├── iOS:
│   │   │   ├── Keyboard enabled: [Go to Settings]
│   │   │   └── Dynamic Island: ON / OFF
│   │   └── Audio feedback (blip sounds): ON / OFF
│   │
│   ├── Section: Cloud Sync
│   │   ├── Sync enabled: ON / OFF
│   │   ├── Destination: [Windy Cloud / Custom S3 / None]
│   │   ├── Sync conditions: Wi-Fi only [ON] / Plugged in only [ON]
│   │   ├── Sync status: "42 of 50 sessions synced"
│   │   ├── Pending upload: "1.2 GB waiting"
│   │   └── [Sync Now] manual trigger button
│   │
│   ├── Section: Storage
│   │   ├── Local usage breakdown (audio / video / text / engines)
│   │   ├── Cloud usage (if syncing): "12.5 GB of 50 GB"
│   │   ├── [Clear Cache] button
│   │   └── [Export All Data] button (privacy compliance)
│   │
│   ├── Section: Translation (Translate tier+)
│   │   ├── Preferred languages: source + target
│   │   ├── Speak translations: ON / OFF
│   │   ├── TTS voice selection per language
│   │   └── Auto-detect language: ON / OFF
│   │
│   ├── Section: Clone
│   │   ├── Clone tracking: ON / OFF (default: ON — silent accum)
│   │   ├── Current progress: "5.2 of 10 hours (52%)"
│   │   └── [View Clone Dashboard] → clone/index.tsx
│   │
│   └── Section: About
│       ├── Version: "1.0.0 (Build 42)"
│       ├── [Privacy Policy]
│       ├── [Terms of Service]
│       ├── [Contact Support] → email
│       └── [Rate Windy Pro] → App Store / Play Store
│
└── M11.1.2 Settings Persistence (Zustand) 🔲
    FILE: src/stores/useSettingsStore.ts
    ├── Uses zustand with persist middleware (AsyncStorage)
    ├── All settings have sensible defaults
    ├── Changes take effect immediately (no "save" button)
    └── Shared with iOS keyboard via App Group container
```

---

### STRAND M12: VIDEO CAPTURE

#### M12.1: Camera Service 🔲
```
FILE: src/services/video-capture.ts
STATUS: 🔲 NOT STARTED
DEPENDS ON: M2.1 (AudioCapture — records simultaneously)

CODONS:
├── M12.1.1 VideoCaptureService class 🔲
│   │
│   ├── async startVideoCapture(sessionId: string): Promise<void> 🔲
│   │   ├── Request camera permission (expo-camera)
│   │   ├── Start recording: Camera.recordAsync({
│   │   │     maxDuration: 1800,        // 30 min
│   │   │     quality: Camera.Constants.VideoQuality['720p'],
│   │   │     mute: true,               // audio handled by AudioCapture
│   │   │   })
│   │   ├── Default camera: front (for face data / avatar clone)
│   │   ├── User can switch to rear (for OCR, signs, documents)
│   │   └── Save to temp location pending session completion
│   │
│   ├── async stopVideoCapture(): Promise<{ uri: string, size: number }> 🔲
│   │   ├── Stop recording
│   │   ├── Return file URI and size
│   │   └── Temp file will be moved by LocalStorage.saveSession()
│   │
│   └── async captureOCR(): Promise<string> 🔲
│       ├── Use rear camera
│       ├── Capture single frame
│       ├── Run OCR (react-native-mlkit-ocr or expo-ml-kit)
│       ├── Return extracted text
│       └── Feed text to TranslationService if in translate mode
│
└── M12.1.2 OCR Translation 🔲
    ├── Point camera at sign/menu/document
    ├── Live preview with detected text overlay
    ├── Tap to translate detected text
    ├── Show original + translated side by side
    └── Save as session (source: 'ocr')
```

---

### STRAND M13: APP STORE SUBMISSION & DISTRIBUTION

#### M13.1: iOS App Store 🔲
```
STATUS: 🔲 NOT STARTED
DEPENDS ON: All other strands complete

CODONS:
├── M13.1.1 App Store Requirements 🔲
│   ├── App icon: 1024×1024 (tornado on dark background)
│   ├── Screenshots: 6.7" (iPhone 15 Pro Max), 6.1" (iPhone 15)
│   │   ├── 1: Hero — "Voice to Text, Your Way" + record button
│   │   ├── 2: Real-time transcription in action
│   │   ├── 3: Windy Translate conversation mode
│   │   ├── 4: History/archive browser
│   │   └── 5: Comparison chart vs competitors
│   ├── App description, keywords, categories
│   ├── Privacy labels:
│   │   ├── Data NOT linked to you: audio (processed on-device)
│   │   ├── Data linked to you: none (unless cloud sync opted in)
│   │   └── Data used for tracking: none
│   ├── Review notes explaining:
│   │   ├── Keyboard extension requires "Allow Full Access"
│   │   ├── Microphone used for speech-to-text only
│   │   └── All digital goods purchased via IAP (RevenueCat)
│   │       ├── No website purchase links in the app binary
│   │       └── Complies with App Store Guidelines 3.1.1
│   └── TestFlight beta first (internal → external)
│
├── M13.1.2 iOS Permission Descriptions 🔲
│   ├── NSMicrophoneUsageDescription:
│   │   "Windy Pro uses your microphone to convert speech to text.
│   │    Audio is processed on your device and never sent to our servers."
│   ├── NSCameraUsageDescription:
│   │   "Windy Pro uses your camera for OCR translation
│   │    and optional video recording."
│   ├── NSLocationWhenInUseUsageDescription:
│   │   "Windy Pro tags recordings with location for easy searching.
│   │    Location data stays on your device."
│   └── NSSpeechRecognitionUsageDescription:
│       "Windy Pro uses speech recognition to convert your voice to text."
│
└── M13.1.3 Expo EAS Build Configuration 🔲
    ├── eas.json:
    │   ├── build.production.ios.autoIncrement: true
    │   ├── build.production.ios.credentialsSource: "remote"
    │   └── submit.production.ios.appleId: (Grant's Apple ID)
    ├── app.json iOS config:
    │   ├── bundleIdentifier: "com.windypro.mobile"
    │   ├── buildNumber: auto-increment
    │   └── supportsTablet: true
    └── Build command: eas build --platform ios --profile production
```

#### M13.2: Google Play Store 🔲
```
STATUS: 🔲 NOT STARTED

CODONS:
├── M13.2.1 Play Store Requirements 🔲
│   ├── Feature graphic: 1024×500
│   ├── Screenshots: phone + tablet
│   ├── App description, categories
│   ├── Data safety section:
│   │   ├── Audio: processed on-device, not shared
│   │   ├── Location: optional, not shared
│   │   └── Financial: handled by Stripe (web-based)
│   ├── Content rating questionnaire
│   └── Internal testing track → closed beta → production
│
├── M13.2.2 Android Permission Declarations 🔲
│   ├── RECORD_AUDIO: "Required for voice-to-text"
│   ├── CAMERA: "Optional, for OCR and video"
│   ├── ACCESS_FINE_LOCATION: "Optional, for tagging"
│   ├── SYSTEM_ALERT_WINDOW: "For floating Windy button"
│   ├── FOREGROUND_SERVICE: "For background recording"
│   ├── BIND_ACCESSIBILITY_SERVICE: "For paste-at-cursor"
│   └── POST_NOTIFICATIONS: "For clone milestones"
│
└── M13.2.3 Expo EAS Build Configuration 🔲
    ├── app.json Android config:
    │   ├── package: "com.windypro.mobile"
    │   ├── versionCode: auto-increment
    │   └── adaptiveIcon: { foregroundImage, backgroundColor }
    └── Build command: eas build --platform android --profile production
```

---

### STRAND L: MARKETPLACE & MODEL PROTECTION

> **Added:** v2.0.0 (2026-03-18) | **Status:** ✅ Core implementation complete

#### L1: Translation Pair Catalog & Download Manager ✅
```
FILES: src/services/pairManager.ts, src/services/pairCatalog.ts
DEPENDS ON: M6.1 (Translation Engine)

CODONS:
├── L1.1 Pair Catalog Service ✅
│   FILE: src/services/pairCatalog.ts
│   ├── Loads pair-catalog.json (static, bundled with app)
│   ├── Each pair: { id, source, target, sizeBytes, region, popularity }
│   ├── Regions: europe, americas, asia, meaf, other
│   └── getCatalog(), getByRegion(), getById()
│
├── L1.2 PairManager Service ✅
│   FILE: src/services/pairManager.ts
│   ├── downloadPair(pairId, cdnUrl) — with encryption, retry, storage checks
│   ├── loadModel(pairId) — heartbeat gate + in-memory decryption
│   ├── deletePair(pairId) — file + hashes + key cleanup
│   ├── deleteAllPairs() — license revocation
│   ├── migrateUnencryptedModels() — legacy file migration
│   └── Offline queue: queueForLater() / processOfflineQueue()
│
└── L1.3 Pair Limits Per Tier ✅
    ├── free: 0 | pro: 0 | translate: 5 | translate_pro: unlimited
```

#### L2: Model Protection — 4-Layer DRM ✅
```
FILES: src/services/model-crypto.ts, src/services/heartbeat.ts
See also: MODEL_PROTECTION_SPEC.md

CODONS:
├── L2.1 Layer 1: Encrypted Model Storage (P0) ✅
│   ├── AES-256-GCM encryption, device-bound key via HKDF-SHA256
│   ├── Key = HKDF(licenseToken + deviceFingerprint + APP_SECRET)
│   ├── WMOD file format: [magic][version][IV][authTag][ciphertext]
│   ├── Decryption in-memory ONLY — never written to disk
│   └── Copied files are garbage on other devices
│
├── L2.2 Layer 2: License Heartbeat (P0) ✅
│   ├── Periodic check: GET /api/v1/license/verify
│   ├── Intervals: free=24h, pro=48h, translate=48h, translate_pro=72h
│   ├── Grace periods: free=24h, pro=7d, translate=14d, translate_pro=30d
│   ├── Status: valid → grace → locked → revoked
│   └── On revocation: deleteAllPairs() + reset to free
│
├── L2.3 Layer 3: Refund Handling (P1 — Server-Side) 🟡
│   ├── RevenueCat/Stripe/Apple webhooks → flag license as revoked
│   ├── Client heartbeat detects revocation → deleteAllPairs()
│   └── Payment failures: 3 retries over 7 days before revoking
│
└── L2.4 Layer 4: Model Watermarking (P3 — Docs Only) 🔲
    └── LSB weight fingerprinting at CDN delivery, deferred to 10K+ users
```

#### L3: Marketplace UI ✅
```
FILES: market.tsx, bundle-select.tsx, marco-polo.tsx, bundle-config.ts,
       PairCard.tsx, StorageBar.tsx

CODONS:
├── L3.1 Market Tab (4th tab) ✅
│   ├── Marco Polo dismissible hero banner with savings math
│   ├── BundleCard components reading from BUNDLE_CONFIG
│   ├── Downloaded Engines section + Discover grid
│   └── Storage bar (used/free space)
│
├── L3.2 Bundle Selection Screen ✅
│   ├── Region quick-select + checkbox pair picker
│   └── Purchase via RevenueCat IAP
│
├── L3.3 Marco Polo Detail Screen ✅
│   ├── Savings math, feature list, storage check
│   └── Purchase CTA → RevenueCat IAP
│
└── L3.4 Bundle Config (App Store Compliant) ✅
    FILE: src/config/bundle-config.ts
    ├── Pure display data ONLY — no URLs, no channel routing
    ├── Bundles: traveler $49 | polyglot $149 | marco_polo $999
    └── ⚠️ NO website URLs — Apple Guidelines 3.1.1 compliance
```

---

### STRAND M14: BRAND ARCHITECTURE & PLATFORM STRATEGY

> **Added:** v2.0.0 (2026-03-18) | **Status:** 📋 Documentation

#### M14.1: Brand Hierarchy
```
Windy (parent identity)
├── Windy Traveler ← MARKETPLACE PLATFORM (expandable)
│   ├── Primary brand for the mobile app
│   ├── Domain: windytraveler.com (primary)
│   └── Sub-brand: Windy Translate (engine marketplace)
│       └── windytranslate.com → 301 redirect
│
├── Windy Word ← VOICE-TO-TEXT (desktop, windyword.com)
├── Windy Chat ← MESSAGING (future)
├── Windy Cloud ← INFRASTRUCTURE (backend)
└── Windy Clone ← DIGITAL LIKENESS (future, windyclone.com)

Naming Rules:
├── "Windy" is always first
├── Second word = WHO the customer IS (not what it does)
└── Users never see: "model", "STT", "ASR", "LLM", "ML"
```

#### M14.2: Domain Strategy
```
├── windytraveler.com — PRIMARY (marketing, Stripe checkout)
├── windytranslate.com — 301 redirect → windytraveler.com/translate
├── windyword.com — voice-to-text product (future)
└── windyclone.com — digital likeness product (future)

⚠️ NO domain URLs appear in the app binary.
```


---

## 🔒 INVARIANTS (Must ALWAYS Be True)

```
1. PRIVACY: No audio data leaves device without explicit user opt-in
2. PRIVACY: No cloud API calls made in "offline" mode
3. PRIVACY: License validation falls back to cached result when offline
4. DATA SAFETY: Audio MUST be written to local storage BEFORE
   transcription callback fires. No data loss on crash.
5. DATA SAFETY: Sync engine NEVER deletes local files after upload
   (until user explicitly requests cleanup)
6. UX: App to recording in under 2 seconds (cold start)
7. UX: Recording state always visible (strobe indicator on overlay,
   Dynamic Island on iOS, notification on Android)
8. UX: No unhandled exceptions. Every error shows user-friendly
   message with suggested action.
9. ENGINE: WindyTune recommendation must match device capabilities.
   Never recommend an engine that exceeds available RAM.
10. ENGINE: Cloud fallback must be transparent. If local engine fails,
    switch to cloud without losing the current recording.
11. SYNC: Background sync NEVER runs on cellular if wifiOnly is true
12. SYNC: Background sync NEVER runs on battery if pluggedInOnly is true
13. STORE: All data export/deletion must work (GDPR/CCPA compliance)
14. STORE: License validation cached locally for 24h
15. UI: Dark theme only (matches website brand identity)
16. UI: All interactive elements have haptic feedback
17. UI: All recording start/stop have audio blip feedback
18. DRM: Models NEVER exist unencrypted on disk after download (L2.1)
19. DRM: Decrypted model data NEVER written to disk — memory only (L2.1)
20. DRM: Heartbeat grace period must expire before models lock (L2.2)
21. DRM: On revocation → delete ALL models + key hashes (L2.2)
22. COMPLIANCE: App binary NEVER contains website purchase URLs (M14)
23. COMPLIANCE: All digital goods purchased via IAP (RevenueCat) (M10)
24. COMPLIANCE: App has NO knowledge of payment channel source (M10)
```

---

## 🧪 TESTING REQUIREMENTS

### Unit Tests
```
├── Audio capture: start, stop, cancel, background resume
├── Quality scorer: known audio samples → expected scores
├── WindyTune: device profiles → expected engine recommendations
├── Transcription routing: local vs cloud decision logic
├── Sync engine: condition checking (Wi-Fi, power, tier)
├── License validation: all tiers, offline fallback, expiry
├── Clone tracker: hour calculation, milestone detection
└── Storage: CRUD operations, pagination, search
├── Model crypto: encrypt/decrypt round-trip, key derivation (L2.1) ✅
├── Heartbeat: grace periods, status transitions, revocation (L2.2) ✅
└── Bundle config: display data validation (L3.4)
```

### Integration Tests
```
├── Record → transcribe → save → display in history
├── Record → transcribe → paste via overlay (Android)
├── Record → transcribe → insert via keyboard (iOS)
├── Record → save → sync → verify on cloud
├── Translate → conversation mode → export
├── Engine download → encrypt → load → transcribe (L1+L2) ✅
├── Engine download → encrypt → load → transcribe (L1+L2) ✅
├── License purchase flow → validation → feature unlock
└── Heartbeat revocation → deleteAllPairs → models gone (L2.2)
```

### End-to-End Tests
```
├── Fresh install → onboarding → first recording → view transcript
├── Background recording → app killed → data survives
├── Airplane mode → record → transcribe locally → save
├── Cloud engine → Wi-Fi drops mid-recording → graceful fallback
├── 30-minute recording → quality score → sync to cloud
├── Cross-device: purchase on phone A → validate on phone B
└── Grace period expiry → models locked → reconnect → unlock (L2.2)
```

---

## 📊 METRICS TO TRACK

### User-Facing
```
├── Total sessions recorded
├── Total hours of audio
├── Average quality score
├── Clone progress percentage
├── Sessions synced / pending
├── Favorite language
└── Most-used engine
```

### System
```
├── Crash rate (target: 0%)
├── Average transcription latency (on-device vs cloud)
├── Engine download completion rate
├── Sync success rate
├── Background sync frequency
├── Memory usage by screen
├── Battery impact during recording
├── Storage usage growth rate
├── Heartbeat success/failure rate (L2.2)
└── Model download + encryption latency (L1+L2.1)
```

---

## ✅ DEFINITION OF DONE

### For a Codon (Atomic Component)
```
1. Code written and type-safe (no 'any' types)
2. Unit tests pass
3. Works on both iOS and Android (or marked platform-specific)
4. Handles errors gracefully (no unhandled exceptions)
5. Accessibility labels on all interactive elements
6. Matches design system (dark theme, correct colors/typography)
7. Performance acceptable (meets latency targets)
```

### For a Strand (Feature Area)
```
1. All codons in the strand are DONE
2. Integration tests pass
3. Works end-to-end in real-world scenario
4. No memory leaks or battery drain
5. Tested on: iPhone 13+, Pixel 6+, Galaxy S23+
6. Reviewed by Grant
```

### For the Organism (Full App)
```
1. All strands are DONE
2. End-to-end tests pass
3. App Store / Play Store submission accepted
4. < 1% crash rate in TestFlight / closed beta
5. Fresh install → first transcript in under 60 seconds
6. Privacy compliance verified (GDPR, CCPA, Apple ATT)
7. Performance benchmarks met on all target devices
8. Grant says "ship it" 🚀
```

---

## 📋 KNOWN ISSUES & GAPS

| ID | Issue | Severity | Notes |
|----|-------|----------|-------|
| 1 | iOS keyboard 30MB memory limit may prevent on-device whisper | Medium | Fallback to cloud or tiny model |
| 2 | iOS doesn't allow floating overlay | High | Mitigated by keyboard + Dynamic Island + widgets |
| 3 | whisper.rn streaming support varies by version | Medium | Pin to stable version, batch fallback |
| 4 | ~~App Store may require IAP instead of web checkout~~ | ~~High~~ | ✅ RESOLVED: RevenueCat IAP is primary. Web sales independent. |
| 5 | Background sync limited on iOS (15-min minimum) | Low | Acceptable for non-real-time uploads |
| 6 | NLLB translation models are large (1-6 GB) | Medium | Cloud default, offline opt-in. Encrypted at rest (L2.1). |
| 7 | Model piracy risk at scale | Medium | 4-layer DRM (L2). Layer 4 watermarking deferred to 10K+. |

---

## 📝 CHANGELOG

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-03-18 | Added Strand L (Marketplace + 4-Layer DRM). Added Strand M14 (Brand Architecture). Updated M10 for IAP compliance. Updated M13. Added invariants 18-24. |
| 1.0.0 | 2026-03-01 | Initial DNA Strand Master Plan — 13 strands, full architecture |

---

## 🏁 CLOSING

This document is the **single source of truth** for the Windy Pro Mobile application. Every class, every function, every data type, every file path, every pixel color, every user interaction is defined here at the codon level.

**The Blue Whale Principle:** Just as every cell in a blue whale contains the complete DNA to build the entire organism, this document contains every instruction needed to build Windy Pro Mobile from scratch. Any model, any developer, any ribosome can read this blueprint and the organism will assemble itself correctly.

**Authors:** Antigravity + Grant Whitmer
**Date:** March 1, 2026
**Status:** Approved for execution

---

*"Even the dumbest ribosome can't screw this up." — Grant*
