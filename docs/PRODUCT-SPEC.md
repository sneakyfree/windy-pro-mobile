# PRODUCT-SPEC.md — Windy Pro Feature Specification

## Overview

Windy Pro is a cross-platform application (Desktop + Mobile) with four core modules:
1. **Windy Ultra** — Real-time speech-to-speech translation
2. **Voice-to-Text** — Transcription engine
3. **Media Archive** — Audio, video, text capture and storage
4. **Clone Pipeline** — Voice clone and avatar clone generation from accumulated data

## Module 1: Windy Ultra

### What It Does
Real-time, bidirectional speech-to-speech translation. User speaks in Language A, Windy Pro outputs audio in Language B. The other person speaks in Language B, Windy Pro outputs in Language A.

### Features
- **100+ languages** supported
- **Bidirectional mode** — both speakers use the same device, app alternates listening direction
- **Conversation mode** — continuous listening with automatic language detection
- **Single-shot mode** — press-to-talk, release to translate
- **Audio output** — translated speech is spoken aloud (TTS)
- **Text overlay** — shows both original and translated text on screen
- **Offline language packs** — download languages for use without internet (Pro tier)
- **Dialect support** — regional variants where available (e.g., Latin American vs Castilian Spanish)

### Mobile-Specific
- **Background mode** — keep translating while screen is off
- **Notification controls** — pause/resume from notification shade
- **Earphone mode** — translation plays in one ear, original in the other
- **Watch companion** — tap Apple Watch/WearOS to trigger translation (future)

### Technical
- Speech recognition: Whisper API or on-device models
- Translation: DeepL, Google Cloud Translation, or custom models
- TTS: Azure Neural TTS, ElevenLabs, or on-device
- Latency target: <2 seconds end-to-end

## Module 2: Voice-to-Text (Transcription)

### What It Does
Best-in-class speech-to-text transcription for any use case: meetings, notes, dictation, interviews, voice memos.

### Features
- **Real-time transcription** — words appear as you speak
- **Speaker diarization** — identifies and labels different speakers
- **Punctuation & formatting** — automatic sentence structure
- **Custom vocabulary** — add names, technical terms, jargon
- **Export formats** — TXT, SRT (subtitles), PDF, DOCX, JSON
- **Timestamps** — every segment tagged with time
- **Edit & correct** — tap any word to correct transcription errors
- **Search** — full-text search across all transcriptions

### Mobile-Specific
- **Quick-start widget** — home screen widget, one tap to start recording
- **Background recording** — record meetings while using other apps
- **Share sheet** — share transcriptions to any app
- **Audio bookmark** — tap to mark important moments during recording

### Technical
- On-device: Whisper.cpp or platform-native (Apple Speech, Android SpeechRecognizer)
- Cloud: OpenAI Whisper API for highest accuracy
- Hybrid: start on-device, upload for cloud processing if user opts in

## Module 3: Media Archive

### What It Does
Captures, organizes, and stores all audio recordings, video clips, and text transcriptions. This is the data engine that feeds the clone pipeline.

### Features
- **Auto-archive** — every Translate and Voice-to-Text session automatically saved
- **Manual recording** — dedicated audio/video recorder for intentional capture
- **Organization** — folders, tags, favorites, date sorting
- **Storage options:**
  - Local device storage (default, privacy-first)
  - WindyCloud Storage (5-node distributed cluster, encrypted)
  - Custom path (external drive, NAS, etc. — desktop only)
- **Storage dashboard** — visual breakdown of data by type, size, date
- **Sync** — optional bidirectional sync between local and cloud
- **Data quality indicators** — shows audio quality score (clean speech vs background noise)
- **Clone readiness meter** — "4.2 hours of usable voice data (42% to voice clone threshold)"

### Mobile-Specific
- **Video recording** — front and/or rear camera with simultaneous audio capture
- **Photo OCR** — take a photo of text, extract and archive the text content
- **Quick capture** — shake device or use hardware button to start recording
- **Auto-upload** — optionally sync to WindyCloud when on Wi-Fi
- **Storage management** — clean up low-quality recordings to save space

### Data Types Stored
| Type | Format | Use |
|------|--------|-----|
| Audio | WAV, MP3, FLAC, OGG | Voice clone training, transcription archive |
| Video | MP4, WebM | Avatar clone training, visual archive |
| Text | JSON, TXT, SRT | Training data, searchable archive |
| Metadata | JSON | Speaker labels, timestamps, quality scores, language |

### Technical
- Local storage: SQLite database + file system
- Cloud storage: Windy Storage API (MinIO-based, S3-compatible)
  - 5-node cluster: OC5 (786GB), OC2 (395GB), OC4 (414GB), OC3 (168GB), VPS (68GB)
  - Total: 1,831 GB distributed storage
  - Erasure coding for redundancy
- Encryption: AES-256 at rest, TLS in transit

## Module 4: Clone Pipeline

### Voice Clone
- **Threshold:** ~10 hours of clean speech audio
- **Process:** User opts in → data sent to training pipeline → model generated → user can use their voice for TTS
- **Use cases:**
  - Translations spoken in YOUR voice instead of a generic TTS
  - Voice messages generated from text in your voice
  - Voiceover for videos/presentations
  - Legacy preservation

### Avatar Clone (Future)
- **Threshold:** ~5 hours of video from multiple angles
- **Process:** Video data → face/gesture model → animated avatar
- **Use cases:**
  - Video calls with real-time translation using your avatar
  - Content creation in any language with your face
  - Digital twin for meetings you can't attend

### Progress Dashboard
- Hours of audio collected (with quality breakdown)
- Hours of video collected
- Words of text transcribed
- Estimated time to voice clone readiness
- Estimated time to avatar clone readiness
- Data quality recommendations ("Try recording in a quieter environment")

## Feature Tier Matrix

| Feature | Free | Pro ($49) | Translate ($79/$7.99mo) | Windy Max ($149) |
|---------|------|-----------|------------------------|---------------------|
| Voice-to-text | 30 min/day | Unlimited | Unlimited | Unlimited |
| Windy Ultra | — | — | All languages | All languages |
| Offline packs | — | — | — | ✅ |
| Local archive | — | ✅ | ✅ | ✅ |
| Cloud storage | — | — | — | 50 GB included |
| History/search | 7 days | Unlimited | Unlimited | Unlimited |
| Export formats | TXT only | All | All | All |
| Clone pipeline | — | Audio only | Audio only | Audio + Video |
| Priority processing | — | — | — | ✅ |

## Desktop vs Mobile Feature Parity

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Voice-to-text | ✅ | ✅ |
| Windy Ultra | ✅ | ✅ |
| Video recording | Webcam | Front + rear camera |
| Background recording | ✅ (always foreground) | ✅ (background service) |
| OCR/Camera translate | — | ✅ (native camera) |
| Local storage | ✅ | ✅ |
| Cloud sync | ✅ | ✅ |
| Offline packs | ✅ | ✅ |
| Quick capture | Keyboard shortcut | Widget, shake, button |
| Clone pipeline | ✅ | ✅ |

Mobile has advantages for data capture (always with you, camera, background recording). Desktop has advantages for long sessions (meetings, editing, export).

## UX Philosophy

1. **Zero-friction capture** — starting a recording should take <2 seconds from any state
2. **Invisible archiving** — data saves automatically, user never thinks about it
3. **Progressive disclosure** — new users see translate + transcribe. Clone features reveal as data accumulates.
4. **Privacy-first** — local by default. Cloud is opt-in. User owns their data completely.
5. **Delight at milestones** — celebrate when users hit data thresholds ("🎉 You just passed 5 hours of voice data!")
