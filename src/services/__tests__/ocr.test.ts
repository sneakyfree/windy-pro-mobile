/**
 * Tests for ocr.ts — OCR + translation service
 */

// ── Mocks ─────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../translation', () => ({
    translationService: {
        translate: jest.fn(async (text: string, from: string, to: string) => ({
            translated: `[translated:${text}]`,
            from,
            to,
        })),
    },
}));

jest.mock('@/config/api', () => ({
    ENDPOINTS: { OCR_TRANSLATE: '/api/v1/ocr/translate' },
    apiUrl: jest.fn((path: string) => `https://test.windypro.com${path}`),
    GOOGLE_VISION_API: 'https://vision.googleapis.com/v1/images:annotate',
    GOOGLE_VISION_API_KEY: '',
}));

jest.mock('@/utils/api-error', () => ({
    parseApiError: jest.fn(async (res: any) => new Error(`API Error: ${res.status}`)),
    isAuthError: jest.fn(),
    isRateLimited: jest.fn(),
}));

jest.mock('../logger', () => ({
    createLogger: () => ({
        entry: jest.fn(),
        exit: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { ocrService } from '../ocr';
import { translationService } from '../translation';

// ── Tests ─────────────────────────────────────────────────────

describe('OcrService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    describe('setApiKey', () => {
        it('should set the API key used for cloud OCR', () => {
            // Should not throw
            expect(() => ocrService.setApiKey('test-key-123')).not.toThrow();
        });
    });

    describe('extractText — cloud OCR success', () => {
        it('should return text and bounding boxes from Google Vision', async () => {
            ocrService.setApiKey('valid-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    responses: [
                        {
                            textAnnotations: [
                                { description: 'Hello World' },
                                {
                                    description: 'Hello',
                                    boundingPoly: {
                                        vertices: [
                                            { x: 10, y: 20 },
                                            { x: 100, y: 20 },
                                            { x: 100, y: 50 },
                                            { x: 10, y: 50 },
                                        ],
                                    },
                                },
                            ],
                            fullTextAnnotation: {
                                pages: [
                                    {
                                        confidence: 0.95,
                                        property: {
                                            detectedLanguages: [{ languageCode: 'en' }],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
            });

            const result = await ocrService.extractText('base64imagedata');
            expect(result.text).toBe('Hello World');
            expect(result.confidence).toBe(0.95);
            expect(result.language).toBe('en');
            expect(result.boundingBoxes).toHaveLength(1);
            expect(result.boundingBoxes[0].text).toBe('Hello');
            expect(result.boundingBoxes[0].x).toBe(10);
            expect(result.boundingBoxes[0].width).toBe(90);
        });

        it('should return empty result when no text detected', async () => {
            ocrService.setApiKey('valid-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    responses: [{ textAnnotations: [] }],
                }),
            });

            const result = await ocrService.extractText('empty-image');
            expect(result.text).toBe('');
            expect(result.confidence).toBe(0);
            expect(result.boundingBoxes).toEqual([]);
        });
    });

    describe('extractText — cloud OCR failure with fallback', () => {
        it('should fall back to local OCR when cloud fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
            });

            const result = await ocrService.extractText('base64imagedata');
            // Fallback returns empty result
            expect(result.text).toBe('');
            expect(result.boundingBoxes).toEqual([]);
        });

        it('should fall back on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await ocrService.extractText('base64imagedata');
            expect(result.text).toBe('');
        });
    });

    describe('extractText — missing API key', () => {
        it('should fall back to local OCR when no API key is configured', async () => {
            // Reset API key — cloud OCR should throw, triggering fallback
            ocrService.setApiKey(null as unknown as string);

            const result = await ocrService.extractText('test');

            // With no API key, cloud OCR throws → falls back to empty local OCR result
            expect(result.text).toBe('');
            expect(result.confidence).toBe(0);
        });
    });

    describe('extractAndTranslate', () => {
        it('should extract text and translate it', async () => {
            ocrService.setApiKey('valid-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    responses: [
                        {
                            textAnnotations: [{ description: 'Bonjour' }],
                            fullTextAnnotation: {
                                pages: [
                                    {
                                        confidence: 0.9,
                                        property: {
                                            detectedLanguages: [{ languageCode: 'fr' }],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
            });

            const result = await ocrService.extractAndTranslate('base64', 'en');
            expect(result.original.text).toBe('Bonjour');
            expect(result.fromLang).toBe('fr');
            expect(result.toLang).toBe('en');
            expect(result.translated).toBe('[translated:Bonjour]');
            expect(translationService.translate).toHaveBeenCalledWith('Bonjour', 'fr', 'en');
        });

        it('should return empty translation when no text extracted', async () => {
            ocrService.setApiKey('valid-key');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    responses: [{ textAnnotations: [] }],
                }),
            });

            const result = await ocrService.extractAndTranslate('empty', 'en');
            expect(result.translated).toBe('');
            expect(translationService.translate).not.toHaveBeenCalled();
        });
    });

    describe('translateFromCamera', () => {
        it('should call backend OCR endpoint', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    original_text: 'Hola',
                    translated_text: 'Hello',
                    confidence: 0.88,
                    detected_language: 'es',
                    bounding_boxes: [
                        { text: 'Hola', x: 5, y: 10, width: 50, height: 20 },
                    ],
                }),
            });

            const result = await ocrService.translateFromCamera('frame-base64', 'en');
            expect(result.original.text).toBe('Hola');
            expect(result.translated).toBe('Hello');
            expect(result.fromLang).toBe('es');
            expect(result.original.boundingBoxes).toHaveLength(1);
        });

        it('should fall back to extractAndTranslate on backend failure', async () => {
            // Backend fails
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Internal error' }),
                text: async () => 'Internal error',
            });
            // Cloud OCR also fails → fallback OCR
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
            });

            const result = await ocrService.translateFromCamera('frame', 'en');
            // Falls all the way back to empty
            expect(result.translated).toBe('');
        });
    });
});
