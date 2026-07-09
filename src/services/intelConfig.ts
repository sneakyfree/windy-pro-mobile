/**
 * 🛰️ Intel Client Config — /v1/client/config consumer (INTEL-CONTRACT-V2 §3).
 *
 * Fetches version policy + marketing/maintenance messages on launch and on
 * foreground resume, respecting config_ttl_seconds (no refetch inside the
 * TTL). Last-good config is cached in AsyncStorage; offline → serve cache,
 * fail quiet. Emits update.check after each successful fetch, and
 * marketing.impression / marketing.click when the banner UI reports them.
 *
 * Client-enforced frequency caps (contract §3): a message shows at most
 * frequency_cap.max_impressions per per_hours, honors cooldown_hours
 * between shows, and respects starts_at/ends_at + priority.
 *
 * Same hard lines as intel.ts: fire-and-forget, never blocks UI, never
 * throws to a caller, hard no-op when the EXPO_PUBLIC env is unset.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking } from 'react-native';
import { create } from 'zustand';
import {
    intelEnabled, intelService, appVersion, compareVersions, APP_STORE_URL,
} from './intel';

// ─── Contract types (§3) ─────────────────────────────────────────────

export interface IntelMessage {
    message_id: string;
    campaign_id: string;
    type: 'update' | 'promo' | 'survey' | 'maintenance';
    priority: number;
    title: string;
    body: string;
    cta_label?: string;
    cta_url?: string;
    dismissible?: boolean;
    frequency_cap?: { max_impressions?: number; per_hours?: number; cooldown_hours?: number };
    starts_at?: string;
    ends_at?: string;
}

export interface ClientConfig {
    latest_version?: string;
    min_version?: string;
    update_url?: string;
    messages?: IntelMessage[];
    maintenance?: { banner: string; severity?: 'info' | 'warn' | 'critical'; surface?: string } | null;
    config_ttl_seconds?: number;
}

// ─── UI store (consumed by IntelBanner — render state only) ──────────

interface IntelUiState {
    /** min_version > current — blocking full-screen update wall. */
    updateRequired: { updateUrl: string } | null;
    /** latest_version > current — gentle dismissible banner. */
    updateAvailable: { latestVersion: string; updateUrl: string } | null;
    maintenance: { banner: string; severity: 'info' | 'warn' | 'critical' } | null;
    /** Highest-priority eligible marketing message, if any. */
    message: IntelMessage | null;
    _set: (partial: Partial<IntelUiState>) => void;
}

export const useIntelUiStore = create<IntelUiState>((set) => ({
    updateRequired: null,
    updateAvailable: null,
    maintenance: null,
    message: null,
    _set: (partial) => set(partial),
}));

// ─── Storage keys ────────────────────────────────────────────────────

const K_CONFIG_CACHE = 'intel-config-cache';       // {at, config}
const K_MSG_IMPRESSIONS = 'intel-msg-impressions'; // {message_id: [ts,…]}
const K_MSG_DISMISSED = 'intel-msg-dismissed';     // [message_id,…]
const K_MSG_SNOOZED = 'intel-msg-snoozed';         // {message_id: until_ts}
const K_UPDATE_DISMISSED = 'intel-update-dismissed'; // version string

const DEFAULT_TTL_SECONDS = 21600; // 6h per contract recommendation
const REQUEST_TIMEOUT_MS = 3_000;

function ingestBaseUrl(): string | null {
    const v = process.env.EXPO_PUBLIC_WINDY_ADMIN_INGEST_URL;
    return v ? v.replace(/\/+$/, '') : null;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch { return fallback; }
}

// ─── Service ─────────────────────────────────────────────────────────

class IntelConfigService {
    private lastFetchAt = 0;
    private ttlSeconds = DEFAULT_TTL_SECONDS;
    private refreshing = false;

