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

// SDK 54 web bundling: expo-sqlite/web/worker.ts imports wa-sqlite.wasm
// which Metro web doesn't handle as a source module by default. Treating
// .wasm as a static asset lets Metro emit a URL handle instead of trying
// to parse the binary as JS.
config.resolver.assetExts = [
    ...config.resolver.assetExts,
    'wasm',
];

// ─── Exclude @matrix-org/olm from bundling ─────────────────────
// Olm is a Node.js/WASM module that requires `crypto`, `path`, `fs`.
// chatClient.ts uses a runtime require() inside try/catch — if Olm isn't
// available at runtime, E2E encryption is gracefully disabled.
// SDK 54+ Metro is stricter: combining blockList regexes with mismatched
// flags throws "Cannot combine blockList patterns". exclusionList() merges
// our exclusions with Metro's defaults under a single normalized flag set.
const exclusionList = require('metro-config/private/defaults/exclusionList').default;
config.resolver.blockList = exclusionList([
    /node_modules\/@matrix-org\/olm\/.*/,
]);

module.exports = config;
