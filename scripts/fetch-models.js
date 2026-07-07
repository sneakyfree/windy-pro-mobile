#!/usr/bin/env node
/**
 * Fetch the bundled Windy Nano model (whisper.cpp ggml-tiny-q5_1, ~31 MB).
 *
 * The model ships INSIDE the app ("Windy Nano — standard for everyone",
 * consolidation plan 2026-07-05) but 31 MB of weights doesn't belong in
 * git. This script downloads it to src/assets/models/ (gitignored) with
 * a pinned SHA-256. It runs from npm `postinstall`, which covers both
 * local dev installs and EAS cloud builds; Metro then bundles the file
 * as a static asset via require().
 *
 * Skip with WINDY_SKIP_MODEL_FETCH=1 (e.g. docs-only CI).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const MODEL = {
  name: 'ggml-tiny-q5_1.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin',
  sha256: null, // pinned after first verified fetch — see PIN file next to the model
  minBytes: 30_000_000,
  maxBytes: 40_000_000,
};

const destDir = path.join(__dirname, '..', 'src', 'assets', 'models');
const dest = path.join(destDir, MODEL.name);
const pinFile = path.join(__dirname, 'model-pins.json');

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function download(url, to, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'windy-pro-mobile/fetch-models' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, to, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const tmp = to + '.part';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, to); resolve(); }));
      out.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  if (process.env.WINDY_SKIP_MODEL_FETCH === '1') {
    console.log('[fetch-models] skipped (WINDY_SKIP_MODEL_FETCH=1)');
    return;
  }
  const pins = fs.existsSync(pinFile) ? JSON.parse(fs.readFileSync(pinFile, 'utf8')) : {};
  const pinned = pins[MODEL.name] || MODEL.sha256;

  if (fs.existsSync(dest)) {
    const size = fs.statSync(dest).size;
    if (size >= MODEL.minBytes && size <= MODEL.maxBytes && (!pinned || sha256(dest) === pinned)) {
      console.log(`[fetch-models] ${MODEL.name} present (${(size / 1e6).toFixed(1)} MB) — ok`);
      return;
    }
    console.log(`[fetch-models] ${MODEL.name} present but failed verification — refetching`);
    fs.unlinkSync(dest);
  }

  fs.mkdirSync(destDir, { recursive: true });
  console.log(`[fetch-models] downloading ${MODEL.name} …`);
  await download(MODEL.url, dest);

  const size = fs.statSync(dest).size;
  if (size < MODEL.minBytes || size > MODEL.maxBytes) {
    fs.unlinkSync(dest);
    throw new Error(`[fetch-models] unexpected size ${size} for ${MODEL.name}`);
  }
  const digest = sha256(dest);
  if (pinned && digest !== pinned) {
    fs.unlinkSync(dest);
    throw new Error(`[fetch-models] SHA-256 mismatch for ${MODEL.name}: got ${digest}`);
  }
  if (!pinned) {
    pins[MODEL.name] = digest;
    fs.writeFileSync(pinFile, JSON.stringify(pins, null, 2) + '\n');
    console.log(`[fetch-models] pinned ${MODEL.name} sha256=${digest}`);
  }
  console.log(`[fetch-models] ${MODEL.name} ready (${(size / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