    /**
     * Fetch /v1/client/config if the TTL has lapsed (or force). Applies the
     * result to the UI store. All failures are quiet; last-good cache wins.
     */
    async refresh(force = false): Promise<void> {
        if (!intelEnabled() || this.refreshing) return;
        this.refreshing = true;
        try {
            // Hydrate TTL bookkeeping + last-good config from cache first.
            const cached = await readJson<{ at: number; config: ClientConfig } | null>(K_CONFIG_CACHE, null);
            if (cached?.config) {
                this.ttlSeconds = cached.config.config_ttl_seconds || DEFAULT_TTL_SECONDS;
                if (this.lastFetchAt === 0) this.lastFetchAt = cached.at || 0;
            }
            const age = (Date.now() - this.lastFetchAt) / 1000;
            if (!force && this.lastFetchAt > 0 && age < this.ttlSeconds) {
                // Inside TTL — apply cache (covers cold start) and stop.
                if (cached?.config) await this.apply(cached.config);
                return;
            }

            const config = await this.fetchConfig();
            if (config) {
                this.lastFetchAt = Date.now();
                this.ttlSeconds = config.config_ttl_seconds || DEFAULT_TTL_SECONDS;
                await AsyncStorage.setItem(
                    K_CONFIG_CACHE, JSON.stringify({ at: this.lastFetchAt, config }),
                ).catch(() => {});
                // update.check after each successful fetch (§1.6).
                const current = appVersion();
                intelService.emit('update.check', {
                    current_version: current,
                    update_available: !!(config.latest_version
                        && compareVersions(config.latest_version, current) > 0),
                });
                await this.apply(config);
            } else if (cached?.config) {
                await this.apply(cached.config); // offline → last-good
            }
        } catch { /* fail quiet */ } finally {
            this.refreshing = false;
        }
    }

