/**
 * 🧬 Ecosystem Status Service
 * Fetches the unified Windy identity status across all products.
 * One login → everything accessible.
 */
import { cloudApi } from './cloudApi';
import { ENDPOINTS, apiUrl } from '@/config/api';
import { createLogger } from './logger';

const log = createLogger('EcosystemStatus');

// ─── Types ──────────────────────────────────────────────────────

export type ProductStatus = 'active' | 'pending' | 'not_provisioned' | 'upgrade_required' | 'available';

export interface EcosystemProduct {
    status: ProductStatus;
    detail?: string;
}

export interface EcosystemStatus {
    windy_identity_id: string;
    email: string;
    tier: string;
    products: {
        windy_word: EcosystemProduct;
        windy_chat: EcosystemProduct;
        windy_mail: EcosystemProduct;
        windy_cloud: EcosystemProduct;
        windy_fly: EcosystemProduct;
        windy_clone: EcosystemProduct;
        windy_traveler: EcosystemProduct;
        eternitas: EcosystemProduct;
    };
}

// ─── Product Display Config ─────────────────────────────────────

export interface ProductDisplayInfo {
    key: keyof EcosystemStatus['products'];
    emoji: string;
    label: string;
    route?: string;         // In-app route (router.push)
    externalUrl?: string;   // External URL (Linking.openURL)
    cta: string;            // Button text when not provisioned
}

export const PRODUCT_DISPLAY: ProductDisplayInfo[] = [
    { key: 'windy_word', emoji: '🎙️', label: 'Windy Word', route: '/(tabs)', cta: 'Open' },
    { key: 'windy_chat', emoji: '💬', label: 'Windy Chat', route: '/(tabs)/chat', cta: 'Set up' },
    { key: 'windy_mail', emoji: '📧', label: 'Windy Mail', externalUrl: 'https://windymail.ai', cta: 'Set up' },
    { key: 'windy_cloud', emoji: '☁️', label: 'Windy Cloud', route: '/cloud', cta: 'Set up' },
    { key: 'windy_fly', emoji: '🪰', label: 'Windy Fly', externalUrl: 'https://windyfly.ai', cta: 'Hatch your AI agent' },
    { key: 'windy_clone', emoji: '🧬', label: 'Windy Clone', route: '/(tabs)/clone-data', cta: 'Start recording' },
    { key: 'windy_traveler', emoji: '🌍', label: 'Windy Traveler', route: '/(tabs)/market', cta: 'Browse pairs' },
    { key: 'eternitas', emoji: '🪪', label: 'Eternitas', externalUrl: 'https://eternitas.ai', cta: 'Register' },
];

// ─── Status Label Helpers ───────────────────────────────────────

export function getStatusLabel(status: ProductStatus, detail?: string): string {
    switch (status) {
        case 'active': return detail || 'Active';
        case 'pending': return 'Setting up...';
        case 'not_provisioned': return 'Not set up';
        case 'upgrade_required': return 'Upgrade required';
        case 'available': return 'Available';
        default: return 'Unknown';
    }
}

export function getStatusColor(status: ProductStatus): string {
    switch (status) {
        case 'active': return '#a3e635';       // lime
        case 'pending': return '#facc15';      // yellow
        case 'not_provisioned': return '#64748b'; // slate
        case 'upgrade_required': return '#f97316'; // orange
        case 'available': return '#60a5fa';    // blue
        default: return '#64748b';
    }
}

// ─── API Call ───────────────────────────────────────────────────

export async function getEcosystemStatus(): Promise<EcosystemStatus | null> {
    try {
        const token = cloudApi.getToken();
        if (!token) return null;

        const res = await fetch(apiUrl(ENDPOINTS.ECOSYSTEM_STATUS), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            log.warn('getEcosystemStatus', `Failed with status ${res.status}`);
            return null;
        }

        return await res.json();
    } catch (err) {
        log.warn('getEcosystemStatus', 'Failed to fetch ecosystem status');
        return null;
    }
}
