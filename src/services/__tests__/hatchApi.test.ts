/**
 * hatchApi — SSE frame parsing for the Wave 8 ceremony contract.
 *
 * windy-pro emits resource-scoped event names (eternitas.registering,
 * mail.provisioned, hatch.complete, …). We test the parser directly
 * via the __test__ export; the live XHR path is covered by the Wave
 * 8 production smoke run.
 */
import { __test__, HATCH_STEP_KEYS } from '../hatchApi';

const { parseSseFrame } = __test__;

describe('parseSseFrame — ceremony step events', () => {
    it('maps *.registering to an in_progress step (eternitas)', () => {
        const frame = 'event: eternitas.registering\ndata: {"detail":"requesting passport"}';
        expect(parseSseFrame(frame)).toEqual({
            kind: 'step',
            step: 'eternitas',
            state: 'in_progress',
            detail: 'requesting passport',
        });
    });

    it('maps *.registered to a done step (eternitas)', () => {
        const frame = 'event: eternitas.registered\ndata: {"passport":"ET-12345"}';
        expect(parseSseFrame(frame)).toEqual({
            kind: 'step',
            step: 'eternitas',
            state: 'done',
            detail: undefined,
        });
    });

    it('maps mail.provisioning → in_progress and mail.provisioned → done', () => {
        expect(parseSseFrame('event: mail.provisioning\ndata: {}')).toEqual({
            kind: 'step', step: 'mail', state: 'in_progress', detail: undefined,
        });
        expect(parseSseFrame('event: mail.provisioned\ndata: {}')).toEqual({
            kind: 'step', step: 'mail', state: 'done', detail: undefined,
        });
    });

    it('maps chat.provisioning/chat.provisioned', () => {
        expect(parseSseFrame('event: chat.provisioning\ndata: {}')).toMatchObject({
            kind: 'step', step: 'chat', state: 'in_progress',
        });
        expect(parseSseFrame('event: chat.provisioned\ndata: {}')).toMatchObject({
            kind: 'step', step: 'chat', state: 'done',
        });
    });

    it('maps cloud.provisioning/cloud.provisioned', () => {
        expect(parseSseFrame('event: cloud.provisioning\ndata: {}')).toMatchObject({
            kind: 'step', step: 'cloud', state: 'in_progress',
        });
        expect(parseSseFrame('event: cloud.provisioned\ndata: {}')).toMatchObject({
            kind: 'step', step: 'cloud', state: 'done',
        });
    });

    it('maps phone.assigning → in_progress and phone.assigned → done', () => {
        expect(parseSseFrame('event: phone.assigning\ndata: {}')).toMatchObject({
            kind: 'step', step: 'phone', state: 'in_progress',
        });
        expect(parseSseFrame('event: phone.assigned\ndata: {"number":"+1-555-0100"}')).toMatchObject({
            kind: 'step', step: 'phone', state: 'done',
        });
    });

    it('maps birth_certificate.generating → in_progress and .ready → done', () => {
        expect(parseSseFrame('event: birth_certificate.generating\ndata: {}')).toMatchObject({
            kind: 'step', step: 'birth_certificate', state: 'in_progress',
        });
        expect(parseSseFrame('event: birth_certificate.ready\ndata: {}')).toMatchObject({
            kind: 'step', step: 'birth_certificate', state: 'done',
        });
    });

    it('ignores unknown resource prefixes', () => {
        expect(parseSseFrame('event: unknown.thing\ndata: {}')).toBeNull();
    });

    it('ignores unknown verb suffixes', () => {
        expect(parseSseFrame('event: eternitas.wobbling\ndata: {}')).toBeNull();
    });
});

describe('parseSseFrame — terminal events', () => {
    it('maps hatch.complete to a result event with the identity bundle', () => {
        const frame = [
            'event: hatch.complete',
            'data: {"passport_number":"ET-12345","matrix_user_id":"@fly:windypro.com","dm_room_id":"!dm:windypro.com","trust_score":88}',
        ].join('\n');
        expect(parseSseFrame(frame)).toEqual({
            kind: 'result',
            passport_number: 'ET-12345',
            matrix_user_id: '@fly:windypro.com',
            dm_room_id: '!dm:windypro.com',
            trust_score: 88,
        });
    });

    it('treats hatch.complete with no body as an empty-but-successful result', () => {
        expect(parseSseFrame('event: hatch.complete\ndata: {}')).toEqual({ kind: 'result' });
    });

    it('maps event: error with a JSON body to a user-facing message', () => {
        const frame = 'event: error\ndata: {"message":"Chat service degraded"}';
        expect(parseSseFrame(frame)).toEqual({
            kind: 'error',
            message: 'Chat service degraded',
        });
    });

    it('maps event: error with a raw text body to a user-facing message', () => {
        const frame = 'event: error\ndata: upstream down';
        expect(parseSseFrame(frame)).toEqual({ kind: 'error', message: 'upstream down' });
    });
});

describe('parseSseFrame — resilience', () => {
    it('returns null for keepalive comments', () => {
        expect(parseSseFrame(': heartbeat')).toBeNull();
    });

    it('returns null for empty frames', () => {
        expect(parseSseFrame('')).toBeNull();
    });

    it('joins multi-line data: fields before JSON-parsing them', () => {
        const frame = [
            'event: hatch.complete',
            'data: {"passport_number":',
            'data: "ET-99","trust_score":91}',
        ].join('\n');
        expect(parseSseFrame(frame)).toEqual({
            kind: 'result',
            passport_number: 'ET-99',
            trust_score: 91,
        });
    });

    it('accepts the legacy {kind,...} payload shape as a fallback', () => {
        const frame = 'data: {"kind":"step","step":"chat","state":"done"}';
        expect(parseSseFrame(frame)).toEqual({
            kind: 'step',
            step: 'chat',
            state: 'done',
        });
    });
});

describe('HATCH_STEP_KEYS', () => {
    it('covers all six Wave 8 resources in ceremony order', () => {
        expect(HATCH_STEP_KEYS).toEqual([
            'eternitas', 'mail', 'chat', 'cloud', 'phone', 'birth_certificate',
        ]);
    });
});