    private async fetchConfig(): Promise<ClientConfig | null> {
        try {
            const base = ingestBaseUrl();
            if (!base) return null;
            const params = new URLSearchParams({
                platform: 'windy-word',
                service: Platform.OS === 'android' ? 'mobile-android' : 'mobile-ios',
                app_version: appVersion(),
                os: Platform.OS,
                locale: (() => {
                    try { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'; }
                    catch { return 'en-US'; }
                })(),
            });
            try {
                const { useSettingsStore } = require('@/stores/useSettingsStore');
                params.set('tier', useSettingsStore.getState().licenseTier || 'free');
            } catch { /* omit */ }
            const installId = intelService.getInstallId();
            if (installId) params.set('install_id', installId);

            // Optional account JWT — unlocks per-account targeting and the
            // server-side do-not-market suppression (§3).
            const headers: Record<string, string> = {};
            try {
                const { identityApi } = require('./identityApi');
                const jwt = identityApi.isAuthenticated() ? identityApi.getToken() : null;
                if (jwt) headers.Authorization = `Bearer ${jwt}`;
            } catch { /* anonymous */ }

            const res = await fetch(`${base}/v1/client/config?${params.toString()}`, {
                headers,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!res.ok) return null;
            const data = await res.json();
            return (data && typeof data === 'object') ? data as ClientConfig : null;
        } catch { return null; }
    }

    // ── Apply config → UI store ──────────────────────────────────────

    private async apply(config: ClientConfig): Promise<void> {
        try {
            const current = appVersion();
            const updateUrl = config.update_url || APP_STORE_URL;

            const updateRequired = (config.min_version
                && compareVersions(config.min_version, current) > 0)
                ? { updateUrl } : null;

            let updateAvailable: IntelUiState['updateAvailable'] = null;
            if (!updateRequired && config.latest_version
                && compareVersions(config.latest_version, current) > 0) {
                const dismissedFor = await AsyncStorage.getItem(K_UPDATE_DISMISSED).catch(() => null);
                if (dismissedFor !== config.latest_version) {
                    updateAvailable = { latestVersion: config.latest_version, updateUrl };
                }
            }

            const maintenance = config.maintenance?.banner ? {
                banner: config.maintenance.banner,
                severity: config.maintenance.severity || 'info' as const,
            } : null;

            const message = await this.pickMessage(config.messages || []);

            useIntelUiStore.getState()._set({ updateRequired, updateAvailable, maintenance, message });
        } catch { /* fail quiet */ }
    }

    /** Highest-priority message that passes window/dismiss/frequency checks. */
    async pickMessage(messages: IntelMessage[]): Promise<IntelMessage | null> {
        try {
            const now = Date.now();
            const [impressions, dismissed, snoozed] = await Promise.all([
                readJson<Record<string, number[]>>(K_MSG_IMPRESSIONS, {}),
                readJson<string[]>(K_MSG_DISMISSED, []),
                readJson<Record<string, number>>(K_MSG_SNOOZED, {}),
            ]);
            const eligible = messages.filter((m) => {
                if (!m || typeof m.message_id !== 'string' || !m.title) return false;
                if (dismissed.includes(m.message_id)) return false;
                if (snoozed[m.message_id] && now < snoozed[m.message_id]) return false;
                if (m.starts_at && now < Date.parse(m.starts_at)) return false;
                if (m.ends_at && now > Date.parse(m.ends_at)) return false;
                return this.passesFrequencyCap(m, impressions[m.message_id] || [], now);
            });
            eligible.sort((a, b) => (b.priority || 0) - (a.priority || 0));
            return eligible[0] || null;
        } catch { return null; }
    }

    /** Client-enforced frequency cap (contract §3). */
    passesFrequencyCap(m: IntelMessage, shownAt: number[], now: number): boolean {
        const cap = m.frequency_cap || {};
        const maxImpressions = cap.max_impressions ?? 3;
        const perHours = cap.per_hours ?? 168;
        const cooldownHours = cap.cooldown_hours ?? 24;
        const windowStart = now - perHours * 3600_000;
        const inWindow = shownAt.filter((t) => t >= windowStart);
        if (inWindow.length >= maxImpressions) return false;
        const last = shownAt.length ? Math.max(...shownAt) : 0;
        if (last && now - last < cooldownHours * 3600_000) return false;
        return true;
    }

    // ── Banner UI callbacks (IntelBanner reports what it did) ────────

    /** The banner actually rendered this message → count + report it. */
    async recordImpression(m: IntelMessage): Promise<void> {
        try {
            const impressions = await readJson<Record<string, number[]>>(K_MSG_IMPRESSIONS, {});
            const list = impressions[m.message_id] || [];
            list.push(Date.now());
            impressions[m.message_id] = list.slice(-20);
            await AsyncStorage.setItem(K_MSG_IMPRESSIONS, JSON.stringify(impressions)).catch(() => {});
            intelService.emit('marketing.impression', {
                message_id: m.message_id,
                campaign_id: m.campaign_id,
                surface: 'mobile',
                message_type: m.type,
            });
        } catch { /* fail quiet */ }
    }

    async ctaMessage(m: IntelMessage): Promise<void> {
        try {
            intelService.emit('marketing.click', {
                message_id: m.message_id, campaign_id: m.campaign_id, action: 'cta',
            });
            useIntelUiStore.getState()._set({ message: null });
            if (m.cta_url) await Linking.openURL(m.cta_url).catch(() => {});
        } catch { /* fail quiet */ }
    }

    async dismissMessage(m: IntelMessage): Promise<void> {
        try {
            intelService.emit('marketing.click', {
                message_id: m.message_id, campaign_id: m.campaign_id, action: 'dismiss',
            });
            useIntelUiStore.getState()._set({ message: null });
            const dismissed = await readJson<string[]>(K_MSG_DISMISSED, []);
            if (!dismissed.includes(m.message_id)) dismissed.push(m.message_id);
            await AsyncStorage.setItem(K_MSG_DISMISSED, JSON.stringify(dismissed.slice(-100))).catch(() => {});
        } catch { /* fail quiet */ }
    }

    async snoozeMessage(m: IntelMessage): Promise<void> {
        try {
            intelService.emit('marketing.click', {
                message_id: m.message_id, campaign_id: m.campaign_id, action: 'snooze',
            });
            useIntelUiStore.getState()._set({ message: null });
            const cooldownHours = m.frequency_cap?.cooldown_hours ?? 24;
            const snoozed = await readJson<Record<string, number>>(K_MSG_SNOOZED, {});
            snoozed[m.message_id] = Date.now() + cooldownHours * 3600_000;
            await AsyncStorage.setItem(K_MSG_SNOOZED, JSON.stringify(snoozed)).catch(() => {});
        } catch { /* fail quiet */ }
    }

    /** "Update available" banner: open the store. */
    async openUpdate(updateUrl: string): Promise<void> {
        try { await Linking.openURL(updateUrl || APP_STORE_URL); } catch { /* quiet */ }
    }

    /** Dismiss the update-available banner for this latest_version. */
    async dismissUpdate(latestVersion: string): Promise<void> {
        try {
            useIntelUiStore.getState()._set({ updateAvailable: null });
            await AsyncStorage.setItem(K_UPDATE_DISMISSED, latestVersion).catch(() => {});
        } catch { /* fail quiet */ }
    }
}

export const intelConfig = new IntelConfigService();
