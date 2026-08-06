# Soul Jiu-Jitsu Stripe Integration — Architecture Design

**Author:** Claude (Principal Solutions Architect)
**Date:** April 1, 2026
**Status:** Phase 1 Implemented

---

## 1. Design Principles

- **Stripe is the billing source of truth.** The local DB mirrors Stripe state via webhooks — never the reverse. If there's a conflict, Stripe wins.
- **Webhook-first architecture.** No local state mutation on the "happy path" of payment. The user action creates a Stripe session; the webhook callback writes to the DB. This eliminates partial states where payment succeeded but the DB write failed (or vice versa).
- **Stripe Checkout over custom forms.** Stripe Checkout handles PCI compliance, card collection, SCA/3DS, and the entire payment UI. Zero sensitive card data touches our server. No Stripe Elements needed.
- **One Stripe Customer per member.** Created on first payment, linked via `members.stripe_customer_id`. Email is the deduplication key. Race-safe via DB unique constraint.
- **Price locks are honored in Stripe.** Each unique `effective_price_cents + billing_interval` combination gets its own Stripe Price object. Members pay what the DB says, not the plan's current list price.
- **No-card trials.** Plans with `trial_days > 0` create a local membership (status `trialing`) with zero Stripe involvement. Card is collected only when the member converts to paid.
- **`"use server"` boundary is enforced.** Pure Stripe helpers (customer, price, checkout, status sync) live in `src/lib/stripe.ts` — NOT exposed as callable server actions. Only authenticated user-facing functions use `"use server"`.
- **Single member status source.** `syncMemberStatus()` derives `members.status` from all active memberships, called from every state-changing path. No scattered inline updates.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Soul Jiu-Jitsu App                            │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Portal       │  │ Admin        │  │ Public /pricing   │ │
│  │ - Enroll     │  │ - Assign     │  │ - View plans      │ │
│  │ - Cancel     │  │ - Comp       │  │ - Join → Enroll   │ │
│  │ - Manage     │  │ - Override $ │  │                   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────┘ │
│         │                 │                                  │
│  ┌──────▼─────────────────▼──────┐                          │
│  │  src/lib/stripe.ts            │  Pure helpers (no "use   │
│  │  - getStripe()                │  server"), not callable   │
│  │  - findOrCreateCustomer()     │  from client             │
│  │  - findOrCreatePrice()        │                          │
│  │  - createCheckoutSession()    │                          │
│  │  - syncMemberStatus()         │                          │
│  │  - getPeriodEnd/Iso()         │                          │
│  │  - getSubscriptionIdFromInv() │                          │
│  ├───────────────────────────────┤                          │
│  │  src/lib/actions/billing.ts   │  "use server" — authed   │
│  │  - createBillingPortalSession │  actions only             │
│  │  - requestCancellation()      │                          │
│  ├───────────────────────────────┤                          │
│  │  src/lib/actions/portal.ts    │  selfEnrollInPlan()      │
│  │  src/lib/actions/m-plans.ts   │  assignMembership() etc  │
│  └──────┬────────────────────────┘                          │
│         │                                                    │
│  ┌──────▼──────────────────────────────────────────┐        │
│  │  Route Handlers                                  │        │
│  │  /api/webhooks/stripe   (POST, unauthed)         │        │
│  └──────┬──────────────────────────────────────────┘        │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────┐         ┌──────────────────┐
│  Stripe API     │◄───────►│  Supabase        │
│  - Customers    │  webhook│  - members       │
│  - Products     │  events │  - memberships   │
│  - Prices       │         │  - purchases     │
│  - Subscriptions│         │  - stripe_events │
│  - Checkout     │         │  - audit_logs    │
│  - Billing Portal         │                  │
└─────────────────┘         └──────────────────┘
```

---

## 3. Dependency

```json
{
  "stripe": "^21.0.1"
}
```

Stripe SDK v21 uses API version `2026-03-25.dahlia`. Key breaking changes from earlier versions:
- `current_period_end` moved from `Subscription` to `SubscriptionItem`
- `invoice.subscription` moved to `invoice.parent.subscription_details.subscription`

Both are handled by shared helpers in `stripe.ts`.

---

## 4. Environment Variables

```env
# .env.local additions
STRIPE_SECRET_KEY=sk_test_...          # Server-side only
STRIPE_WEBHOOK_SECRET=whsec_...        # Webhook signature verification
NEXT_PUBLIC_SITE_URL=https://...       # Used for Checkout redirect URLs
```

Both are server-only — never prefixed with `NEXT_PUBLIC_`. `STRIPE_PUBLISHABLE_KEY` is not needed until Stripe Elements is added (Phase 3+).

---

## 5. Database Changes

### Migration: `20240134000000_stripe_columns.sql` ✅ Implemented

```sql
-- Link members to Stripe Customers
ALTER TABLE members ADD COLUMN stripe_customer_id TEXT UNIQUE;

-- Link memberships to Stripe Subscriptions
ALTER TABLE member_memberships
  ADD COLUMN stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN stripe_price_id TEXT,
  ADD COLUMN current_period_end TIMESTAMPTZ,
  ADD COLUMN is_comp BOOLEAN NOT NULL DEFAULT FALSE;

-- Link plans to Stripe Products/Prices
ALTER TABLE membership_plans
  ADD COLUMN stripe_product_id TEXT,
  ADD COLUMN stripe_default_price_id TEXT;

-- Link one-time purchases to Stripe
ALTER TABLE member_purchases
  ADD COLUMN stripe_payment_intent_id TEXT UNIQUE,
  ADD COLUMN stripe_checkout_session_id TEXT;

-- Crash-safe idempotency log for webhook events.
-- status: 'pending' on insert, 'processed' on success.
-- Only 'processed' events are skipped on retry.
-- If the process crashes between insert and completion, the
-- pending record is found on retry and reprocessed (not skipped).
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,                    -- Stripe event ID (evt_...)
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  payload JSONB
);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies = only service role can access
```

### RLS

No new policies needed. Existing member/admin policies cover new columns. `stripe_events` has no policies (service role only).

---

## 6. File Structure ✅ Implemented

```
src/
├── lib/
│   ├── stripe.ts                          # Stripe singleton + ALL pure helpers
│   └── actions/
│       ├── billing.ts                     # "use server" — authed billing actions
│       ├── portal.ts                      # selfEnrollInPlan() (modified)
│       └── membership-plans.ts            # assignMembership(), cancel, pause (modified)
├── app/
│   └── api/
│       └── webhooks/
│           └── stripe/
│               └── route.ts               # Webhook handler (POST)
scripts/
└── stripe-sync.ts                         # One-time plan → Stripe Product/Price sync
```

**Key architectural decision:** No `/api/stripe/create-checkout` or `/api/stripe/create-portal` route handlers. Checkout sessions are created inside existing server actions (`selfEnrollInPlan`, `assignMembership`) and the billing portal is a server action in `billing.ts`. This keeps the calling convention consistent — everything is a server action from the client's perspective.

---

## 7. Core Module: `src/lib/stripe.ts` ✅ Implemented

Contains:

| Export | Purpose |
|---|---|
| `getStripe()` | Stripe client singleton (pinned API version) |
| `CANCELLATION_NOTICE_DAYS` | 10-day cancellation policy constant |
| `MAX_PAUSE_DAYS` | 30-day max pause constant |
| `getPeriodEnd(subscription)` | Extract period end from SubscriptionItem (v21 compat) |
| `getPeriodEndIso(subscription)` | Same, returns ISO string or null |
| `getSubscriptionIdFromInvoice(invoice)` | Extract sub ID from Invoice parent (v21 compat) |
| `getOrigin()` | Single source for app origin URL |
| `findOrCreateStripeCustomer(memberId, email, name)` | Race-safe customer creation (catches PG unique violation `23505`) |
| `findOrCreateStripePrice(productId, amountCents, interval)` | Immutable price dedup |
| `createCheckoutSession(params)` | Unified checkout for both `subscription` and `payment` modes |
| `syncMemberStatus(memberId)` | Derive member status from all memberships — single source of truth |

**This module is NOT a `"use server"` file.** Functions are imported by server actions and route handlers but never exposed as callable endpoints.

---

## 8. Enrollment Flow ✅ Implemented

### Trial enrollment (no card, no commitment)

```
Member clicks "Enroll Now" → selfEnrollInPlan()
  → plan.trial_days > 0?
  → YES: INSERT member_memberships (status='trialing'), no Stripe
  → Return { success: true }
