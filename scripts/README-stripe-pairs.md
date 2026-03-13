# Stripe Pair Product Setup

Creates Stripe products and prices for every translation pair and bundle in the Windy Pro marketplace.

## Prerequisites

- **Node.js** ≥ 18
- `npm install` (installs the `stripe` devDependency)
- A Stripe secret key (`sk_test_…` for test mode, `sk_live_…` for production)

## Quick Start

```bash
# Dry run — see what would be created, no API calls
STRIPE_SECRET_KEY=sk_test_… node scripts/create-stripe-pair-products.js --dry-run

# Create products + prices in Stripe
STRIPE_SECRET_KEY=sk_test_… node scripts/create-stripe-pair-products.js

# Create AND write price IDs back to JSON files
STRIPE_SECRET_KEY=sk_test_… node scripts/create-stripe-pair-products.js --update
```

## What It Creates

For each **translation pair** in `shared/pair-catalog.json` that has no `stripePriceId`:

| Stripe Object | Details |
|---------------|---------|
| Product | `name`: "Windy Pro — English ↔ Spanish Engine", `metadata.pairId`, `metadata.type = 'translation_pair'` |
| Price | `unit_amount`: pair's `price × 100` (e.g. $6.99 → 699), `currency: 'usd'` |

For each **bundle** in `shared/pair-bundles.json` that has no `stripePriceId`:

| Stripe Object | Details |
|---------------|---------|
| Product | `name`: "Windy Pro — Traveler Bundle (25 pairs)", `metadata.bundleId`, `metadata.type = 'translation_bundle'` |
| Price | `unit_amount`: bundle's `price × 100` (e.g. $49 → 4900), `currency: 'usd'` |

## Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Print what would be created without making any Stripe API calls |
| `--update` | After creation, write the new `stripePriceId` values back into the JSON files |

## Re-running / Idempotency

The script skips any entry that already has a `stripePriceId`. This means you can safely re-run it after adding new pairs to the catalog — only the new ones will get Stripe products.

## Adding New Pairs Later

1. Add the new pair object to `shared/pair-catalog.json` (no `stripePriceId` field).
2. Run the script with `--update`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_… node scripts/create-stripe-pair-products.js --update
   ```
3. The new pair will get a Stripe product + price, and its `stripePriceId` will be saved.

## Output

The script prints a summary at the end:

```
📊  Summary
   X/50 pairs have price IDs
   X/3 bundles have price IDs
```
