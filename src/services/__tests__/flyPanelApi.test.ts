/**
 * Unit tests for flyPanelApi (windy.panel.v1 client). Covers:
 *   - result mapping: 200 ok / 404 no_agent vs plain 404 / 401 / 501 /
 *     5xx / network throw / null authedFetch (signed out)
 *   - setSlider client-side 0–10 integer validation (bad value never
 *     hits the network)
 *   - applyPreset: sequential PUTs with updated_by preset:<name>,
 *     restricted to the sliders the server serves, partial-failure
 *     reporting, auth short-circuit
 */

const mockAuthedFetch = jest.fn();
jest.mock('../identityApi', () => ({
    identityApi: { authedFetch: (...args: unknown[]) => mockAuthedFetch(...args) },
}));

import { flyPanelApi } from '../flyPanelApi';
import { PANEL_BASE, type PanelSummary } from '../panelContract';
import { getPreset } from '../panelPresets';

function jsonRes(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    };
}

function summaryBody(): PanelSummary {
    return {
        contract: 'windy.panel.v1',
        kind: 'cloud',
        capabilities: ['sliders', 'personality.history', 'identity'],
        agent: {
            agent_matrix_id: '@agent:windychat.ai',
            agent_name: 'Rosie',
            passport_number: 'ET26-TEST',
            hatched_at: '2026-07-01T00:00:00Z',
            status: 'alive',
            last_event_at: null,
            replies_sent: 12,
        },
        personality: { sliders: { humor: 5 }, preset: 'custom' },
    };
}

beforeEach(() => {
    mockAuthedFetch.mockReset();
});

describe('flyPanelApi.getSummary', () => {
    it('returns ok with the parsed summary on 200', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(200, summaryBody()));
        const result = await flyPanelApi.getSummary();
        expect(result.status).toBe('ok');
        if (result.status === 'ok') {
            expect(result.data.agent.agent_name).toBe('Rosie');
            expect(result.data.capabilities).toContain('sliders');
        }
        expect(mockAuthedFetch.mock.calls[0][0]).toBe(`${PANEL_BASE}/summary`);
    });

    it('maps contract 404 no_agent to no_agent', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(404, { error: 'no_agent', hint: 'not_provisioned' }));
        expect((await flyPanelApi.getSummary()).status).toBe('no_agent');
    });

    it('maps a plain 404 (backend not deployed) to error, not no_agent', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(404, { error: 'not found' }));
        const result = await flyPanelApi.getSummary();
        expect(result.status).toBe('error');
    });

    it('maps 401 to auth', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(401, { error: 'unauthorized' }));
        expect((await flyPanelApi.getSummary()).status).toBe('auth');
    });

    it('maps null authedFetch (signed out) to auth', async () => {
        mockAuthedFetch.mockResolvedValueOnce(null);
        expect((await flyPanelApi.getSummary()).status).toBe('auth');
    });

    it('maps 501 to not_supported', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(501, { error: 'not_supported', capability: 'memory' }));
        expect((await flyPanelApi.getSummary()).status).toBe('not_supported');
    });

    it('maps 5xx to error with the server message', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(500, { error: 'boom' }));
        const result = await flyPanelApi.getSummary();
        expect(result.status).toBe('error');
        if (result.status === 'error') expect(result.message).toBe('boom');
    });

    it('maps a network throw to error', async () => {
        mockAuthedFetch.mockRejectedValueOnce(new Error('timeout'));
        const result = await flyPanelApi.getSummary();
        expect(result.status).toBe('error');
        if (result.status === 'error') expect(result.message).toBe('timeout');
    });
});