```

### Paid enrollment (Stripe Checkout)

```
Member clicks "Enroll Now" → selfEnrollInPlan()
  → plan.trial_days = 0
  → findOrCreateStripeCustomer()
  → createCheckoutSession(mode='subscription')
  → Return { checkoutUrl }
  → Client redirects to Stripe Checkout

... member pays on Stripe's hosted page ...

Stripe → POST /api/webhooks/stripe
  → checkout.session.completed
  → handleSubscriptionCheckout()
    → Retrieve subscription from Stripe
    → INSERT member_memberships (or UPDATE existing trial)
    → syncMemberStatus()
```

### Drop-in purchase (one-time)

Same flow but `createCheckoutSession(mode='payment')`. Webhook inserts into `member_purchases`.

---

## 9. Admin Plan Assignment ✅ Implemented

```typescript
assignMembership({ member_id, plan_id, is_comp: false })
  → Creates Checkout Session URL → Returns { checkoutUrl }
  → Admin shares link with member → member pays → webhook creates membership

assignMembership({ member_id, plan_id, is_comp: true })
  → Direct INSERT with locked_price_cents=0, is_comp=true
  → No Stripe involvement
```

---

## 10. Decisions Made

| Question | Decision |
|---|---|
| **Cancellation policy** | 10 days notice required. If <10 days before next billing, member gets charged once more. No refunds. |
| **Trial behavior** | No card upfront. Zero friction. Card collected only on conversion. |
| **Admin assignment** | Both: Checkout link for paying members, `is_comp=true` for free memberships (instructors, staff). |
| **Pause limits** | 30 days max. Auto-resumes. Admin can override for medical leave. |
| **Drop-in flow** | Requires existing member + signed waiver. Walk-ins register first. |

---

## 11. Webhook Handler ✅ Implemented

### Crash-safe idempotency

```
1. Verify signature → reject if invalid (400)
2. Check stripe_events: if status='processed' → skip (200)
3. Upsert event as 'pending' (new events + crash-retries)
4. Process event
5. Mark 'processed' on success
6. On failure: return 500, event stays 'pending' → Stripe retries → reprocessed
```

### Handled events

| Event | Handler | DB Action |
|---|---|---|
| `checkout.session.completed` | `handleCheckoutCompleted` | Create membership or purchase. Store customer/subscription IDs. `syncMemberStatus()`. |
| `customer.subscription.updated` | `handleSubscriptionChanged` | Sync status, period end, price, cancel dates. `syncMemberStatus()`. |
| `customer.subscription.deleted` | `handleSubscriptionChanged` | Same handler — deleted is just the final status transition. |
| `invoice.payment_failed` | `handlePaymentFailed` | Set membership `past_due`. |
| `invoice.payment_succeeded` | `handlePaymentSucceeded` | Update `current_period_end` from `invoice.period_end` (no extra API call). Restore `past_due → active`. |

### Error handling

| Scenario | Handling |
|---|---|
| `STRIPE_WEBHOOK_SECRET` not set | Fail fast with 500 and clear error log |
| Signature invalid | 400, logged |
| Event already processed | 200, skipped |
| Handler throws | 500, event stays `pending`, Stripe retries |
| Process crashes mid-handling | Event stays `pending`, next retry reprocesses it |
| Stripe API call fails in server action | Return `{ error: "Payment service unavailable." }` — no Stripe internals exposed |
| Customer creation race condition | DB unique constraint catches it; second request re-reads stored ID |

---

## 12. Cancellation Flow ✅ Implemented

### Member self-cancellation: `requestCancellation(membershipId)`

```
1. Verify auth + membership ownership
2. Comp/no-Stripe membership → cancel immediately
3. Stripe subscription:
   a. Retrieve subscription, get period end
   b. daysUntilRenewal >= 10 → cancel_at_period_end (no extra charge)
   c. daysUntilRenewal < 10 → cancel_at = next_period_end (charged once more)
