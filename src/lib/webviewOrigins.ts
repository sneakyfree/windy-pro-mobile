/**
 * WebView origin scoping helpers.
 *
 * Mobile WebViews that inject the account-server JWT into localStorage must
 * only render pages on our own origins. If a WebView follows a redirect to
 * a third-party domain, the injected token is readable from that page's JS
 * context and can be exfiltrated.
 *
 * react-native-webview's `originWhitelist` gates *navigations* (not resource
 * loads). Our pattern:
 *
 *   1. Derive the primary host from the config URL (e.g. WINDY_CHAT_WEBVIEW_URL).
 *   2. Whitelist only that exact origin (plus `http://localhost*` in dev).
 *   3. Any off-domain click — external link inside a chat message, say —
 *      is caught by `onShouldStartLoadWithRequest` and handed to
 *      `Linking.openURL` so it opens in the system browser instead of
 *      loading in-WebView.
 */
import { Linking } from 'react-native';
import type { WebViewNavigation } from 'react-native-webview';

/**
 * Build the `originWhitelist` prop for a WebView that should only render
 * `primaryUrl` (and localhost during development).
 */
export function buildOriginWhitelist(primaryUrl: string): string[] {
    const list: string[] = [];
    try {
        const parsed = new URL(primaryUrl);
        list.push(`${parsed.protocol}//${parsed.host}`);
    } catch { /* fall through — whitelist stays empty, blocking everything */ }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // dev Metro proxies for the chat + mail SPAs
        list.push('http://localhost:3000');
        list.push('http://localhost:5173');
    }
    return list;
}

/**
 * Build an `onShouldStartLoadWithRequest` handler that:
 *   - Returns true for URLs whose origin matches one of `allowedOrigins`
 *     OR for non-http(s) schemes (e.g. `about:blank`, `mailto:`, `tel:`,
 *     `blob:` — the WebView handles these itself).
 *   - For everything else, opens the URL in the system browser and
 *     returns false so the WebView does NOT navigate.
 */
export function buildNavigationGuard(
    allowedOrigins: string[],
): (req: WebViewNavigation) => boolean {
    return (req) => {
        const url = req.url || '';
        if (!/^https?:\/\//i.test(url)) return true;
        try {
            const parsed = new URL(url);
            const origin = `${parsed.protocol}//${parsed.host}`;
            if (allowedOrigins.includes(origin)) return true;
        } catch { /* malformed URL — treat as external */ }
        Linking.openURL(url).catch(() => { /* ignore — user dismissed */ });
        return false;
    };
}
