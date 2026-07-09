/**
 * 🛰️ Intel Service — Windy Admin telemetry client (INTEL-CONTRACT-V2).
 *
 * Mission 12 P2 client hooks. Emits the §1.1–1.8 event families to the
 * admin ingest at admin.windyword.ai through the offline-safe /v1/journal
 * endpoint (§2, idempotent store-and-forward).
 *
 * HARD LINES (contract §0, do not weaken):
 *  - Fire-and-forget: every path is async + swallowed; a dead ingest can
 *    NEVER affect the product. No emit ever throws to a caller.
 *  - Inert unless configured: no-op when
 *    EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL / EXPO_PUBLIC_WINDY_ADMIN_INGEST_TOKEN
 *    are unset at bundle time (they're inlined by Expo's babel transform).
 *  - NO content, NO PII, ever. Metadata is counts / durations / codes /
 *    enums / opaque ids. Events are validated against a deny-list BEFORE
 *    buffering (the ingest 422s the whole batch otherwise).
 *
 * The token is a low-trust, rotatable, mobile-only ingest token
 * (contract §5) — it authorizes nothing but event ingest and is set as an
 * EAS env var at build time. Never commit its value.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ─── Config (inlined at bundle time; read lazily so tests can vary) ──

function ingestUrl(): string | null {
    const v = process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL;
    return v ? v.replace(/\/+$/, '') : null;
}
function ingestToken(): string | null {
    return process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_TOKEN || null;
}
export function intelEnabled(): boolean {
    return !!(ingestUrl() && ingestToken());
}

// ─── Constants ───────────────────────────────────────────────────────

const PLATFORM_NAME = 'windy-word';
const SERVICE_NAME = Platform.OS === 'android' ? 'mobile-android' : 'mobile-ios';

export const APP_STORE_URL = 'https://apps.apple.com/app/windy-word/id6759985867';

const K_INSTALL_ID = 'intel-install-id';
const K_JOURNAL_ID = 'intel-journal-id';
const K_SEQ = 'intel-seq';
const K_QUEUE = 'intel-queue';
const K_INFLIGHT = 'intel-inflight';
const K_PENDING_CRASH = 'intel-pending-crash';
const K_LAST_RUN_VERSION = 'intel-last-run-version';
const K_FIRST_RUN_STEPS = 'intel-first-run-steps';

const MAX_BATCH = 500;          // contract §2 — ≤500 envelopes per batch
const MAX_QUEUE = 1000;         // cap: drop oldest + client.error journal_overflow
const MAX_AGE_MS = 30 * 24 * 3600_000; // 30 days
const FLUSH_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;

// Metadata guard (contract §0.3): deny content-ish key tokens…
const DENY_TOKENS = new Set([
    'content', 'text', 'body', 'message', 'prompt', 'transcript',
    'subject', 'html', 'completion', 'reply',
]);
// …with the contract's explicit allowlist of full keys (§0.3), plus
// `message_type`, which §1.8 documents as an exact marketing.* key.
const ALLOW_KEYS = new Set(['message_count', 'message_id', 'exchange_count', 'message_type']);

// ─── Types ───────────────────────────────────────────────────────────

type MetaValue = string | number | boolean | null;

export interface IntelEnvelope {
    ts: string;
    platform: string;
    service: string;
    event_type: string;
    actor_type: 'human' | 'agent' | 'system';
    actor_id: string | null;
    duration_ms?: number;
    session_id?: string;
    metadata: Record<string, MetaValue>;
}

interface InflightBatch {
    seq: number;
    events: IntelEnvelope[];
}

export type FirstRunStep =
    | 'launched' | 'permissions' | 'engine_download' | 'engine_ready'
    | 'account_linked' | 'first_dictation' | 'done';

export type WallKind =
    | 'dictation_minutes' | 'cloud_storage' | 'translate_chars' | 'agent_quota'
    | 'search_budget' | 'export_format' | 'device_limit' | 'seats' | 'feature_locked';

// ─── Small helpers (all failure-proof) ───────────────────────────────

function uuid(): string {
    try {
        const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
        if (c?.randomUUID) return c.randomUUID();
    } catch { /* fall through */ }
    try {
        const ExpoCrypto = require('expo-crypto');
        return ExpoCrypto.randomUUID();
    } catch { /* fall through */ }
    // Last-resort v4 (Math.random) — still an opaque non-PII id.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
        const r = (Math.random() * 16) | 0;
        return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export function appVersion(): string {
    try {
        const Constants = require('expo-constants').default;
        return Constants?.expoConfig?.version || '0.0.0';
    } catch { return '0.0.0'; }
}