4. Update local ends_at
5. Audit log with days_notice and charged_again
```

### Admin cancellation: `cancelMembership(id, mode)`

- `mode = "immediate"` → `stripe.subscriptions.cancel()`
- `mode = "end_of_period"` → `stripe.subscriptions.update({ cancel_at_period_end: true })`
- Comp memberships: local-only cancel

### Admin pause/resume: `forceSetMembershipStatus()`

- Pause → `stripe.subscriptions.update({ pause_collection: { behavior: 'void' } })`
- Resume → `stripe.subscriptions.update({ pause_collection: '' })`
- Cancel → `stripe.subscriptions.cancel()`

---

## 13. Middleware & CSP ✅ Implemented

### Middleware (`src/middleware.ts`)

Webhook endpoint excluded from auth checks:
```typescript
if (pathname === "/api/webhooks/stripe") {
  return supabaseResponse;
}
```

### CSP (`next.config.mjs`)

```
script-src 'self' ... https://js.stripe.com
img-src 'self' ... https://*.stripe.com
connect-src 'self' ... https://api.stripe.com
frame-src 'self' ... https://js.stripe.com https://checkout.stripe.com
```

---

## 14. Portal UI Changes ✅ Implemented

### `CurrentPlanCard.tsx`

```typescript
// handleEnroll now handles three return types:
if ("checkoutUrl" in result) {
  window.location.href = result.checkoutUrl;  // → Stripe Checkout
} else if ("success" in result) {
  router.refresh();  // Trial enrolled, no payment needed
} else {
  setError(result.error);
}
```

---

## 15. Stripe Product Setup

### One-time sync script: `scripts/stripe-sync.ts`

```bash
npx tsx --env-file=.env.local scripts/stripe-sync.ts
```

- Idempotent: skips plans with existing `stripe_product_id`
- Creates Stripe Product + default Price for each active plan
- Stores IDs back in `membership_plans`

---

## 16. Price Lock & Override Sync (Phase 2)

The existing price lock system maps cleanly to Stripe's immutable Price model:

```
Plan: Individual $189/mo
  → Stripe Product: "Individual Membership"
  → Stripe Price: $189/mo (stripe_default_price_id)

