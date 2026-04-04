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

export type ProductStatus = 'active' | 'pending' | 'not_provisioned' | 'upgrade_required' | 'available' | 'unhealthy' | 'offline';

export interface EcosystemProduct {
    status: ProductStatus;
    detail?: string;
    healthy?: boolean;             // Service health check result
    matrix_user_id?: string;       // Windy Chat user's Matrix ID
    agent_name?: string;           // Windy Fly agent display name
    agent_status?: string;         // Windy Fly agent status (running/sleeping/etc.)
    agent_vps?: string;            // Windy Fly VPS location (e.g. "eu-west-1")
    passport_id?: string;          // Eternitas passport ID (ET-XXXXX)
    trust_score?: number;          // Eternitas trust/integrity score (0-100)
    clearance_level?: number;      // Eternitas clearance level (1-5)
    room_id?: string;              // Pre-created DM room ID
    email_address?: string;        // Windy Mail address (user@windymail.ai)
    storage_used_bytes?: number;   // Windy Cloud storage used
    storage_limit_bytes?: number;  // Windy Cloud storage limit
    online?: boolean;              // Chat online/offline presence
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
    { key: 'windy_mail', emoji: '📧', label: 'Windy Mail', route: '/mail', cta: 'Open Inbox' },
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
        case 'unhealthy': return 'Degraded';
        case 'pending': return 'Setting up...';
        case 'not_provisioned': return 'Not set up';
        case 'upgrade_required': return 'Upgrade required';
        case 'available': return 'Available';
        case 'offline': return 'Offline';
        default: return 'Unknown';
    }
}

export function getStatusColor(status: ProductStatus): string {
    switch (status) {
        case 'active': return '#a3e635';       // lime
        case 'unhealthy': return '#facc15';    // yellow warning
        case 'pending': return '#facc15';      // yellow
        case 'not_provisioned': return '#64748b'; // slate
        case 'upgrade_required': return '#f97316'; // orange
        case 'available': return '#60a5fa';    // blue
        case 'offline': return '#94a3b8';      // gray
        default: return '#64748b';
    }
}

export function getStatusIcon(status: ProductStatus): string {
    switch (status) {
        case 'active': return '\u2705';         // green checkmark
        case 'unhealthy': return '\u26A0\uFE0F'; // warning
        case 'pending': return '\u23F3';        // hourglass
        case 'not_provisioned': return '\u2795'; // plus
        case 'upgrade_required': return '\uD83D\uDD12'; // lock
        case 'available': return '\u2B50';      // star
        case 'offline': return '\u26AB';        // black circle
        default: return '\u2753';               // question mark
    }
}

/**
 * Get service-specific subtitle for the ecosystem card.
 */
export function getProductSubtitle(key: keyof EcosystemStatus['products'], product: EcosystemProduct): string | null {
    if (product.status === 'not_provisioned' || product.status === 'offline') return null;

    switch (key) {
        case 'windy_chat':
            if (product.matrix_user_id) {
                return `${product.matrix_user_id}${product.online === false ? ' (offline)' : ''}`;
            }
            return product.online === false ? 'Offline' : null;
        case 'windy_mail':
            return product.email_address || null;
        case 'windy_cloud':
            if (product.storage_used_bytes != null && product.storage_limit_bytes) {
                const used = formatStorageBytes(product.storage_used_bytes);
                const limit = formatStorageBytes(product.storage_limit_bytes);
                return `${used} / ${limit}`;
            }
            return null;
        case 'eternitas':
            if (product.passport_id) {
                const parts = [product.passport_id];
                if (product.trust_score != null) parts.push(`Trust: ${product.trust_score}%`);
                if (product.clearance_level != null) parts.push(`CL-${product.clearance_level}`);
                return parts.join(' \u00B7 ');
            }
            return null;
        case 'windy_fly':
            if (product.agent_name) {
                const parts = [product.agent_name];
                if (product.agent_status) parts.push(product.agent_status);
                if (product.agent_vps) parts.push(product.agent_vps);
                return parts.join(' \u00B7 ');
            }
            return null;
        default:
            return product.detail || null;
    }
}

function formatStorageBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

        // Post-process: if healthy field is explicitly false, override to 'unhealthy'
        const products = { ...defaults, ...result.products };
        for (const key of Object.keys(products) as (keyof typeof products)[]) {
            const p = products[key];
            if (p.status === 'active' && p.healthy === false) {
                products[key] = { ...p, status: 'unhealthy' };
            }
        }

        return {
            ...result,
            products,
        };
    } catch (err) {
        log.warn('getEcosystemStatus', 'Failed to fetch ecosystem status');
        return null;
    }
}
