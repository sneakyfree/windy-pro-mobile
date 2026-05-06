#!/usr/bin/env node
/**
 * Stripe Product & Price Creator for Windy Word Pair Marketplace
 * DNA Strand L4
 *
 * Reads shared/pair-catalog.json and shared/pair-bundles.json,
 * then creates Stripe products + prices for each entry that lacks a stripePriceId.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-pair-products.js
 *
 * Options:
 *   --dry-run   Show what would be created without making API calls
 *   --update    Write price IDs back to the JSON files after creation
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const CATALOG_PATH = path.resolve(__dirname, '..', 'shared', 'pair-catalog.json');
const BUNDLES_PATH = path.resolve(__dirname, '..', 'shared', 'pair-bundles.json');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const UPDATE  = args.includes('--update');

// ---------------------------------------------------------------------------
// Stripe client
// ---------------------------------------------------------------------------
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY && !DRY_RUN) {
  console.error('❌  STRIPE_SECRET_KEY environment variable is required (or use --dry-run).');
  process.exit(1);
}

let stripe;
if (!DRY_RUN) {
  const Stripe = require('stripe');
  stripe = new Stripe(STRIPE_KEY);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a human-readable product name for a translation pair.
 * e.g. "Windy Word — English ↔ Spanish Engine"
 */
function pairProductName(pair) {
  return `Windy Word — ${pair.sourceName} ↔ ${pair.targetName} Engine`;
}

/**
 * Build a human-readable product name for a bundle.
 * e.g. "Windy Word — Traveler Bundle (25 pairs)"
 */
function bundleProductName(bundle) {
  const pairLabel = bundle.pairCount === -1 ? 'Unlimited' : `${bundle.pairCount} pairs`;
  return `Windy Word — ${bundle.name} Bundle (${pairLabel})`;
}

/**
 * Create a Stripe product + price and return the price ID.
 */
async function createProductAndPrice({ name, unitAmount, metadata }) {
  if (DRY_RUN) {
    console.log(`   [DRY-RUN] Would create product "${name}" @ $${(unitAmount / 100).toFixed(2)}`);
    return 'price_dry_run_placeholder';
  }

  const product = await stripe.products.create({
    name,
    metadata,
  });
  console.log(`   ✅ Product created: ${product.id} — "${name}"`);

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: unitAmount,
    currency: 'usd',
  });
  console.log(`   ✅ Price created:   ${price.id} @ $${(unitAmount / 100).toFixed(2)}`);

  return price.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('');
  console.log('🚀  Windy Word — Stripe Pair Marketplace Product Creator');
  console.log('─'.repeat(56));
  if (DRY_RUN) console.log('⚠️   Running in DRY-RUN mode — no Stripe calls will be made.\n');
  if (UPDATE)  console.log('📝  --update flag set — JSON files will be updated with price IDs.\n');

  // Load data
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const bundles = JSON.parse(fs.readFileSync(BUNDLES_PATH, 'utf-8'));

  // ── Pairs ──────────────────────────────────────────────────────────────
  let pairsCreated = 0;
  const pairsWithPriceId = [];

  console.log(`\n📦  Processing ${catalog.length} translation pairs…\n`);

  for (const pair of catalog) {
    if (pair.stripePriceId) {
      pairsWithPriceId.push(pair.id);
      console.log(`   ⏭️  ${pair.id} — already has stripePriceId (${pair.stripePriceId})`);
      continue;
    }

    const name = pairProductName(pair);
    const unitAmount = Math.round(pair.price * 100); // e.g. 6.99 → 699

    try {
      const priceId = await createProductAndPrice({
        name,
        unitAmount,
        metadata: {
          pairId: pair.id,
          type: 'translation_pair',
          source: pair.source,
          target: pair.target,
        },
      });

      pair.stripePriceId = priceId;
      pairsWithPriceId.push(pair.id);
      pairsCreated++;
    } catch (err) {
      console.error(`   ❌ Failed to create product for ${pair.id}: ${err.message}`);
    }
  }

  // ── Bundles ────────────────────────────────────────────────────────────
  let bundlesCreated = 0;
  const bundlesWithPriceId = [];

  console.log(`\n📦  Processing ${bundles.length} bundles…\n`);

  for (const bundle of bundles) {
    if (bundle.stripePriceId) {
      bundlesWithPriceId.push(bundle.id);
      console.log(`   ⏭️  ${bundle.id} — already has stripePriceId (${bundle.stripePriceId})`);
      continue;
    }

    const name = bundleProductName(bundle);
    const unitAmount = Math.round(bundle.price * 100); // e.g. 49 → 4900

    try {
      const priceId = await createProductAndPrice({
        name,
        unitAmount,
        metadata: {
          bundleId: bundle.id,
          type: 'translation_bundle',
          pairCount: String(bundle.pairCount),
        },
      });

      bundle.stripePriceId = priceId;
      bundlesWithPriceId.push(bundle.id);
      bundlesCreated++;
    } catch (err) {
      console.error(`   ❌ Failed to create product for ${bundle.id}: ${err.message}`);
    }
  }

  // ── Write back ─────────────────────────────────────────────────────────
  if (UPDATE) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');
    console.log(`\n📝  Updated ${CATALOG_PATH}`);

    fs.writeFileSync(BUNDLES_PATH, JSON.stringify(bundles, null, 2) + '\n', 'utf-8');
    console.log(`📝  Updated ${BUNDLES_PATH}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(56));
  console.log(`📊  Summary`);
  console.log(`   ${pairsWithPriceId.length}/${catalog.length} pairs have price IDs`);
  console.log(`   ${bundlesWithPriceId.length}/${bundles.length} bundles have price IDs`);

  if (pairsCreated || bundlesCreated) {
    console.log(`   ✨ Created ${pairsCreated} pair product(s) and ${bundlesCreated} bundle product(s) this run.`);
  }
  if (!UPDATE && (pairsCreated || bundlesCreated)) {
    console.log(`\n   💡 Tip: Re-run with --update to write price IDs back to the JSON files.`);
  }

  console.log('');
}

main().catch((err) => {
  console.error('\n💥  Unexpected error:', err);
  process.exit(1);
});
