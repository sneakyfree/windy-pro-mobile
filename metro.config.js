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

module.exports = config;