function osVersion(): string {
    try {
        const Device = require('expo-device');
        if (Device?.osVersion) return String(Device.osVersion);
    } catch { /* fall through */ }
    try { return String(Platform.Version); } catch { return 'unknown'; }
}

function deviceLocale(): string {
    try {
        const loc = Intl.DateTimeFormat().resolvedOptions().locale;
        if (loc && typeof loc === 'string') return loc;
    } catch { /* fall through */ }
    return 'en-US';
}

/** Numeric-first semver compare: 1 if a > b, -1 if a < b, 0 equal. */
export function compareVersions(a: string, b: string): number {
    const pa = String(a).split('.').map((p) => parseInt(p, 10) || 0);
    const pb = String(b).split('.').map((p) => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0; const y = pb[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

/** Split a key into lowercase tokens across snake_case and camelCase. */
function keyTokens(key: string): string[] {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

/**
 * Validate an event before buffering (contract §2.3: clients must validate
 * before buffering — a bad event 422s the whole batch). Returns a cleaned
 * metadata object, or null when the event must be dropped.
 */
export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, MetaValue> | null {
    const out: Record<string, MetaValue> = {};
    for (const [key, raw] of Object.entries(metadata)) {
        if (raw === undefined) continue;
        if (!/^[a-zA-Z0-9_]{1,64}$/.test(key)) return null;
        if (!ALLOW_KEYS.has(key)) {
            for (const tok of keyTokens(key)) {
                if (DENY_TOKENS.has(tok)) return null;
            }
        }
        if (raw === null || typeof raw === 'boolean') { out[key] = raw as MetaValue; continue; }
        if (typeof raw === 'number') {
            if (!Number.isFinite(raw)) return null;
            out[key] = raw; continue;
        }
        if (typeof raw === 'string') {
            // No free-text channels: short strings only, and nothing that
            // smells like an email/URL-with-query (PII hard line).
            if (raw.length > 200) return null;
            if (raw.includes('@') || /https?:\/\/\S*\?/.test(raw)) return null;
            out[key] = raw; continue;
        }
        return null; // nested objects/arrays are off-contract
    }
    return out;
}

function isValidEventType(type: string): boolean {
    return /^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(type);
}

// ─── Service ─────────────────────────────────────────────────────────

class IntelService {
    private installId: string | null = null;
    private journalId: string | null = null;
    private seq = 0;
    private queue: IntelEnvelope[] = [];
    private inflight: InflightBatch | null = null;

    private sessionId: string | null = null;
    private sessionStartedAt: number | null = null;
    private firstLaunch = false;
    private overflowReported = false;

    private loaded: Promise<void> | null = null;
    private initialized = false;
    private flushing = false;
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private lastAppState: string = 'active';

    // ── Lifecycle ────────────────────────────────────────────────────

    /**
     * Boot-time init. Called once from the root layout's deferred-services
     * block. Safe to call when telemetry is unconfigured (hard no-op).
     */
    async initialize(): Promise<void> {
        if (!intelEnabled() || this.initialized) return;
        this.initialized = true;
        try {
            await this.ensureLoaded();

            // update.applied — stored last-run version vs current (§1.6).
            try {
                const current = appVersion();
                const lastRun = await AsyncStorage.getItem(K_LAST_RUN_VERSION);
                if (lastRun && lastRun !== current) {
                    this.emit('update.applied', {
                        from_version: lastRun, to_version: current, os: Platform.OS,
                    });
                }
                if (lastRun !== current) await AsyncStorage.setItem(K_LAST_RUN_VERSION, current);
            } catch { /* swallowed */ }

            // Pending crash from a previous run (§1.4) — emit, then clear.
            try {
                const raw = await AsyncStorage.getItem(K_PENDING_CRASH);
                if (raw) {
                    const crash = JSON.parse(raw);
                    if (crash && typeof crash.signature === 'string') {
                        this.emit('client.crash', {
                            signature: crash.signature,
                            app_version: crash.app_version || appVersion(),
                            os: crash.os || Platform.OS,
                            os_version: crash.os_version || osVersion(),
                            install_id: this.installId,
                            fatal: crash.fatal !== false,
                        });
                    }
                    await AsyncStorage.removeItem(K_PENDING_CRASH);
                }
            } catch { /* swallowed */ }

            this.installGlobalErrorHandler();
            this.startSession();

            if (this.flushTimer) clearInterval(this.flushTimer);
            this.flushTimer = setInterval(() => { void this.flush(); }, FLUSH_INTERVAL_MS);

            // Client config (§3) — launch fetch, TTL-aware afterwards.
            try {
                const { intelConfig } = require('./intelConfig');
                void intelConfig.refresh();
            } catch { /* swallowed */ }

            void this.flush({ checkConnectivity: true });
        } catch { /* never crash the app */ }
    }

    /**
     * AppState seam (root layout). Handles session.start / session.end and
     * the foreground/background flush + config heartbeat.
     */
    handleAppStateChange(nextState: string): void {
        if (!intelEnabled()) return;
        try {
            const prev = this.lastAppState;
            this.lastAppState = nextState;
            if (nextState === 'active' && prev !== 'active') {
                this.startSession();
                try {
                    const { intelConfig } = require('./intelConfig');
                    void intelConfig.refresh(); // respects config_ttl_seconds internally
                } catch { /* swallowed */ }
                void this.flush({ checkConnectivity: true });
            } else if (nextState === 'background' && prev !== 'background') {
                this.endSession('background');
                void this.flush(); // best-effort before suspension
            }
        } catch { /* swallowed */ }
    }

    private startSession(): void {
        if (this.sessionId) return; // already in a foreground session
        this.sessionId = uuid();
        this.sessionStartedAt = Date.now();
        const meta: Record<string, unknown> = {
            app_version: appVersion(),
            os: Platform.OS,
            os_version: osVersion(),
            locale: deviceLocale(),
            install_id: this.installId,
        };
        if (this.firstLaunch) { meta.first_launch = true; this.firstLaunch = false; }
        this.emit('session.start', meta);
    }

    private endSession(reason: 'background' | 'quit' | 'timeout' | 'crash'): void {
        if (!this.sessionId) return;
        const durationMs = this.sessionStartedAt ? Date.now() - this.sessionStartedAt : 0;
        this.emit('session.end', { install_id: this.installId, reason }, { durationMs });
        this.sessionId = null;
        this.sessionStartedAt = null;
    }

    // ── Storage bootstrap ────────────────────────────────────────────

    private ensureLoaded(): Promise<void> {
        if (!this.loaded) this.loaded = this.loadState();
        return this.loaded;
    }

    private async loadState(): Promise<void> {
        try {
            const [installId, journalId, seqRaw, queueRaw, inflightRaw] = await Promise.all([
                AsyncStorage.getItem(K_INSTALL_ID),
                AsyncStorage.getItem(K_JOURNAL_ID),
                AsyncStorage.getItem(K_SEQ),
                AsyncStorage.getItem(K_QUEUE),
                AsyncStorage.getItem(K_INFLIGHT),
            ]);
            if (installId) {
                this.installId = installId;
            } else {
                this.installId = uuid();
                this.firstLaunch = true;
                await AsyncStorage.setItem(K_INSTALL_ID, this.installId).catch(() => {});
            }
            if (journalId) {
                this.journalId = journalId;
            } else {
                this.journalId = uuid();
                await AsyncStorage.setItem(K_JOURNAL_ID, this.journalId).catch(() => {});
            }
            this.seq = seqRaw ? (parseInt(seqRaw, 10) || 0) : 0;
            if (queueRaw) {
                try {
                    const q = JSON.parse(queueRaw);
                    if (Array.isArray(q)) this.queue = q;
                } catch { this.queue = []; }
            }
            if (inflightRaw) {
                try {
                    const b = JSON.parse(inflightRaw);
                    if (b && typeof b.seq === 'number' && Array.isArray(b.events)) this.inflight = b;
                } catch { this.inflight = null; }
            }
            this.pruneOldEvents();
        } catch {
            // Storage unavailable — run with in-memory ids for this session.
            if (!this.installId) this.installId = uuid();
            if (!this.journalId) this.journalId = uuid();
        }
    }

    private pruneOldEvents(): void {
        const cutoff = Date.now() - MAX_AGE_MS;
        const before = this.queue.length;
        this.queue = this.queue.filter((e) => {
            const t = Date.parse(e.ts);
            return !Number.isFinite(t) || t >= cutoff;
        });
        if (this.queue.length < before) this.reportOverflow();
    }

    private persistQueue(): void {
        AsyncStorage.setItem(K_QUEUE, JSON.stringify(this.queue)).catch(() => {});
    }
    private persistInflight(): void {
        if (this.inflight) {
            AsyncStorage.setItem(K_INFLIGHT, JSON.stringify(this.inflight)).catch(() => {});
        } else {
            AsyncStorage.removeItem(K_INFLIGHT).catch(() => {});
        }
    }
    private persistSeq(): void {
        AsyncStorage.setItem(K_SEQ, String(this.seq)).catch(() => {});
    }

    // ── Emit (the one entry point every hook uses) ───────────────────

    /**
     * Queue one event. Validates shape per the contract, builds the base
     * envelope, and buffers it in the journal. NEVER throws; silently
     * drops off-contract events. No-op when unconfigured.
     */
    emit(
        eventType: string,
        metadata: Record<string, unknown> = {},
        opts: { durationMs?: number } = {},
    ): void {
        if (!intelEnabled()) return;
        try {
            if (!isValidEventType(eventType)) return;
            const cleaned = sanitizeMetadata(metadata);
            if (cleaned === null) {
                if (__DEV__) console.warn(`[Intel] dropped off-contract event: ${eventType}`);
                return;
            }
            const envelope: IntelEnvelope = {
                ts: new Date().toISOString(),
                platform: PLATFORM_NAME,
                service: SERVICE_NAME,
                event_type: eventType,
                ...this.actor(),
                metadata: cleaned,
            };
            if (typeof opts.durationMs === 'number' && Number.isFinite(opts.durationMs)) {
                envelope.duration_ms = Math.max(0, Math.round(opts.durationMs));
            }
            if (this.sessionId) envelope.session_id = this.sessionId;

            void this.ensureLoaded().then(() => {
                this.enqueue(envelope);
            }).catch(() => {});
        } catch { /* fire-and-forget */ }
    }

    private actor(): { actor_type: 'human' | 'system'; actor_id: string | null } {
        try {
            const { identityApi } = require('./identityApi');
            const id = identityApi.isAuthenticated() ? identityApi.getWindyIdentityId() : null;
            if (id) return { actor_type: 'human', actor_id: id };
        } catch { /* anonymous */ }
        return { actor_type: 'system', actor_id: null };
    }

    private enqueue(envelope: IntelEnvelope): void {
        const inflightCount = this.inflight ? this.inflight.events.length : 0;
        while (this.queue.length + inflightCount >= MAX_QUEUE && this.queue.length > 0) {
            this.queue.shift();
            this.reportOverflow();
        }
        this.queue.push(envelope);
        this.persistQueue();
    }

    private reportOverflow(): void {
        if (this.overflowReported) return; // once per session — no feedback loops
        this.overflowReported = true;
        const overflowEvent: IntelEnvelope = {
            ts: new Date().toISOString(),
            platform: PLATFORM_NAME,
            service: SERVICE_NAME,
            event_type: 'client.error',
            actor_type: 'system',
            actor_id: null,
            metadata: {
                code: 'journal_overflow',
                surface: 'intel',
                app_version: appVersion(),
                os: Platform.OS,
            },
        };
        if (this.sessionId) overflowEvent.session_id = this.sessionId;
        this.queue.push(overflowEvent);
    }

    // ── Journal flush (contract §2) ──────────────────────────────────

    /**
     * Upload buffered events as journal batches. Idempotent server-side on
     * (journal_id, batch_seq); we advance batch_seq only after a 2xx ack
     * and keep the unacked in-flight batch on disk so a retry replays the
     * exact same payload.
     */
    async flush(opts: { checkConnectivity?: boolean } = {}): Promise<void> {
        if (!intelEnabled() || this.flushing) return;
        this.flushing = true;
        try {
            await this.ensureLoaded();
            if (opts.checkConnectivity) {
                try {
                    const NetInfo = require('@react-native-community/netinfo').default;
                    const state = await NetInfo.fetch();
                    if (state && state.isConnected === false) return;
                } catch { /* can't tell — try anyway */ }
            }

            // Up to a handful of batches per flush; stop on any failure.
            for (let i = 0; i < 5; i++) {
                if (!this.inflight) {
                    this.pruneOldEvents();
                    if (this.queue.length === 0) { this.persistQueue(); break; }
                    this.inflight = { seq: this.seq, events: this.queue.slice(0, MAX_BATCH) };
                    this.queue = this.queue.slice(this.inflight.events.length);
                    this.persistQueue();
                    this.persistInflight();
                }
                const batch = this.inflight;
                let res: Response;
                try {
                    res = await fetch(`${ingestUrl()}/v1/journal`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${ingestToken()}`,
                        },
                        body: JSON.stringify({
                            journal_id: this.journalId,
                            batch_seq: batch.seq,
                            events: batch.events,
                        }),
                        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                    });
                } catch { break; } // offline / timeout — keep batch for retry

                if (res.status === 202 || res.status === 200) {
                    // 202 accepted; 200 = duplicate replay (lost ack) — both ack.
                    this.seq = batch.seq + 1;
                    this.inflight = null;
                    this.persistSeq();
                    this.persistInflight();
                    continue;
                }
                if (res.status === 409 || res.status === 422) {
                    // 409 tamper/bug guard or 422 off-contract batch: this
                    // payload will never be accepted — drop it, move on
                    // (gaps in batch_seq are allowed by the contract).
                    this.seq = batch.seq + 1;
                    this.inflight = null;
                    this.persistSeq();
                    this.persistInflight();
                    continue;
                }
                break; // 5xx / auth problems — retry a later flush
            }
        } catch { /* swallowed */ } finally {
            this.flushing = false;
        }
    }

    // ── Crash handler (§1.4) ─────────────────────────────────────────

    private installGlobalErrorHandler(): void {
        try {
            const EU = (globalThis as unknown as {
                ErrorUtils?: {
                    getGlobalHandler?: () => ((e: unknown, isFatal?: boolean) => void) | undefined;
                    setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
                };
            }).ErrorUtils;
            if (!EU?.getGlobalHandler || !EU?.setGlobalHandler) return;
            const previous = EU.getGlobalHandler();
            EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
                try { this.recordCrash(error, isFatal !== false); } catch { /* swallowed */ }
                // ALWAYS hand off to the original handler (red box in dev,
                // native crash path in release).
                if (previous) previous(error, isFatal);
            });
        } catch { /* swallowed */ }
    }

    /**
     * Persist a pending crash record (best-effort — the app may be dying).
     * signature = hex(sha256(top ≤5 frames, paths stripped))[:16]; raw
     * frames and messages are NEVER sent (contract §1.4).
     */
    private recordCrash(error: unknown, fatal: boolean): void {
        const stack = (error as { stack?: string } | null)?.stack || '';
        const frames = crashFrames(stack);
        const material = frames.length > 0
            ? frames.join('|')
            : `no-stack:${(error as { name?: string } | null)?.name || 'Error'}`;
        void (async () => {
            try {
                const signature = await sha256Hex16(material);
                await AsyncStorage.setItem(K_PENDING_CRASH, JSON.stringify({
                    signature,
                    app_version: appVersion(),
                    os: Platform.OS,
                    os_version: osVersion(),
                    fatal,
                    ts: new Date().toISOString(),
                }));
            } catch { /* best-effort */ }
        })();
    }

    // ── Typed hook helpers (used by the instrumented seams) ──────────

    /** feature.usage.dictation (§1.2) — one dictation completed. */
    emitDictation(args: {
        seconds: number;
        language: string;
        engineId?: string;       // whisper/cloud engine id from ENGINE_REGISTRY
        osDictation?: boolean;   // OS-native speech recognition path
        wordCount?: number;
    }): void {
        if (!intelEnabled()) return;
        try {
            const meta: Record<string, unknown> = {
                seconds: Math.max(0, Math.round(args.seconds)),
                language: args.language || 'en',
                engine_tier: args.osDictation ? 'light' : engineTier(args.engineId),
                on_device: args.osDictation ? true : engineOnDevice(args.engineId),
            };
            if (typeof args.wordCount === 'number') {
                meta.word_count = Math.max(0, Math.round(args.wordCount));
            }
            this.emit('feature.usage.dictation', meta);
            void this.markFirstRunStep('first_dictation');
        } catch { /* swallowed */ }
    }

    /** client.error (§1.3) — stable slug only, never message text. */
    emitError(code: string, surface: string, extra: { recoverable?: boolean; http_status?: number } = {}): void {
        if (!intelEnabled()) return;
        try {
            const meta: Record<string, unknown> = {
                code, surface, app_version: appVersion(), os: Platform.OS,
            };
            if (typeof extra.recoverable === 'boolean') meta.recoverable = extra.recoverable;
            if (typeof extra.http_status === 'number') meta.http_status = extra.http_status;
            this.emit('client.error', meta);
        } catch { /* swallowed */ }
    }

    /** wall.hit (§1.5) — commercial signal when a limit/paywall is hit. */
    emitWallHit(wall: WallKind, extra: { surface?: string; limit?: number; used?: number } = {}): void {
        if (!intelEnabled()) return;
        try {
            let tier = 'free';
            try {
                const { useSettingsStore } = require('@/stores/useSettingsStore');
                tier = useSettingsStore.getState().licenseTier || 'free';
            } catch { /* default */ }
            const meta: Record<string, unknown> = { wall, tier, app_version: appVersion() };
            if (extra.surface) meta.surface = extra.surface;
            if (typeof extra.limit === 'number') meta.limit = extra.limit;
            if (typeof extra.used === 'number') meta.used = extra.used;
            this.emit('wall.hit', meta);
        } catch { /* swallowed */ }
    }

    /** install.first_run.step (§1.7) — each step emitted once per install. */
    async markFirstRunStep(step: FirstRunStep, ok?: boolean): Promise<void> {
        if (!intelEnabled()) return;
        try {
            await this.ensureLoaded();
            const raw = await AsyncStorage.getItem(K_FIRST_RUN_STEPS);
            const done: string[] = raw ? JSON.parse(raw) : [];
            if (done.includes(step)) return;
            done.push(step);
            await AsyncStorage.setItem(K_FIRST_RUN_STEPS, JSON.stringify(done)).catch(() => {});
            const meta: Record<string, unknown> = {
                install_id: this.installId,
                step,
                os: Platform.OS,
                app_version: appVersion(),
            };
            if (typeof ok === 'boolean') meta.ok = ok;
            this.emit('install.first_run.step', meta);
        } catch { /* swallowed */ }
    }

    // ── Introspection for intelConfig + tests ────────────────────────

    getInstallId(): string | null { return this.installId; }
    getSessionId(): string | null { return this.sessionId; }
}

// ─── Crash signature helpers ─────────────────────────────────────────

/** Top ≤5 stack frames with paths/locations stripped (names only). */
export function crashFrames(stack: string): string[] {
    return String(stack)
        .split('\n')
        .slice(1, 6)
        .map((line) => line
            .trim()
            .replace(/^at\s+/, '')
            .replace(/\(.*\)$/, '')       // "(path:line:col)" → gone
            .replace(/@.*$/, '')          // Hermes "fn@path:line:col" → fn
            .replace(/https?:\/\/\S+/g, '')
            .replace(/[A-Za-z]?:?[/\\][^\s]*/g, '') // any residual path
            .replace(/:\d+(:\d+)?$/, '')
            .trim())
        .filter(Boolean);
}

async function sha256Hex16(material: string): Promise<string> {
    try {
        const ExpoCrypto = require('expo-crypto');
        const hex: string = await ExpoCrypto.digestStringAsync(
            ExpoCrypto.CryptoDigestAlgorithm.SHA256, material,
        );
        return hex.slice(0, 16);
    } catch {
        // Deterministic fallback hash (FNV-1a over the material) — still an
        // opaque grouping key, never the frames themselves.
        let h1 = 0x811c9dc5; let h2 = 0x01000193;
        for (let i = 0; i < material.length; i++) {
            h1 = ((h1 ^ material.charCodeAt(i)) * 0x01000193) >>> 0;
            h2 = ((h2 ^ ((material.charCodeAt(i) << 1) | 1)) * 0x01000193) >>> 0;
        }
        return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
    }
}

// ─── Engine → contract tier mapping ──────────────────────────────────

/** on-device whisper tiny → ultralight, base/small → light, medium →
 *  standard, large* → pro, cloud-* → cloud (contract §1.2 enum). */
export function engineTier(engineId?: string): 'ultralight' | 'light' | 'standard' | 'pro' | 'cloud' {
    switch (engineId) {
        case 'tiny': return 'ultralight';
        case 'base':
        case 'small': return 'light';
        case 'medium': return 'standard';
        case 'large-v3':
        case 'large-v3-turbo': return 'pro';
        case 'cloud-standard':
        case 'cloud-turbo': return 'cloud';
        default: return 'ultralight'; // bundled Windy Nano is the default engine
    }
}

function engineOnDevice(engineId?: string): boolean {
    try {
        const { ENGINE_REGISTRY } = require('./windy-tune');
        const cfg = engineId ? ENGINE_REGISTRY[engineId] : null;
        if (cfg) return !!cfg.isOnDevice;
    } catch { /* fall through */ }
    return !(engineId || '').startsWith('cloud');
}

/**
 * True while audio capture or OS dictation is active — banners and any
 * other intel-driven UI must NEVER appear during an active recording.
 */
export function isCaptureActive(): boolean {
    try {
        const { audioCaptureService } = require('./audio-capture');
        if (audioCaptureService.isRecording()) return true;
    } catch { /* ignore */ }
    try {
        const { dictationService } = require('./dictation');
        if (dictationService.isListening()) return true;
    } catch { /* ignore */ }
    return false;
}

export const intelService = new IntelService();