Member with $150/mo override
  → findOrCreateStripePrice() → new Price on same Product
  → Subscription swapped to new Price

Bulk price raise to $199/mo (all current)
  → New Stripe Price
  → All affected subscriptions updated (proration_behavior: 'none')
  → Members with overrides untouched
```

---

## 17. Implementation Status

### Phase 1: Core Billing ✅ COMPLETE

| # | Task | Status |
|---|---|---|
| 1 | `stripe` package v21 + env vars | ✅ |
| 2 | Migration: Stripe columns + `stripe_events` with status column | ✅ |
| 3 | `src/lib/stripe.ts` — singleton + all pure helpers | ✅ |
| 4 | `scripts/stripe-sync.ts` — Product/Price sync | ✅ |
| 5 | Webhook handler with crash-safe idempotency | ✅ |
| 6 | `selfEnrollInPlan()` — trial (local) or paid (Checkout redirect) | ✅ |
| 7 | `assignMembership()` — Checkout link or comp | ✅ |
| 8 | `requestCancellation()` — 10-day notice policy | ✅ |
| 9 | `cancelMembership()` — admin cancel with Stripe sync | ✅ |
| 10 | `forceSetMembershipStatus()` — pause/resume Stripe sync | ✅ |
| 11 | `createBillingPortalSession()` — member self-service | ✅ |
| 12 | Portal UI: checkout redirect on enroll | ✅ |
| 13 | Middleware: webhook exclusion | ✅ |
| 14 | CSP: Stripe domains | ✅ |
| 15 | Types: all interfaces updated with Stripe fields | ✅ |

### Phase 2: Admin Billing Controls — NOT STARTED

1. Bulk price change → Stripe subscription swap (`changePlanPrice` Stripe sync)
2. Price override → `setMembershipOverridePrice` Stripe sync
3. Admin billing page: real Stripe subscription/payment data
4. Plan CRUD → auto-create/update Stripe Products

### Phase 3: Polish — NOT STARTED

1. Stripe Customer Portal branding configuration
2. Invoice/receipt display in member portal (`BillingHistoryTab`)
3. Trial expiry automation (cron to cancel expired trials)
4. `customer.subscription.trial_will_end` webhook (email trigger)
5. Monitoring: failed webhook alerts, unsynced subscriptions audit

---

## 18. What This Design Intentionally Defers

| Deferred | Reason |
|---|---|
| Stripe Elements (embedded card form) | Checkout handles card collection. Elements adds complexity with no benefit now. |
| Coupon/discount codes | Not in current schema. Add when marketing needs it. |
| Multiple payment methods per member | Stripe Billing Portal handles this natively. |
| Prorated plan switches | Members are on one plan. Switching is cancel + re-enroll. |
| Automated dunning emails | Stripe Smart Retries + built-in dunning handle this. |
| Refunds | Rare for gyms. Handle manually in Stripe Dashboard. |
| Family billing | Requires `families` table and multi-member subscription model. |
| Metered/per-class billing | Not needed — all plans are flat-rate. |
| Stripe Connect (multi-tenant) | Current build is single-gym. Connect is additive when SaaS scaling begins. |

---

## 19. Rollback Plan

If Stripe integration needs to be disabled:

1. Set `STRIPE_SECRET_KEY` to empty — all Stripe calls fail fast
2. Revert `selfEnrollInPlan()` to direct INSERT (re-enable free enrollment)
3. Stripe subscriptions remain active in Stripe but are no longer synced
4. No data loss — all DB columns are additive (nullable), no existing columns modified
5. Comp memberships (`is_comp=true`) continue to work with zero Stripe dependency

---

## 20. Testing Strategy

### Test mode
All development uses Stripe test mode (`sk_test_...`). Free, unlimited, supports all API features.

### Test cards
- `4242424242424242` — succeeds
- `4000000000000341` — attach succeeds, charge fails (test past_due flow)
- `4000000000003220` — triggers 3DS authentication

### Webhook testing
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Integration test checklist
1. Self-enrollment (no trial): portal → checkout → webhook → membership created
2. Self-enrollment (trial): portal → enroll → membership `trialing` (no Stripe)
3. Admin comp assignment: admin → assign comp → membership active, no Stripe
4. Admin paid assignment: admin → assign → checkout link → member pays → webhook
5. Drop-in purchase: portal → checkout (payment mode) → webhook → purchase recorded
6. Cancellation (≥10 days notice): cancel → `cancel_at_period_end` → no extra charge
7. Cancellation (<10 days notice): cancel → charged once more → `cancel_at` next period
8. Failed payment: test card → `invoice.payment_failed` → status = past_due
9. Payment recovery: retry succeeds → `invoice.payment_succeeded` → status restored
10. Idempotency: replay webhook event → no duplicate rows
11. Crash recovery: kill server mid-webhook → Stripe retries → event reprocessed (not skipped)
