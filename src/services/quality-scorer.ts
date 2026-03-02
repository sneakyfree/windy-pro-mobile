/**
 * 🧬 M2.2 — Audio Quality Scorer
 * Comprehensive quality scoring for voice clone pipeline
 *
 * Factors:
 *   1. Duration (longer → better, up to 60s, 20 pts)
 *   2. Sample rate (44100+ → full, 16000+ → partial, 20 pts)
 *   3. Signal level (sweet spot 0.1-0.7, 25 pts)
 *   4. Clipping detection (peak > 0.98, 15 pts)
 *   5. Speech ratio estimation (from avg level, 20 pts)
 *   6. SNR estimation (signal-to-noise in dB)
 *   7. Noise floor estimation
 */
import type { AudioQuality, QualityLabel } from '@/types';

export interface QualityBreakdown {
    quality: AudioQuality;
    factors: {
        duration: number;      // 0-20
        sampleRate: number;    // 0-20
        signalLevel: number;   // 0-25
        noClipping: number;    // 0-15
        speechRatio: number;   // 0-20
    };
    recommendations: string[];
}

/**
 * Score audio quality for clone pipeline tracking
 * This is the primary scorer used after every recording session
 */
export function scoreAudioQuality(
    durationSeconds: number,
    sampleRate: number,
    avgLevel: number,
    peakLevel: number
): AudioQuality {
    const breakdown = analyzeQuality(durationSeconds, sampleRate, avgLevel, peakLevel);
    return breakdown.quality;
}

/**
 * Detailed quality analysis with factor breakdown and recommendations
 */
export function analyzeQuality(
    durationSeconds: number,
    sampleRate: number,
    avgLevel: number,
    peakLevel: number
): QualityBreakdown {
    // Factor 1: Duration (longer is better for clone training, up to 60s)
    const durationFactor = Math.min(20, (Math.max(0, durationSeconds) / 60) * 20);

    // Factor 2: Sample rate
    let sampleRateFactor = 0;
    if (sampleRate >= 44100) sampleRateFactor = 20;
    else if (sampleRate >= 32000) sampleRateFactor = 16;
    else if (sampleRate >= 16000) sampleRateFactor = 10;
    else if (sampleRate >= 8000) sampleRateFactor = 5;

    // Factor 3: Signal level (sweet spot: 0.1 - 0.7)
    let signalLevelFactor = 0;
    if (avgLevel >= 0.1 && avgLevel <= 0.7) signalLevelFactor = 25;
    else if (avgLevel >= 0.05 && avgLevel <= 0.8) signalLevelFactor = 15;
    else if (avgLevel >= 0.02) signalLevelFactor = 8;

    // Factor 4: Clipping detection (peak > 0.98 indicates distortion)
    const hasClipping = peakLevel > 0.98;
    const noClippingFactor = hasClipping ? 0 : 15;

    // Factor 5: Speech ratio estimation
    // Higher average level with reasonable variance → more speech
    const estimatedSpeechRatio = Math.min(1, Math.max(0, avgLevel * 3));
    const speechRatioFactor = estimatedSpeechRatio * 20;

    // Total score (capped at 100)
    const rawScore = durationFactor + sampleRateFactor + signalLevelFactor +
        noClippingFactor + speechRatioFactor;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    // Label classification
    let label: QualityLabel;
    if (score >= 80) label = 'excellent';
    else if (score >= 60) label = 'good';
    else if (score >= 40) label = 'fair';
    else label = 'poor';

    // SNR estimation (dB)
    // Assumes noise floor at ~0.01 level
    const noiseFloor = 0.01;
    const snrDb = avgLevel > noiseFloor
        ? Math.round(20 * Math.log10(avgLevel / noiseFloor) * 10) / 10
        : 0;

    // Generate recommendations
    const recommendations: string[] = [];
    if (durationFactor < 15) recommendations.push('Record for at least 30 seconds for better clone data');
    if (sampleRateFactor < 15) recommendations.push('Use a higher-quality microphone (44.1kHz+)');
    if (signalLevelFactor < 15) recommendations.push('Speak closer to the microphone');
    if (hasClipping) recommendations.push('Reduce input volume — audio is clipping/distorting');
    if (estimatedSpeechRatio < 0.3) recommendations.push('More speech and less silence improves quality');
    if (snrDb < 15) recommendations.push('Find a quieter environment to reduce background noise');

    return {
        quality: {
            score,
            label,
            snrDb,
            speechRatio: estimatedSpeechRatio,
            hasClipping,
            sampleRate,
        },
        factors: {
            duration: Math.round(durationFactor),
            sampleRate: sampleRateFactor,
            signalLevel: signalLevelFactor,
            noClipping: noClippingFactor,
            speechRatio: Math.round(speechRatioFactor),
        },
        recommendations,
    };
}

/**
 * Estimate if a recording is suitable for clone training
 * Returns true if quality meets minimum threshold
 */
export function isCloneUsable(quality: AudioQuality): boolean {
    return quality.score >= 40 && quality.label !== 'poor';
}

/**
 * Get a human-readable quality summary
 */
export function getQualitySummary(quality: AudioQuality): string {
    const emoji: Record<QualityLabel, string> = {
        excellent: '🟢',
        good: '🔵',
        fair: '🟡',
        poor: '🔴',
    };
    return `${emoji[quality.label]} ${quality.label.charAt(0).toUpperCase() + quality.label.slice(1)} (${quality.score}/100) — SNR: ${quality.snrDb.toFixed(1)}dB`;
}
