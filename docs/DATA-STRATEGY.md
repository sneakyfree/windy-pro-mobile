# DATA-STRATEGY.md — The Clone Data Pipeline

## The Core Insight

Every time a user translates a conversation or transcribes a meeting with Windy Pro, they generate exactly the kind of clean, labeled audio data that voice cloning models need. **The utility IS the data collection.** Users don't have to do anything extra.

## Data Types & Requirements

### Voice Clone Data

| Metric | Minimum | Ideal | Notes |
|--------|---------|-------|-------|
| Total audio | 10 hours | 30+ hours | More = better quality clone |
| Audio quality | 16kHz 16-bit | 44.1kHz 24-bit | Higher sample rate = more detail |
| Background noise | <-30dB SNR | <-40dB SNR | Clean speech is critical |
| Speaking styles | Conversational | Mixed (read, converse, emotional) | Variety improves naturalness |
| Languages | 1 (primary) | Multiple | Multilingual clones possible |

**What counts as "usable" audio:**
- Clear speech with minimal background noise
- Single speaker isolated (diarization helps)
- Minimum 10-second continuous segments
- Not whispered, not shouting (normal speech patterns)

**What DOESN'T count:**
- Music or TV in background
- Multiple overlapping speakers (unless diarized)
- Very short utterances (<3 seconds)
- Extremely noisy environments

### Avatar Clone Data (Future)

| Metric | Minimum | Ideal | Notes |
|--------|---------|-------|-------|
| Total video | 5 hours | 20+ hours | Face must be visible |
| Resolution | 720p | 1080p+ | Higher = more facial detail |
| Angles | Front-facing | Multiple angles | Helps 3D model generation |
| Lighting | Consistent | Varied | Trains model for different conditions |
| Expressions | Neutral | Range of emotions | More natural avatar |

### Text Data

| Metric | Purpose |
|--------|---------|
| Transcriptions | Vocabulary, speaking patterns, word frequency |
| Translations | Multilingual capability mapping |
| Custom vocabulary | Technical terms, names, jargon |

## Quality Scoring System

Every recording gets a quality score (0-100):

| Score | Label | Criteria |
|-------|-------|----------|
| 90-100 | ⭐ Excellent | Clean speech, low noise, good mic, single speaker |
| 70-89 | ✅ Good | Minor background noise, usable for training |
| 50-69 | ⚠️ Fair | Noticeable noise, still partially usable |
| 0-49 | ❌ Poor | Too noisy, overlapping speakers, unusable for clone |

**Scoring algorithm considers:**
- Signal-to-noise ratio (SNR)
- Speech activity ratio (how much of the recording is actual speech)
- Clipping detection (audio too loud/distorted)
- Sample rate and bit depth
- Speaker count (diarization result)

**User-facing:**
- After each recording: "Audio quality: ⭐ Excellent — great data for your voice clone!"
- Low quality: "Tip: Try recording in a quieter space for better clone data 🎤"

## Clone Readiness Meter

A persistent UI element showing progress toward clone thresholds:

```
🎤 Voice Clone Progress
████████████░░░░░░░░ 62%
6.2 hours of usable audio (3.8 hours to go)

📹 Avatar Clone Progress  
███░░░░░░░░░░░░░░░░░ 14%
0.7 hours of quality video (4.3 hours to go)
```

**Milestone notifications:**
- 25%: "You're a quarter of the way to your voice clone! Keep using Windy Translate 🎯"
- 50%: "Halfway there! At your current pace, you'll be ready in ~3 weeks"
- 75%: "Almost there! Just a few more hours of natural conversation"
- 90%: "So close! One or two more sessions should do it"
- 100%: "🎉 You have enough data! Tap here to start generating your voice clone"

## Storage Architecture

