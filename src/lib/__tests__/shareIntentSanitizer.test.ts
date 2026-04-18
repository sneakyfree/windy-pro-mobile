/**
 * Unit tests for share-intent sanitizers.
 */
jest.mock('@/utils/validation', () => ({
    sanitizeText: (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim(),
    INPUT_LIMITS: { TRANSLATE_TEXT: 2000 },
}));

import { sanitizeSharedUrl, sanitizeSharedText } from '../shareIntentSanitizer';

describe('sanitizeSharedUrl', () => {
    it('accepts https URLs', () => {
        expect(sanitizeSharedUrl('https://example.com/hello')).toBe('https://example.com/hello');
    });
    it('accepts http URLs', () => {
        expect(sanitizeSharedUrl('http://example.com/')).toBe('http://example.com/');
    });
    it('rejects javascript: URLs', () => {
        expect(sanitizeSharedUrl('javascript:alert(1)')).toBeNull();
    });
    it('rejects data: URLs', () => {
        expect(sanitizeSharedUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });
    it('rejects file: URLs', () => {
        expect(sanitizeSharedUrl('file:///etc/passwd')).toBeNull();
    });
    it('rejects intent:// URLs', () => {
        expect(sanitizeSharedUrl('intent://scan/#Intent;scheme=zxing;end')).toBeNull();
    });
    it('rejects non-strings', () => {
        expect(sanitizeSharedUrl(null)).toBeNull();
        expect(sanitizeSharedUrl(undefined)).toBeNull();
        expect(sanitizeSharedUrl(42 as unknown)).toBeNull();
        expect(sanitizeSharedUrl({ url: 'https://x' } as unknown)).toBeNull();
    });
    it('rejects empty string', () => {
        expect(sanitizeSharedUrl('')).toBeNull();
        expect(sanitizeSharedUrl('   ')).toBeNull();
    });
    it('rejects malformed URLs', () => {
        expect(sanitizeSharedUrl('not a url')).toBeNull();
        expect(sanitizeSharedUrl('https://[bad-url')).toBeNull();
    });
    it('rejects overlong URLs (>2048 chars)', () => {
        expect(sanitizeSharedUrl('https://example.com/' + 'a'.repeat(3000))).toBeNull();
    });
});

describe('sanitizeSharedText', () => {
    it('accepts normal text', () => {
        expect(sanitizeSharedText('hello world')).toBe('hello world');
    });
    it('strips control characters', () => {
        expect(sanitizeSharedText('hello\x00\x1fworld')).toBe('helloworld');
    });
    it('truncates to INPUT_LIMITS.TRANSLATE_TEXT', () => {
        const r = sanitizeSharedText('a'.repeat(3000));
        expect(r?.length).toBe(2000);
    });
    it('returns null for empty', () => {
        expect(sanitizeSharedText('')).toBeNull();
        expect(sanitizeSharedText('    ')).toBeNull();
    });
    it('returns null for non-strings', () => {
        expect(sanitizeSharedText(null)).toBeNull();
        expect(sanitizeSharedText(42 as unknown)).toBeNull();
    });
});
