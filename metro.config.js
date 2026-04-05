// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable package.json "exports" field resolution (needed for uuid v13+ ESM-only packages)
config.resolver.unstable_enablePackageExports = true;

// ─── Fix uuid ESM resolution (fallback) ─────────────────────────
// matrix-js-sdk bundles uuid@13 which only exports via `exports` map
// (no `main` field). Redirect uuid imports as a fallback.
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    uuid: path.resolve(__dirname, 'node_modules/uuid'),
};

// Ensure Metro can resolve .cjs files from uuid
config.resolver.sourceExts = [
    ...config.resolver.sourceExts,
    'cjs',
];

// ─── Exclude @matrix-org/olm from bundling ─────────────────────
// Olm is a Node.js/WASM module that requires `crypto`, `path`, `fs`.
// chatClient.ts uses a runtime require() inside try/catch — if Olm isn't
// available at runtime, E2E encryption is gracefully disabled.
// For native builds, Olm must be provided via a native module bridge.
config.resolver.blockList = [
    ...(config.resolver.blockList ? [config.resolver.blockList] : []),
    /node_modules\/@matrix-org\/olm\/.*/,
];

module.exports = config;