describe('flyPanelApi.setSlider', () => {
    it('PUTs {value} to /sliders/:name', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(200, { success: true }));
        const result = await flyPanelApi.setSlider('humor', 9);
        expect(result.status).toBe('ok');
        const [url, init] = mockAuthedFetch.mock.calls[0];
        expect(url).toBe(`${PANEL_BASE}/sliders/humor`);
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body)).toEqual({ value: 9 });
    });

    it('includes updated_by when changedBy is passed', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(200, { success: true }));
        await flyPanelApi.setSlider('humor', 7, 'preset:buddy');
        expect(JSON.parse(mockAuthedFetch.mock.calls[0][1].body)).toEqual({ value: 7, updated_by: 'preset:buddy' });
    });

    it.each([[11], [-1], [5.5], [NaN]])('rejects invalid value %p without a network call', async (bad) => {
        const result = await flyPanelApi.setSlider('humor', bad as number);
        expect(result.status).toBe('error');
        if (result.status === 'error') expect(result.code).toBe(400);
        expect(mockAuthedFetch).not.toHaveBeenCalled();
    });

    it('surfaces a server 400 as error', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(400, { error: 'unknown slider' }));
        const result = await flyPanelApi.setSlider('bogus', 5);
        expect(result.status).toBe('error');
        if (result.status === 'error') expect(result.code).toBe(400);
    });
});

describe('flyPanelApi.applyPreset', () => {
    const serverSliders = [
        'personality', 'humor', 'warmth', 'formality',
        'verbosity', 'proactivity', 'creativity', 'response_length',
    ];

    it('writes every preset slider sequentially with updated_by', async () => {
        mockAuthedFetch.mockResolvedValue(jsonRes(200, { success: true }));
        const result = await flyPanelApi.applyPreset('buddy', serverSliders);
        expect(result.status).toBe('ok');
        if (result.status === 'ok') {
            expect(result.data.applied.sort()).toEqual([...serverSliders].sort());
            expect(result.data.failed).toEqual([]);
        }
        const buddy = getPreset('buddy')!;
        expect(mockAuthedFetch).toHaveBeenCalledTimes(Object.keys(buddy.values).length);
        for (const [url, init] of mockAuthedFetch.mock.calls) {
            const name = (url as string).split('/').pop()!;
            const body = JSON.parse(init.body);
            expect(body.value).toBe(buddy.values[name]);
            expect(body.updated_by).toBe('preset:buddy');
        }
    });

    it('only writes sliders the server serves', async () => {
        mockAuthedFetch.mockResolvedValue(jsonRes(200, { success: true }));
        const result = await flyPanelApi.applyPreset('buddy', ['humor', 'warmth']);
        expect(result.status).toBe('ok');
        if (result.status === 'ok') expect(result.data.applied.sort()).toEqual(['humor', 'warmth']);
        expect(mockAuthedFetch).toHaveBeenCalledTimes(2);
    });

    it('reports per-slider failures without aborting the rest', async () => {
        mockAuthedFetch.mockImplementation((url: string) =>
            Promise.resolve(url.endsWith('/humor')
                ? jsonRes(500, { error: 'boom' })
                : jsonRes(200, { success: true })));
        const result = await flyPanelApi.applyPreset('buddy', serverSliders);
        expect(result.status).toBe('ok');
        if (result.status === 'ok') {
            expect(result.data.failed).toEqual(['humor']);
            expect(result.data.applied).toHaveLength(serverSliders.length - 1);
        }
    });

    it('short-circuits to auth when the session dies mid-preset', async () => {
        mockAuthedFetch.mockResolvedValue(null);
        const result = await flyPanelApi.applyPreset('buddy', serverSliders);
        expect(result.status).toBe('auth');
        expect(mockAuthedFetch).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown preset', async () => {
        const result = await flyPanelApi.applyPreset('mega-brain', serverSliders);
        expect(result.status).toBe('error');
        expect(mockAuthedFetch).not.toHaveBeenCalled();
    });
});

describe('flyPanelApi.getHistory', () => {
    it('fetches /personality/history with the limit', async () => {
        mockAuthedFetch.mockResolvedValueOnce(jsonRes(200, { history: [] }));
        const result = await flyPanelApi.getHistory(5);
        expect(result.status).toBe('ok');
        expect(mockAuthedFetch.mock.calls[0][0]).toBe(`${PANEL_BASE}/personality/history?limit=5`);
    });
});
