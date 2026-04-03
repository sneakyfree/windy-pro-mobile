/**
 * 🧬 Ecosystem Status Service
 * Fetches the unified Windy identity status across all products.
 * One login → everything accessible.
 */
import { cloudApi } from './cloudApi';
import { ENDPOINTS, apiUrl } from '@/config/api';
import { fetchWithTimeout } from '@/utils/fetch-timeout';
import { createLogger } from './logger';

const log = createLogger('EcosystemStatus');

// ─── Types ──────────────────────────────────────────────────────

export type ProductStatus = 'active' | 'pending' | 'not_provisioned' | 'upgrade_required' | 'available';

export interface EcosystemProduct {
    status: ProductStatus;
    detail?: string;
    matrix_user_id?: string;   // Windy Fly agent's Matrix user ID
    agent_name?: string;       // Windy Fly agent display name
    passport_id?: string;      // Eternitas passport ID (ET-XXXXX)
    room_id?: string;          // Pre-created DM room ID
}

export interface EcosystemStatus {
    windy_identity_id: string;
    email: string;
    tier: string;
    creator_name?: string;  // Display name from Pro (may be added by backend)
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
    { key: 'windy_chat', emoji: '💬', label: 'Windy Chat', route: '/(tabs)/chat', cta: 'Open' },
    { key: 'windy_mail', emoji: '📧', label: 'Windy Mail', externalUrl: 'https://windypro.thewindstorm.uk/app/mail', cta: 'Open Inbox' },
    { key: 'windy_fly', emoji: '🪰', label: 'Windy Fly', route: '/(tabs)/chat', cta: 'Chat with Agent' },
    { key: 'windy_cloud', emoji: '☁️', label: 'Windy Cloud', externalUrl: 'https://windypro.thewindstorm.uk/app/cloud', cta: 'View Files' },
    { key: 'windy_clone', emoji: '🧬', label: 'Windy Clone', route: '/(tabs)/clone-data', cta: 'View Progress' },
    { key: 'windy_traveler', emoji: '🌍', label: 'Windy Traveler', route: '/market', cta: 'Browse Pairs' },
    { key: 'eternitas', emoji: '🪪', label: 'Eternitas', externalUrl: 'https://windypro.thewindstorm.uk/app/passport', cta: 'View Passport' },
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

        const res = await fetchWithTimeout(apiUrl(ENDPOINTS.ECOSYSTEM_STATUS), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            log.warn('getEcosystemStatus', `Failed with status ${res.status}`);
            return null;
        }

        const result = await res.json();

        // Defensive: fill in missing products with default status
        // If Pro adds/removes a product key, mobile won't crash
        const defaults: EcosystemStatus['products'] = {
            windy_word: { status: 'not_provisioned' },
            windy_chat: { status: 'not_provisioned' },
            windy_mail: { status: 'not_provisioned' },
            windy_cloud: { status: 'not_provisioned' },
            windy_fly: { status: 'not_provisioned' },
            windy_clone: { status: 'not_provisioned' },
            windy_traveler: { status: 'not_provisioned' },
            eternitas: { status: 'not_provisioned' },
        };

        return {
            ...result,
            products: { ...defaults, ...result.products },
        };
    } catch (err) {
        log.warn('getEcosystemStatus', 'Failed to fetch ecosystem status');
        return null;
    }
}
