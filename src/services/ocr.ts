/**
 * 🧬 OCR Translation Service
 * Captures images from camera and sends to Google Cloud Vision / local OCR
 * for text extraction, then routes to translation service
 */

import { translationService } from './translation';
import { ENDPOINTS, apiUrl } from '@/config/api';
import { parseApiError, isAuthError, isRateLimited } from '@/utils/api-error';
import { createLogger } from './logger';

const log = createLogger('OCR');

const OCR_API = 'https://vision.googleapis.com/v1/images:annotate';

export interface OcrResult {
    text: string;
    confidence: number;
    boundingBoxes: Array<{
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
    language?: string;
}

export interface OcrTranslation {
    original: OcrResult;
    translated: string;
    fromLang: string;
    toLang: string;
}

class OcrService {
    private apiKey: string | null = null;

    /**
     * Extract text from a base64-encoded image
     */
    async extractText(base64Image: string): Promise<OcrResult> {
        // Try cloud OCR first
        try {
            return await this.cloudOcr(base64Image);
        } catch (error: unknown) {
            log.warn('Cloud_OCR_failed_using_fallbac', 'Cloud OCR failed, using fallback', error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) });
            return this.fallbackOcr(base64Image);
        }
    }

    /**
     * Extract text and translate in one step
     */
    async extractAndTranslate(
        base64Image: string,
        targetLang: string
    ): Promise<OcrTranslation> {
        const ocrResult = await this.extractText(base64Image);

        if (!ocrResult.text.trim()) {
            return {
                original: ocrResult,
                translated: '',
                fromLang: 'unknown',
                toLang: targetLang,
            };
        }

        const fromLang = ocrResult.language || 'en';
        const translation = await translationService.translate(
            ocrResult.text,
            fromLang,
            targetLang
        );

        return {
            original: ocrResult,
            translated: translation.translated,
            fromLang,
            toLang: targetLang,
        };
    }

    /**
     * Camera OCR via backend — POST /api/ocr/translate
     * Returns translated bounding boxes for overlay
     */
    async translateFromCamera(
        base64Frame: string,
        targetLang: string
    ): Promise<OcrTranslation> {
        try {
            const response = await fetch(apiUrl(ENDPOINTS.OCR_TRANSLATE), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Frame,
                    target_lang: targetLang,
                }),
            });

            if (!response.ok) {
                const apiErr = await parseApiError(response);
                throw apiErr;
            }

            const data = await response.json();

            return {
                original: {
                    text: data.original_text || '',
                    confidence: data.confidence || 0.9,
                    boundingBoxes: (data.bounding_boxes || []).map((b: any) => ({
                        text: b.text,
                        x: b.x,
                        y: b.y,
                        width: b.width,
                        height: b.height,
                    })),
                    language: data.detected_language,
                },
                translated: data.translated_text || '',
                fromLang: data.detected_language || 'en',
                toLang: targetLang,
            };
        } catch (err: unknown) {
            log.warn('Backend_OCR_failed_falling_bac', 'Backend OCR failed, falling back to local', err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
            return this.extractAndTranslate(base64Frame, targetLang);
        }
    }

    /**
     * Cloud OCR via Google Vision API
     */
    private async cloudOcr(base64Image: string): Promise<OcrResult> {
        const response = await fetch(
            `${OCR_API}?key=${this.apiKey || 'DEMO_KEY'}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requests: [
                        {
                            image: { content: base64Image },
                            features: [
                                { type: 'TEXT_DETECTION', maxResults: 10 },
                                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
                            ],
                        },
                    ],
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Cloud OCR failed: ${response.status}`);
        }

        const data = await response.json();
        const annotations = data.responses?.[0]?.textAnnotations || [];
        const fullText = data.responses?.[0]?.fullTextAnnotation;
        const detectedLang =
            fullText?.pages?.[0]?.property?.detectedLanguages?.[0]?.languageCode;

        if (annotations.length === 0) {
            return { text: '', confidence: 0, boundingBoxes: [], language: undefined };
        }

        const boundingBoxes = annotations.slice(1).map((a: any) => {
            const vertices = a.boundingPoly?.vertices || [];
            const xs = vertices.map((v: any) => v.x || 0);
            const ys = vertices.map((v: any) => v.y || 0);
            return {
                text: a.description,
                x: Math.min(...xs),
                y: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys),
            };
        });

        return {
            text: annotations[0].description || '',
            confidence: fullText?.pages?.[0]?.confidence || 0.9,
            boundingBoxes,
            language: detectedLang,
        };
    }

    /**
     * Fallback: simple on-device text extraction stub
     * In production, would use ML Kit or Tesseract
     */
    private async fallbackOcr(base64Image: string): Promise<OcrResult> {
        return {
            text: '',
            confidence: 0,
            boundingBoxes: [],
            language: undefined,
        };
    }

    /**
     * Set API key for cloud OCR
     */
    setApiKey(key: string) {
        this.apiKey = key;
    }
}

export const ocrService = new OcrService();
