/**
 * Chat Tab — native Windy Chat module (Chat-first mobile consolidation).
 *
 * Renders the native chat home screen (src/app/chat/index.tsx): room list,
 * pinned agent DM, user search, unified-login auto-connect, and native
 * push registration. Replaces the previous WebView embed, which pointed at
 * the Synapse host (not the SPA), injected the JWT under a key the web app
 * never read (`windy_auth_token` vs `windy_jwt`), and could never receive
 * native push. The web app at app.windychat.ai remains the browser
 * acquisition bridge; in-app chat is native.
 */
export { default } from '../chat/index';
