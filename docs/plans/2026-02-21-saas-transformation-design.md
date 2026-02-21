# SaaS Transformation Design

**Date:** 2026-02-21
**Status:** Approved

## Overview

Transform the Clinica app from a single-tenant deployment into a multi-tenant SaaS product with self-service signup, tiered subscription billing via Stripe, a public landing page, and a platform-level super admin panel.

## Decisions

- **Pricing model:** Tiered plans (Basic / Pro / Enterprise) limited by professional count
- **Trial:** 14 days free, then read-only until subscription starts
- **Stripe integration:** Checkout Sessions + Customer Portal (hosted by Stripe, no embedded forms)
- **Landing page:** Minimal & clean (hero, features, pricing, CTA)
- **Signup:** Full form (name, email, password, clinic name, phone, specialty)
- **Super admin:** Same app at `/superadmin/*` routes, separate `SuperAdmin` model with own login

## 1. Data Model Changes

### New `SuperAdmin` model

```prisma
model SuperAdmin {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### New `Plan` model

```prisma
model Plan {
  id               String   @id @default(cuid())
  name             String   // "Basic", "Pro", "Enterprise"
  slug             String   @unique
  stripePriceId    String   @unique
  maxProfessionals Int      // 2, 10, -1 (unlimited)
  priceInCents     Int      // for display on landing/pricing page
  isActive         Boolean  @default(true)
  clinics          Clinic[]
  createdAt        DateTime @default(now())
}
```

### Clinic model additions

```prisma
// Add to existing Clinic model:
planId               String?
plan                 Plan?    @relation(fields: [planId], references: [id])
subscriptionStatus   String   @default("trialing")
  // values: "trialing" | "active" | "past_due" | "canceled" | "unpaid"
trialEndsAt          DateTime?
stripeCustomerId     String?  @unique
stripeSubscriptionId String?  @unique
```

`subscriptionStatus` is the source of truth for access control.

## 2. Signup Flow & Tenant Provisioning

### Route: `/signup` (public)

**Form fields:** clinic name, owner name, email, password + confirmation, phone, specialty.

### Backend: `POST /api/public/signup`

Single transaction creates:
1. `Clinic` with `subscriptionStatus: "trialing"`, `trialEndsAt: now + 14 days`
2. `User` with `role: ADMIN` linked to the new clinic
3. `ProfessionalProfile` for the owner
4. Stripe Customer via `stripe.customers.create()`
5. Stores `stripeCustomerId` on the Clinic

After signup: auto-login and redirect to `/` (dashboard).

### Access control middleware

Checks `clinic.subscriptionStatus` and `clinic.trialEndsAt` on every authenticated request:

| Status | Expired? | Access |
|--------|----------|--------|
| `trialing` | No | Full access |
| `trialing` | Yes | Read-only (GET allowed, mutations blocked). Banner: "Seu periodo de teste expirou. Assine para continuar." |
| `active` | — | Full access |
| `past_due` | — | Full access + warning banner |
| `canceled` / `unpaid` | — | Read-only |

## 3. Stripe Integration & Billing

### Environment variables

```
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Subscribe flow

1. Clinic admin clicks "Assinar" → `POST /api/billing/checkout`
2. Backend creates Stripe Checkout Session (`mode: "subscription"`)
3. Frontend redirects to `session.url`
4. Stripe sends webhooks on completion

### Webhooks: `POST /api/webhooks/stripe`

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Set `subscriptionStatus: "active"`, store `stripeSubscriptionId`, set `planId` |
| `customer.subscription.updated` | Update `subscriptionStatus` |
| `customer.subscription.deleted` | Set `subscriptionStatus: "canceled"` |
| `invoice.payment_failed` | Set `subscriptionStatus: "past_due"` |
| `invoice.paid` | Set `subscriptionStatus: "active"` |

### Billing page: `/admin/billing`

Shows: current plan, status, trial expiry, buttons for "Alterar plano" and "Gerenciar pagamento" (both open Stripe Customer Portal).

### Plan limit enforcement

When adding a professional beyond `plan.maxProfessionals`, API returns 403: "Seu plano permite no maximo N profissionais. Faca upgrade para adicionar mais."

## 4. Landing Page

### Route: `/` (conditional rendering)

- Unauthenticated → landing page
- Authenticated → dashboard (existing behavior)

### Sections

1. **Header:** Logo + "Entrar" + "Comecar gratuitamente" buttons
2. **Hero:** Headline, subtext, CTA → `/signup`
3. **Features:** 3-4 cards (Agenda, Pacientes, Notificacoes, Relatorios) with icons
4. **Pricing:** 3-column table (Basic/Pro/Enterprise) with plan details and CTAs
5. **Footer:** Links, copyright

## 5. Super Admin Panel

### Auth

Separate login at `/superadmin/login` using the `SuperAdmin` model. Own JWT-based session with `isSuperAdmin: true` flag.

### Routes

| Route | Purpose |
|---|---|
| `/superadmin/login` | Login page |
| `/superadmin` | Dashboard: total clinics, active trials, active subs, MRR |
| `/superadmin/clinics` | Clinic list with search/filter by name, status, plan, date |
| `/superadmin/clinics/[id]` | Clinic detail: users, subscription, usage, actions (extend trial, change plan) |
| `/superadmin/plans` | Plan CRUD: name, price, limits, Stripe price ID |

### Capabilities

- View all clinics and subscription status
- Extend trial period
- Manually change plan
- Deactivate/reactivate clinics
- View metrics (MRR, total clinics, conversion rate)
- Manage plans
