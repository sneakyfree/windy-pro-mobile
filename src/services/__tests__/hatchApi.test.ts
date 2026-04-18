/**
 * hatchApi — SSE frame parsing + end-to-end event dispatching.
 *
 * We can't stand up a real Expo XMLHttpRequest server here, so we
 * exercise the SSE frame parser directly via the __test__ hook and
 * verify the shape of the events it emits. The live XHR path is
 * covered by the Wave 8 production smoke run.
 */
import { __test__ } from '../hatchApi';

const { parseSseFrame } = __test__;

describe('parseSseFrame — happy paths', () => {
    it('parses a JSON step event from the SSE data: field', () => {
        const frame = 'data: {"kind":"step","step":"passport","state":"in_progress"}';
        expect(parseSseFrame(frame)).toEqual({
            kind: 'step',
            step: 'passport',
            state: 'in_progress',
        });
    });

    it('parses a result event with passport, matrix ID and DM room', () => {
        const frame = [
            'event: result',
            'data: {"kind":"result","passport_number":"ET-12345","matrix_user_id":"@fly:windypro.com","dm_room_id":"!dm:windypro.com","trust_score":88}',
        ].join('\n');
        expect(parseSseFrame(frame)).toEqual({
            kind: 'result',
            passport_number: 'ET-12345',
            matrix_user_id: '@fly:windypro.com',
            dm_room_id: '!dm:windypro.com',
            trust_score: 88,
        });
    });

    it('uses event: name when the JSON payload omits kind', () => {
        const frame = [
            'event: step',
            'data: {"step":"chat","state":"done"}',
        ].join('\n');
        expect(parseSseFrame(frame)).toEqual({
            kind: 'step',
            step: 'chat',
            state: 'done',
        });
    });

    it('parses error events with a message string', () => {
        const frame = 'event: error\ndata: {"kind":"error","message":"Chat service degraded"}';
        expect(parseSseFrame(frame)).toEqual({
            kind: 'error',
            message: 'Chat service degraded',
        });
    });

    it('joins multi-line data: fields before JSON-parsing them', () => {
        const frame = [
            'data: {"kind":"step",',
            'data: "step":"mail","state":"done"}',
        ].join('\n');
        expect(parseSseFrame(frame)).toEqual({
            kind: 'step',
            step: 'mail',
            state: 'done',
        });
    });
});

describe('parseSseFrame — resilience', () => {
    it('returns null for keepalive comments', () => {
        expect(parseSseFrame(': heartbeat')).toBeNull();
    });

    it('returns null for empty frames', () => {
        expect(parseSseFrame('')).toBeNull();
    });

    it('returns null for malformed JSON without an event name', () => {
        expect(parseSseFrame('data: not-json-payload')).toBeNull();
    });

    it('extracts a plain-text error payload when the event name says so', () => {
        const frame = 'event: error\ndata: upstream down';
        expect(parseSseFrame(frame)).toEqual({ kind: 'error', message: 'upstream down' });
    });
});
