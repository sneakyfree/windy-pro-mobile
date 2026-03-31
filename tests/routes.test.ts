/**
 * Route Resolution Tests
 * Validates that all critical route files exist in the app/ directory.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_DIR = path.resolve(__dirname, '../src/app');

function routeFileExists(routePath: string): boolean {
    // Expo Router maps routes to files:
    //   /(tabs)         → (tabs)/index.tsx or (tabs)/_layout.tsx
    //   /auth/login     → auth/login.tsx
    //   /session/[id]   → session/[id].tsx
    //   /clone          → clone/index.tsx or clone.tsx
    const candidates = [
        path.join(APP_DIR, routePath + '.tsx'),
        path.join(APP_DIR, routePath, 'index.tsx'),
        path.join(APP_DIR, routePath, '_layout.tsx'),
    ];
    return candidates.some(c => fs.existsSync(c));
}

describe('Route Resolution', () => {
    const criticalRoutes = [
        { route: '/(tabs)', description: 'Tab navigator' },
        { route: '/(tabs)/index', description: 'Record tab (home)' },
        { route: '/(tabs)/settings', description: 'Settings tab' },
        { route: '/(tabs)/camera', description: 'Camera tab' },
        { route: '/(tabs)/history', description: 'History tab' },
        { route: '/(tabs)/chat', description: 'Chat tab' },
        { route: '/(tabs)/clone-data', description: 'Clone data tab' },
        { route: '/auth/login', description: 'Login screen' },
        { route: '/auth/register', description: 'Registration screen' },
        { route: '/translate', description: 'Translate screen' },
        { route: '/session/[id]', description: 'Session detail' },
        { route: '/clone', description: 'Clone dashboard' },
        { route: '/subscription', description: 'Subscription/paywall' },
        { route: '/onboarding', description: 'Onboarding flow' },
    ];

    test.each(criticalRoutes)(
        '$description → $route resolves to a file',
        ({ route }) => {
            expect(routeFileExists(route)).toBe(true);
        }
    );

    test('root layout exists', () => {
        expect(fs.existsSync(path.join(APP_DIR, '_layout.tsx'))).toBe(true);
    });

    test('additional routes resolve', () => {
        const additionalRoutes = [
            '/cloud',
            '/video',
            '/ocr',
            '/quick-translate',
            '/legal/privacy',
            '/legal/terms',
        ];
        for (const route of additionalRoutes) {
            expect(routeFileExists(route)).toBe(true);
        }
    });
});
