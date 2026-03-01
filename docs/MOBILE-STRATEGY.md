# MOBILE-STRATEGY.md — Why Mobile Changes Everything

## Mobile's Unfair Advantages

The desktop app is powerful. But mobile is where Windy Pro becomes unstoppable, for one reason: **your phone is always with you.**

### 1. Always-On Data Capture
- Desktop: You use it at your desk, during scheduled meetings
- Mobile: You use it at restaurants in Tokyo, on trains in Berlin, at markets in Bangkok
- **The most valuable voice data comes from real-world conversations, not desk sessions**

### 2. Camera = OCR Translation + Video Archive
- Point at signs, menus, documents → instant translation
- Front camera captures video of YOU speaking → avatar clone data
- No webcam fumbling — just pull out your phone

### 3. Background Recording
- Start recording a meeting, put phone in pocket
- Hours of clean audio while you do other things
- Desktop can't do this — it needs your attention

### 4. Spontaneous Capture
- "Quick, translate this!" moments happen on the go
- Widget on home screen → one tap → recording
- Shake phone → start capture (accessibility)

### 5. Push Notifications
- "You've hit 8 hours of voice data! Only 2 more to unlock voice clone 🎉"
- "Your last recording had excellent audio quality ⭐"
- Keeps users engaged with the clone pipeline

## Mobile-First Features (Not on Desktop)

| Feature | Why Mobile-Only |
|---------|----------------|
| Camera OCR translate | Native camera integration |
| Background recording | Phone in pocket |
| Home screen widget | One-tap recording |
| Shake to capture | Phone accelerometer |
| Earphone translation | AirPods/earbuds split audio |
| Location-tagged recordings | GPS metadata |
| Share sheet integration | Send transcriptions to any app |
| Notification controls | Pause/resume from notification |
| Watch companion | Apple Watch / WearOS (future) |
| AR translation overlay | Camera viewfinder with text overlay (future) |

## App Store Considerations

### Apple App Store (iOS)
- **Review time:** 1-3 days typically
- **Requirements:**
  - Privacy nutrition labels (must declare microphone, camera, storage access)
  - App Tracking Transparency if any analytics
  - Must use StoreKit for in-app purchases (or use external web payment — risky but legal post-Epic ruling)
  - 15% commission (Small Business Program) or 30% standard
  - Minimum iOS target: iOS 16 recommended
- **TestFlight:** Up to 10,000 beta testers, great for early access
- **Gotchas:**
  - Background audio recording needs proper audio session category
  - Privacy permissions must have clear, specific usage descriptions
  - App must work without account/login for basic features (Apple guideline)

### Google Play Store (Android)
- **Review time:** Hours to 2 days
- **Requirements:**
  - Privacy policy URL required
  - Target API level 34+ (Android 14)
  - Google Billing for in-app purchases (same 15/30% cut as Apple)
  - Background recording needs foreground service notification
- **Testing tracks:** Internal → Closed → Open → Production
- **Gotchas:**
  - Android audio recording permissions changed in Android 13+
  - Need to handle Doze mode (battery optimization kills background tasks)
  - Fragmentation: test on multiple screen sizes and Android versions

### Privacy & Permissions Strategy
Users are giving us access to their **microphone, camera, and files.** Trust is everything.

**Our approach:**
1. **Ask permissions only when needed** — don't ask for camera on first launch if they're just doing voice-to-text
2. **Explain clearly WHY** — "Windy Pro needs your microphone to translate your speech in real-time"
3. **Local-first** — all data stays on device unless user explicitly enables cloud sync
4. **No silent collection** — never record without clear UI indicator (red dot, waveform animation)
5. **Data export** — user can export all their data at any time
6. **Data deletion** — user can delete everything with one button
7. **Privacy policy** — clear, human-readable, published on website

## Launch Strategy

### Phase 1: Core Translation (v0.1 - v0.3)
- Voice-to-text transcription
- Windy Translate (speech-to-speech)
- Basic history and archive
- License validation (web-based purchase)
- TestFlight + internal Google Play testing

### Phase 2: Data Capture Engine (v0.4 - v0.6)
- Media archive with quality scoring
- Camera OCR translation
- Background recording
- Cloud sync to Windy Storage
- Clone readiness meter
- Public App Store / Play Store release

### Phase 3: Clone Pipeline (v0.7+)
- Voice clone generation from accumulated data
- "Use my voice" toggle in Translate
- Avatar clone (research phase)
- Enterprise features

### Phase 4: Platform (v1.0+)
- Watch companion
- AR translation overlay
- Cross-device handoff (start on phone, continue on desktop)
- API for third-party integrations
- Voice clone marketplace? (users sell their voice for specific use cases — ethical considerations needed)

## Revenue Strategy (Mobile-Specific)

**Problem:** App stores take 15-30% of in-app purchases.

**Solution options:**
1. **Web-based subscription** (recommended for v1): User buys on windypro.thewindstorm.uk, enters license key in app. Apple allows this post-Epic ruling but may give friction during review.
2. **Higher mobile pricing**: If using StoreKit/Google Billing, increase prices to offset platform fee.
3. **Hybrid**: Free features in app, paid features via web link. App acts as funnel to website.
4. **RevenueCat**: Cross-platform purchase SDK that handles both stores + Stripe, with analytics. $0 until $2.5k MRR.

**Recommendation for launch:** Start with web-based licensing (same as desktop). If App Store rejects, fall back to RevenueCat.
