/**
 * 🧬 Tier Access — the ONE place feature/tier gating decisions live (M4).
 *
 * Per the consolidation plan (locked 2026-07-05): every Word feature is
 * wired in code and gated by the account tier — the JWT `tier` claim from
 * the account-server, which identityApi already mirrors into the settings
 * store and licenseService re-verifies on its heartbeat. Free =
 * chat + agent + OS dictation + Windy Nano (the bundled engine). Bigger
 * engines, Translate, Traveler, and cloud STT are honest locked states.
 *
 * NO purchase UI here or in any consumer — IAP posture is Grant-gated.
 * Locked surfaces say "Included with higher Windy tiers" and nothing else.
 */
import type { EngineId } from '@/types';
import { licenseService } from './license';

/** The ONLY copy locked surfaces may show (no prices, no store links). */
export const LOCKED_TIER_LABEL = 'Included with higher Windy tiers';

class TierAccessService {
    /**
     * Voice engines. Windy Nano ('tiny', bundled) is standard for
     * everyone; every other engine — bigger local models and cloud — is
     * a higher-tier feature ('all-engines'). Cloud engines additionally
     * remain subscription-checked server-side (licenseService heartbeat).
     */
    canUseEngine(id: EngineId | string): boolean {
        if (id === 'tiny') return true;
        return licenseService.isFeatureUnlocked('all-engines');
    }

    /** Translate (cloud translation + conversation mode). */
    canUseTranslate(): boolean {
        return licenseService.isFeatureUnlocked('translate-cloud');
    }

    /** Traveler (offline packs / travel translation experience). */
    canUseTraveler(): boolean {
        return licenseService.isFeatureUnlocked('translate-offline')
            || licenseService.isFeatureUnlocked('translate-cloud');
    }

    /**
     * Cloud STT. Wired but double-gated: tier must allow engines beyond
     * Nano AND the server-side subscription check must pass. (The cloud
     * STT backend itself is not live yet — windyword.ai/api is
     * dead-but-green — so this path stays effectively dark until then.)
     */
    canUseCloudStt(): boolean {
        return this.canUseEngine('cloud-standard') && licenseService.isCloudSttEnabled();
    }
}

export const tierAccess = new TierAccessService();