### Local Storage (Default)
```
~/WindyPro/
├── audio/
│   ├── 2026-03-01_14-30-22_translate_en-es.wav
│   ├── 2026-03-01_14-30-22_translate_en-es.json  (metadata)
│   └── ...
├── video/
│   ├── 2026-03-01_15-00-00_record.mp4
│   ├── 2026-03-01_15-00-00_record.json
│   └── ...
├── text/
│   ├── 2026-03-01_14-30-22_transcript.txt
│   └── ...
├── models/
│   └── voice-clone-v1/  (generated clone model)
└── windy.db  (SQLite index)
```

On mobile, this maps to the app's private storage directory.

### Cloud Storage (Opt-in)
Same structure mirrored to user's MinIO bucket:
```
s3://windy-users/{userId}/audio/...
s3://windy-users/{userId}/video/...
s3://windy-users/{userId}/text/...
s3://windy-users/{userId}/models/...
```

### Sync Strategy
1. **Local-first:** All data saved locally immediately
2. **Wi-Fi sync:** When on Wi-Fi + plugged in (configurable), upload to cloud
3. **Selective sync:** User can choose what syncs (e.g., "sync audio but not video")
4. **Conflict resolution:** Last-write-wins with version history
5. **Bandwidth management:** Compress audio to FLAC before upload, video to H.265

### Metadata Schema (per recording)
```json
{
  "id": "uuid-v4",
  "type": "audio|video|text",
  "created": "2026-03-01T14:30:22-05:00",
  "duration_seconds": 342,
  "file_size_bytes": 5242880,
  "sample_rate": 44100,
  "channels": 1,
  "format": "wav",
  "quality_score": 87,
  "snr_db": -35.2,
  "speech_ratio": 0.73,
  "source": "translate|transcribe|manual_record",
  "languages": ["en", "es"],
  "speakers": 1,
  "location": { "lat": 43.37, "lon": -73.49 },
  "device": "iPhone 15 Pro",
  "synced": false,
  "clone_usable": true,
  "tags": ["meeting", "business"],
  "transcript_id": "linked-transcript-uuid"
}
```

## Privacy & Ethics

### User Control
- **Opt-in everything:** Cloud sync, clone generation, data sharing — all require explicit consent
- **Local by default:** Nothing leaves the device unless user says so
- **Delete = delete:** When user deletes, it's gone from device AND cloud (no ghost copies)
- **Export:** User can export all data in standard formats at any time
- **Transparency:** User can see exactly what data exists, where it's stored, and what it's used for

### Clone Ethics
- Voice clones can ONLY be used by the person who generated them
- No selling/sharing clone models to third parties without explicit consent
- Clone watermarking: generated audio includes imperceptible watermark identifying it as AI-generated
- User must acknowledge terms before generating clone
- Clone model is encrypted and tied to user's license key

### Data Retention
- Local data: persists until user deletes
- Cloud data: persists until user deletes or account closes
- Account closure: 30-day grace period, then permanent deletion
- Clone models: deleted with account unless user exports

## Technical Implementation Notes

### Audio Recording Best Practices (Mobile)
- Use uncompressed WAV during recording for maximum quality
- Compress to FLAC for storage/upload (lossless, ~50% size reduction)
- Set sample rate to device maximum (usually 44.1kHz on phones)
- Request mono channel (single speaker) — stereo wastes space for speech
- Use noise gate to avoid recording silence
- Implement voice activity detection (VAD) to tag speech segments

### Quality Scoring Implementation
```
1. After recording stops, run analysis:
   - FFT for noise floor estimation
   - RMS energy for speech detection
   - Zero-crossing rate for voice/unvoiced classification
   - WebRTC VAD or Silero VAD for speech boundaries
2. Compute SNR from speech segments vs silence segments
3. Check for clipping (samples at ±1.0)
4. Score = weighted sum of SNR, speech ratio, sample rate, no-clipping
5. Store score in metadata
```

### Diarization (Speaker Separation)
- Essential for multi-speaker recordings (translate mode has 2 speakers)
- On-device: Use pyannote.audio (via ONNX runtime) or platform-native
- Cloud: More accurate but requires upload
- Tag each segment with speaker ID → only YOUR speech counts toward clone data
