/**
 * Fly Panel API — client for `windy.panel.v1` (the agent control panel).
 *
 * The cloud agent's owner-editable settings live behind
 * `https://chat.windychat.ai/api/v1/agent/panel` (windy-chat onboarding
 * service). Auth rides the app's existing account-server JWT via
 * `identityApi.authedFetch` — no new auth, no Matrix involvement.
 *
 * Shapes mirror DASHBOARD_API_CONTRACT.md §2.3 (see panelContract.ts).
 * Plain singleton, no store — same idiom as trustApi/mailApi.
 */
import { identityApi } from './identityApi';
import { createLogger } from './logger';
import {
    PANEL_BASE,
    type PanelSummary,
    type SlidersResponse,
    type SliderInfoResponse,
    type HistoryRow,
} from './panelContract';
import { getPreset } from './panelPresets';

const log = createLogger('FlyPanelApi');

export type PanelResult<T> =
    | { status: 'ok'; data: T }
    /** 404 no_agent — the identity has no hatched agent yet. */
    | { status: 'no_agent' }
    /** Not signed in, or the session expired and refresh failed. */
    | { status: 'auth' }
    /** 501 — capability not available on this agent (contract §2.3 #6). */
    | { status: 'not_supported' }
    | { status: 'error'; code?: number; message: string };

export interface PresetApplyResult {
    /** Slider names written successfully. */
    applied: string[];
    /** Slider names whose PUT failed — values on the server are unchanged for these. */
    failed: string[];
}

class FlyPanelApiClient {
    private async request<T>(path: string, init?: RequestInit): Promise<PanelResult<T>> {
        let res: Response | null;
        try {
            res = await identityApi.authedFetch(`${PANEL_BASE}${path}`, init);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn('request', `${path} network error`, { message });
            return { status: 'error', message };
        }
        if (!res) return { status: 'auth' };
        if (res.status === 401 || res.status === 403) return { status: 'auth' };
        if (res.status === 501) return { status: 'not_supported' };

        let body: unknown = null;
        try { body = await res.json(); } catch { /* non-JSON error body */ }

        if (res.status === 404) {
            // Contract 404 = no_agent; any other 404 (e.g. backend not yet
            // deployed) is an honest error, not a hatch prompt.
            if ((body as { error?: string } | null)?.error === 'no_agent') {
                return { status: 'no_agent' };
            }
            return { status: 'error', code: 404, message: 'Control panel unavailable' };
        }
        if (!res.ok) {
            const message = (body as { error?: string } | null)?.error || `HTTP ${res.status}`;
            log.warn('request', `${path} failed`, { status: res.status, message });
            return { status: 'error', code: res.status, message };
        }
        if (body === null) return { status: 'error', code: res.status, message: 'Invalid response' };
        return { status: 'ok', data: body as T };
    }

    getSummary(): Promise<PanelResult<PanelSummary>> {
        return this.request<PanelSummary>('/summary');
    }

    getSliders(): Promise<PanelResult<SlidersResponse>> {
        return this.request<SlidersResponse>('/sliders');
    }

    getSliderInfo(): Promise<PanelResult<SliderInfoResponse>> {
        return this.request<SliderInfoResponse>('/sliders/info');
    }

    getHistory(limit = 20): Promise<PanelResult<{ history: HistoryRow[] }>> {
        return this.request<{ history: HistoryRow[] }>(`/personality/history?limit=${limit}`);
    }

    /**
     * Write one slider. Values are integers 0–10 (contract §2.3 #4) —
     * validated client-side so a bad value never leaves the phone.
     */
    async setSlider(name: string, value: number, changedBy?: string): Promise<PanelResult<{ success: true }>> {
        if (!Number.isInteger(value) || value < 0 || value > 10) {
            return { status: 'error', code: 400, message: 'Slider values are whole numbers from 0 to 10.' };
        }
        const body: Record<string, unknown> = { value };
        if (changedBy) body.updated_by = changedBy;
        return this.request<{ success: true }>(`/sliders/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    /**
     * Apply a preset as sequential per-slider PUTs (contract §2.5 — there
     * is no preset endpoint). Only writes sliders the server actually
     * serves (`serverSliders`), so a subset change server-side never 400s.
     */
    async applyPreset(presetName: string, serverSliders: string[]): Promise<PanelResult<PresetApplyResult>> {
        const preset = getPreset(presetName);
        if (!preset) return { status: 'error', code: 400, message: `Unknown preset '${presetName}'` };

        const applied: string[] = [];
        const failed: string[] = [];
        for (const [name, value] of Object.entries(preset.values)) {
            if (!serverSliders.includes(name)) continue;
            const result = await this.setSlider(name, value, `preset:${presetName}`);
            if (result.status === 'ok') {
                applied.push(name);
            } else if (result.status === 'auth' || result.status === 'no_agent') {
                // Whole-session problem, not a per-slider one — stop and surface it.
                return result;
            } else {
                failed.push(name);
            }
        }
        return { status: 'ok', data: { applied, failed } };
    }
}

export const flyPanelApi = new FlyPanelApiClient();
export type { FlyPanelApiClient };
