// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ─── Fix uuid ESM resolution ────────────────────────────────────
// matrix-js-sdk bundles uuid@13 which only exports via `exports` map
// (no `main` field). Metro doesn't resolve `exports` correctly,
// so we redirect uuid imports to the dist-node CJS entry.
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    uuid: path.resolve(__dirname, 'node_modules/uuid'),
};

// Ensure Metro can resolve .cjs files from uuid
config.resolver.sourceExts = [
    ...config.resolver.sourceExts,
    'cjs',
];

module.exports = config;
