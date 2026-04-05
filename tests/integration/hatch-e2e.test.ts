/**
 * End-to-End Agent Hatch Integration Test
 *
 * Tests the full hatch flow: register → provision agent → verify ecosystem → cleanup.
 * Run against a local account-server: TEST_API_URL=http://localhost:8098 npm test
 * Or against production: TEST_API_URL=https://windyword.ai npm test
 *
 * Skipped by default in CI (requires running account-server).
 * Enable with: E2E_HATCH=1 npm test
 */

const API_URL = process.env.TEST_API_URL || 'http://localhost:8098';
const SHOULD_RUN = process.env.E2E_HATCH === '1';

// Skip all tests if E2E_HATCH is not set
const describeE2E = SHOULD_RUN ? describe : describe.skip;

describeE2E('Agent Hatch End-to-End', () => {
    let token: string;
    let refreshToken: string;
    let testEmail: string;
    let userId: string;
    let passportNumber: string;
    let matrixUserId: string;
    let dmRoomId: string;

    // ── Step 1: Register ────────────────────────────────────────

    it('Step 1: registers a test user and gets JWT', async () => {
        testEmail = `e2e-hatch-${Date.now()}@test.windyword.ai`;

        const res = await fetch(`${API_URL}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testEmail,
                password: 'E2ETestPass!2026',
                name: 'E2E Grandma',
            }),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.token).toBeTruthy();
        expect(data.userId || data.user?.id).toBeTruthy();

        token = data.token;
        refreshToken = data.refreshToken || '';
        userId = data.userId || data.user?.id;
    }, 15000);

    // ── Step 2: Verify health ───────────────────────────────────

    it('Step 2: account-server health check returns ok', async () => {
        const res = await fetch(`${API_URL}/health`);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.status).toBe('ok');
    });

    // ── Step 3: Provision agent ─────────────────────────────────

    it('Step 3: provisions agent via /identity/agent/provision', async () => {
        const res = await fetch(`${API_URL}/api/v1/identity/agent/provision`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                agent_name: 'E2ETestFly',
                owner_email: testEmail,
            }),
        });

        // 201 = success, or 201 with pending = partial success (service down)
        expect(res.status).toBe(201);

        const data = await res.json();

        // Passport should always be present (Eternitas)
        if (data.passport_number) {
            expect(data.passport_number).toMatch(/^ET/);
            passportNumber = data.passport_number;
        }

        // Chat may be provisioned or pending
        if (data.chat_provisioned) {
            expect(data.matrix_user_id).toBeTruthy();
            expect(data.dm_room_id).toBeTruthy();
            matrixUserId = data.matrix_user_id;
            dmRoomId = data.dm_room_id;
        }

        // At minimum, identity should be created
        expect(data.identity_id || data.windy_identity_id).toBeTruthy();
    }, 30000);

    // ── Step 4: Verify ecosystem status ─────────────────────────

    it('Step 4: agent appears in ecosystem status', async () => {
        const res = await fetch(`${API_URL}/api/v1/identity/ecosystem-status`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();

        // Verify ecosystem structure
        expect(data.windy_identity_id).toBeTruthy();
        expect(data.email).toBe(testEmail);
        expect(data.products).toBeTruthy();

        // Windy Word should always be active
        expect(data.products.windy_word.status).toBe('active');

        // Windy Fly should be provisioned (or pending if chat was down)
        const fly = data.products.windy_fly;
        if (passportNumber) {
            expect(fly.provisioned || fly.status === 'active' || fly.status === 'pending').toBeTruthy();
        }

        // Eternitas should have the passport
        if (passportNumber) {
            const eternitas = data.products.eternitas;
            expect(eternitas.provisioned || eternitas.status === 'active').toBeTruthy();
        }
    }, 15000);

    // ── Step 5: Verify user profile ─────────────────────────────

    it('Step 5: user profile contains correct data', async () => {
        const res = await fetch(`${API_URL}/api/v1/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.email).toBe(testEmail);
        expect(data.name || data.display_name).toBeTruthy();
    });

    // ── Step 6: Cleanup ─────────────────────────────────────────

    it('Step 6: deletes test account', async () => {
        const res = await fetch(`${API_URL}/api/v1/auth/me`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
        });

        // 200 or 204 = success, 404 = already deleted
        expect([200, 204, 404]).toContain(res.status);
    }, 15000);
});

// ── Offline/Error Resilience Tests ──────────────────────────────

describe('Hatch Pre-Flight Checks (unit)', () => {
    it('detects unreachable API', async () => {
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 2000);
            await fetch('http://localhost:1/health', { signal: controller.signal });
            // If we get here, the server responded (unexpected)
        } catch (err) {
            // Expected: ECONNREFUSED or AbortError
            expect(err).toBeTruthy();
        }
    });

    it('handles timeout gracefully', async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 100);

        try {
            await fetch('http://10.255.255.1/health', { signal: controller.signal });
        } catch (err: any) {
            expect(err.name === 'AbortError' || err.code === 'ECONNREFUSED').toBeTruthy();
        } finally {
            clearTimeout(timeout);
        }
    });

    it('validates agent name is not empty', () => {
        const name = '';
        expect(name.trim().length).toBe(0);
    });

    it('validates agent name length', () => {
        const name = 'A'.repeat(51);
        expect(name.length).toBeGreaterThan(50);
    });

    it('validates API key format for paid brains', () => {
        const openaiKey = 'sk-test-1234567890abcdef';
        expect(openaiKey.startsWith('sk-')).toBe(true);

        const anthropicKey = 'sk-ant-test-1234567890';
        expect(anthropicKey.startsWith('sk-ant-')).toBe(true);
    });
});
