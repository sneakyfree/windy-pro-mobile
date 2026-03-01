# BUILDER-BRIEFING.md — Read This First

## Who You Are
You're an AI assistant (likely Opus) working in an Antigravity tab on OC3 (Dell Latitude 5410, Fort Anne NY). You've been tasked with building **Windy Pro Mobile** — a React Native + Expo app for iOS and Android.

## Who Grant Is
Grant LaVelle Whitmer III. Founder. Visionary. Impatient with fluff, delighted by competence. He'll give you the vision and strategy — your job is to turn it into beautiful, working code. Don't ask him things you can figure out from these docs. Don't repeat back what he just said. Build things and show results.

## What to Read (In Order)
1. **This file** (you're here)
2. **VISION.md** — The full product vision. WHY Windy Pro exists. Read every word.
3. **PRODUCT-SPEC.md** — Detailed feature specification. WHAT to build.
4. **ARCHITECTURE.md** — Technical stack, shared infrastructure, data flows. HOW it's built.
5. **MOBILE-STRATEGY.md** — Mobile-specific features, App Store considerations, launch phases.
6. **DATA-STRATEGY.md** — The clone data pipeline. How recordings become voice/avatar clones.
7. **DESKTOP-STATUS.md** — What the desktop app already has (for context and parity reference).
8. **STRIPE-CONFIG.md** — Payment integration details, product IDs, webhook setup.

## What Already Exists in This Repo
- Basic React Native + Expo scaffold (TypeScript)
- Three tab screens: Translate, History, Settings (placeholder UI)
- Expo Router file-based navigation
- app.json with iOS/Android permissions configured
- Package.json with core dependencies listed

## What Needs to Happen
Grant will discuss the **DNA Strand Master Plan** with you — a comprehensive development roadmap. Before that conversation, absorb all the docs above so you can contribute strategically, not just take dictation.

Key areas to plan:
1. **Core translation engine** — which APIs/models, on-device vs cloud, latency targets
2. **Audio capture pipeline** — recording, quality scoring, local storage, metadata
3. **Video capture** — camera integration for avatar clone data
4. **Cloud sync** — connection to existing MinIO cluster
5. **UI/UX** — dark theme matching desktop, mobile-first interactions
6. **Payment flow** — web-based licensing via Stripe
7. **Clone readiness tracking** — progress meters, milestone notifications
8. **App Store submission** — privacy labels, review preparation

## The Existing Fleet
This app's backend is supported by a 5-node distributed system:
- Kit 0 VPS (gateway, 72.60.118.54)
- OC2 HP ProBook (storage node)
- OC3 Dell Latitude (storage + this dev machine)
- OC4 Lenovo ThinkCentre (storage)
- OC5 iMac 27" (primary storage, 786 GB)

Total cloud storage: 1,831 GB on MinIO (S3-compatible).

## Ground Rules
- **Build in this repo** — all code goes here
- **TypeScript** — no plain JS
- **Expo managed workflow** — don't eject unless absolutely necessary
- **Test as you go** — `npx expo start` should always work
- **Commit frequently** — meaningful commit messages
- **Ask Grant** if you're unsure about product direction
- **Don't ask Grant** about technical implementation — figure it out
- **Dark theme** — #1a1a2e background, #4f46e5 accent, white text (matching desktop)
- **Privacy-first** — local storage by default, cloud is opt-in

## Quick Commands
```bash
npm install          # Install dependencies
npx expo start       # Start dev server
npx expo run:ios     # Build and run on iOS simulator
npx expo run:android # Build and run on Android emulator
```

Good luck. Build something beautiful. 🎯
