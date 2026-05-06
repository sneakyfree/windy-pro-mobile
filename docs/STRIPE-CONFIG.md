# STRIPE-CONFIG.md — Payment & Monetization Configuration

## Stripe Account

| Field | Value |
|-------|-------|
| Account | WindyPro Sandbox |
| Account ID | acct_1T5nu2BXIOBasDQi |
| Mode | **TEST** (switch to live before launch) |
| Publishable Key | pk_test_51T5nu2BXIOBasDQiC2i6QgA774AU5IYq4GLVJolubhNmSwGkN82BTGwY3rjnb3gexTbzttkzgOnZYZ7l82EP5dGG00AzhmNIEZ |
| Secret Key | sk_test_51T5nu2BXIOBasDQiLItF0DhS8A49YClDwdiiYYv1LsTlij5SeU4HgLAn2fVYHej2M4syiIlYXNN3OjBdWalI03fV00s2nCXSZW |
| Webhook Secret | whsec_xZ8cdMhT6xunaUKafa1VQ7zRqUVls4ZZ |
| Webhook URL | https://windyword.ai/stripe/webhook |

## Products & Pricing

| Product | Price | Type | Stripe Price ID |
|---------|-------|------|-----------------|
| Windy Pro | $49 | One-time | (check Stripe dashboard) |
| Windy Ultra | $79 | One-time | (check Stripe dashboard) |
| Windy Ultra | $8.99/mo | Subscription | (check Stripe dashboard) |
| Windy Max | $149 | One-time | (check Stripe dashboard) |

## Coupons

| Code | Discount | Notes |
|------|----------|-------|
| WINDYFRIEND | 25% off | General referral |
| WINDYBETA | 50% off | Beta tester reward |

## Feature Gating by Tier

| Feature | Free | Pro | Translate | Windy Max |
|---------|------|-----|-----------|---------------|
| Voice-to-text | 30 min/day | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| Windy Ultra | ❌ | ❌ | ✅ All languages | ✅ All languages |
| Offline packs | ❌ | ❌ | ❌ | ✅ |
| Local archive | ❌ | ✅ | ✅ | ✅ |
| Cloud storage | ❌ | ❌ | ❌ | 50 GB |
| History | 7 days | ✅ Unlimited | ✅ Unlimited | ✅ Unlimited |
| Export | TXT only | ✅ All formats | ✅ All formats | ✅ All formats |
| Clone pipeline | ❌ | 🎤 Audio only | 🎤 Audio only | 🎤📹 Audio + Video |
| Priority processing | ❌ | ❌ | ❌ | ✅ |

## Mobile Payment Strategy

### Recommended: Web-Based Licensing
1. User taps "Upgrade" in app
2. App opens windyword.ai/pricing in browser
3. User completes Stripe checkout on website
4. Webhook fires → generates license key → emails to user
5. User enters license key in app
6. App validates key against server → unlocks features

**Advantages:**
- No App Store commission (15-30%)
- Same system as desktop
- One payment infrastructure
- Full control over pricing and promotions

**Risks:**
- Apple may push back during App Store review (but legal post-Epic ruling)
- Slightly more friction than native in-app purchase
- Need clear UI flow so users don't get confused

### Fallback: RevenueCat
If App Store rejects web-based payments:
- RevenueCat wraps StoreKit (iOS) + Google Billing (Android)
- Free up to $2,500 MRR
- Handles receipt validation, subscription management
- Syncs with Stripe dashboard
- Requires adjusted pricing to cover platform fees

### Book A Cleaner (Separate Product — Same Stripe)
Also on this Stripe account (different product line):
| Product | Price |
|---------|-------|
| Pay As You Go | $89 |
| Weekly | $69/wk |
| Host Pro | $149/mo |
| Coupon: CLEANFRIEND | Discount |

This is a separate business. Don't mix with Windy Pro mobile. Just noting it exists on the same Stripe account.

## Webhook Events to Handle

| Event | Action |
|-------|--------|
| checkout.session.completed | Generate license key, email to user |
| customer.subscription.created | Activate subscription features |
| customer.subscription.updated | Update tier if plan changed |
| customer.subscription.deleted | Downgrade to free tier |
| invoice.payment_failed | Notify user, grace period |
| charge.refunded | Revoke license key |

## Testing

- Use Stripe test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline)
- Test webhook locally: `stripe listen --forward-to localhost:3000/stripe/webhook`
- Verify all tier transitions work correctly
- Test coupon application
- Test subscription lifecycle (create → renew → cancel → reactivate)
