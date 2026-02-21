# SaaS Transformation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Clinica into a multi-tenant SaaS with self-service signup, Stripe billing, landing page, and super admin panel.

**Architecture:** Extend existing Next.js + Prisma + NextAuth stack. Add `Plan` and `SuperAdmin` models, subscription fields on `Clinic`, Stripe Checkout for payments, webhook-driven status sync, and a `/superadmin` panel with separate JWT auth.

**Tech Stack:** Next.js 16, Prisma, NextAuth v5 (JWT), Stripe (Checkout Sessions + Customer Portal + Webhooks), Zod, Vitest, Tailwind CSS 4.

**Design doc:** `docs/plans/2026-02-21-saas-transformation-design.md`

---

## Phase 1: Foundation (Schema + Stripe SDK + Subscription Helpers)

### Task 1: Add Plan and SuperAdmin models to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the Plan model after existing enums block**

Add after the `FeatureAccess` enum (line ~91), before the models section:

```prisma
/// SaaS subscription plan
model Plan {
  id               String   @id @default(cuid())
  name             String   // "Basic", "Pro", "Enterprise"
  slug             String   @unique
  stripePriceId    String   @unique
  maxProfessionals Int      // 2, 10, -1 (unlimited)
  priceInCents     Int      // for display on landing/pricing page
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())

  // Relations
  clinics Clinic[]

  @@index([isActive])
}

/// Platform-level super admin (not tied to any clinic)
model SuperAdmin {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Step 2: Add subscription fields to the Clinic model**

Add these fields to the existing `Clinic` model, after the `reminderHours` field (line ~113):

```prisma
  // SaaS subscription fields
  planId               String?
  plan                 Plan?    @relation(fields: [planId], references: [id])
  subscriptionStatus   String   @default("trialing") // trialing | active | past_due | canceled | unpaid
  trialEndsAt          DateTime?
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
```

**Step 3: Push schema to database**

Run: `npx prisma db push`
Expected: Schema changes applied successfully.

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Plan, SuperAdmin models and Clinic subscription fields"
```

---

### Task 2: Install Stripe SDK and add env vars

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.example`
- Create: `src/lib/stripe.ts`

**Step 1: Install stripe**

Run: `npm install stripe`

**Step 2: Add Stripe env vars to .env.example**

Append to `.env.example`:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Step 3: Create Stripe client singleton**

Create `src/lib/stripe.ts`:

```typescript
import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set")
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
  typescript: true,
})
```

Note: Check the actual latest Stripe API version when implementing. Use the version that `npm install stripe` pulls.

**Step 4: Add real Stripe env vars to .env (local dev)**

Add your Stripe test keys to `.env` (NOT committed). You can get test keys from https://dashboard.stripe.com/test/apikeys.

**Step 5: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/stripe.ts
git commit -m "feat: add Stripe SDK and env configuration"
```

---

### Task 3: Subscription status helper (pure logic, TDD)

**Files:**
- Create: `src/lib/subscription/status.ts`
- Create: `src/lib/subscription/status.test.ts`
- Create: `src/lib/subscription/index.ts`

**Step 1: Write the failing tests**

Create `src/lib/subscription/status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  getSubscriptionAccess,
  isReadOnly,
  canMutate,
  getSubscriptionBanner,
  type SubscriptionInfo,
} from "./status"

describe("getSubscriptionAccess", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns full_access for active subscription", () => {
    const info: SubscriptionInfo = {
      subscriptionStatus: "active",
      trialEndsAt: null,
    }
    expect(getSubscriptionAccess(info)).toBe("full_access")
  })

  it("returns full_access for trialing with future expiry", () => {
    const info: SubscriptionInfo = {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-03-15T00:00:00Z"),
    }
    expect(getSubscriptionAccess(info)).toBe("full_access")
  })

  it("returns read_only for trialing with expired trial", () => {
    const info: SubscriptionInfo = {
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-02-28T00:00:00Z"),
    }
    expect(getSubscriptionAccess(info)).toBe("read_only")
  })

  it("returns full_access_warning for past_due", () => {
    const info: SubscriptionInfo = {
      subscriptionStatus: "past_due",
      trialEndsAt: null,
    }
    expect(getSubscriptionAccess(info)).toBe("full_access_warning")
  })

  it("returns read_only for canceled", () => {
    const info: SubscriptionInfo = {
      subscriptionStatus: "canceled",
      trialEndsAt: null,
    }
    expect(getSubscriptionAccess(info)).toBe("read_only")
  })

  it("returns read_only for unpaid", () => {
    const info: SubscriptionInfo = {
      subscriptionStatus: "unpaid",
      trialEndsAt: null,
    }
    expect(getSubscriptionAccess(info)).toBe("read_only")
  })

  it("returns read_only for trialing with null trialEndsAt (edge case)", () => {
    const info: SubscriptionInfo = {
      subscriptionStatus: "trialing",
      trialEndsAt: null,
    }
    expect(getSubscriptionAccess(info)).toBe("read_only")
  })
})

describe("isReadOnly", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns false for active subscription", () => {
    expect(isReadOnly({ subscriptionStatus: "active", trialEndsAt: null })).toBe(false)
  })

  it("returns true for expired trial", () => {
    expect(
      isReadOnly({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-02-28T00:00:00Z"),
      })
    ).toBe(true)
  })

  it("returns true for canceled", () => {
    expect(isReadOnly({ subscriptionStatus: "canceled", trialEndsAt: null })).toBe(true)
  })
})

describe("canMutate", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns true for active subscription", () => {
    expect(canMutate({ subscriptionStatus: "active", trialEndsAt: null })).toBe(true)
  })

  it("returns false for expired trial", () => {
    expect(
      canMutate({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date("2026-02-28T00:00:00Z"),
      })
    ).toBe(false)
  })

  it("returns true for past_due (still allows mutations)", () => {
    expect(canMutate({ subscriptionStatus: "past_due", trialEndsAt: null })).toBe(true)
  })
})

describe("getSubscriptionBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns null for active subscription", () => {
    expect(
      getSubscriptionBanner({ subscriptionStatus: "active", trialEndsAt: null })
    ).toBeNull()
  })

  it("returns trial banner for active trial", () => {
    const banner = getSubscriptionBanner({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-03-10T00:00:00Z"),
    })
    expect(banner).not.toBeNull()
    expect(banner!.type).toBe("info")
    expect(banner!.message).toContain("9 dias")
  })

  it("returns expired trial banner", () => {
    const banner = getSubscriptionBanner({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-02-28T00:00:00Z"),
    })
    expect(banner).not.toBeNull()
    expect(banner!.type).toBe("error")
    expect(banner!.message).toContain("expirou")
  })

  it("returns past_due warning banner", () => {
    const banner = getSubscriptionBanner({
      subscriptionStatus: "past_due",
      trialEndsAt: null,
    })
    expect(banner).not.toBeNull()
    expect(banner!.type).toBe("warning")
  })

  it("returns canceled banner", () => {
    const banner = getSubscriptionBanner({
      subscriptionStatus: "canceled",
      trialEndsAt: null,
    })
    expect(banner).not.toBeNull()
    expect(banner!.type).toBe("error")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/subscription/status.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `src/lib/subscription/status.ts`:

```typescript
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"

export type AccessLevel = "full_access" | "full_access_warning" | "read_only"

export interface SubscriptionInfo {
  subscriptionStatus: string
  trialEndsAt: Date | null
}

export interface SubscriptionBanner {
  type: "info" | "warning" | "error"
  message: string
}

/**
 * Determine the access level for a clinic based on subscription status.
 */
export function getSubscriptionAccess(info: SubscriptionInfo): AccessLevel {
  const { subscriptionStatus, trialEndsAt } = info

  if (subscriptionStatus === "active") {
    return "full_access"
  }

  if (subscriptionStatus === "trialing") {
    if (trialEndsAt && new Date() < trialEndsAt) {
      return "full_access"
    }
    return "read_only"
  }

  if (subscriptionStatus === "past_due") {
    return "full_access_warning"
  }

  // canceled, unpaid
  return "read_only"
}

/**
 * Whether the clinic is in read-only mode (mutations blocked).
 */
export function isReadOnly(info: SubscriptionInfo): boolean {
  return getSubscriptionAccess(info) === "read_only"
}

/**
 * Whether the clinic can perform mutations (create, update, delete).
 */
export function canMutate(info: SubscriptionInfo): boolean {
  return !isReadOnly(info)
}

/**
 * Get the banner message to display based on subscription status.
 * Returns null if no banner is needed.
 */
export function getSubscriptionBanner(info: SubscriptionInfo): SubscriptionBanner | null {
  const { subscriptionStatus, trialEndsAt } = info

  if (subscriptionStatus === "active") {
    return null
  }

  if (subscriptionStatus === "trialing") {
    if (trialEndsAt && new Date() < trialEndsAt) {
      const daysLeft = Math.ceil(
        (trialEndsAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
      return {
        type: "info",
        message: `Periodo de teste: ${daysLeft} dias restantes. Assine para continuar usando apos o teste.`,
      }
    }
    return {
      type: "error",
      message: "Seu periodo de teste expirou. Assine para continuar usando o sistema.",
    }
  }

  if (subscriptionStatus === "past_due") {
    return {
      type: "warning",
      message: "Houve um problema com seu pagamento. Atualize seus dados de pagamento.",
    }
  }

  if (subscriptionStatus === "canceled") {
    return {
      type: "error",
      message: "Sua assinatura foi cancelada. Assine novamente para continuar.",
    }
  }

  // unpaid
  return {
    type: "error",
    message: "Sua assinatura esta inativa. Regularize o pagamento para continuar.",
  }
}
```

Create `src/lib/subscription/index.ts`:

```typescript
export {
  getSubscriptionAccess,
  isReadOnly,
  canMutate,
  getSubscriptionBanner,
  type SubscriptionInfo,
  type SubscriptionStatus,
  type AccessLevel,
  type SubscriptionBanner,
} from "./status"
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/subscription/status.test.ts`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/lib/subscription/
git commit -m "feat: add subscription status helper with tests"
```

---

### Task 4: Plan limit enforcement helper (TDD)

**Files:**
- Create: `src/lib/subscription/limits.ts`
- Create: `src/lib/subscription/limits.test.ts`
- Modify: `src/lib/subscription/index.ts`

**Step 1: Write failing tests**

Create `src/lib/subscription/limits.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { checkProfessionalLimit } from "./limits"

describe("checkProfessionalLimit", () => {
  it("allows when under limit", () => {
    const result = checkProfessionalLimit({ maxProfessionals: 5, currentCount: 3 })
    expect(result.allowed).toBe(true)
    expect(result.message).toBeUndefined()
  })

  it("blocks when at limit", () => {
    const result = checkProfessionalLimit({ maxProfessionals: 2, currentCount: 2 })
    expect(result.allowed).toBe(false)
    expect(result.message).toContain("2")
  })

  it("blocks when over limit", () => {
    const result = checkProfessionalLimit({ maxProfessionals: 2, currentCount: 5 })
    expect(result.allowed).toBe(false)
  })

  it("allows unlimited when maxProfessionals is -1", () => {
    const result = checkProfessionalLimit({ maxProfessionals: -1, currentCount: 100 })
    expect(result.allowed).toBe(true)
  })

  it("allows when no plan (null maxProfessionals)", () => {
    const result = checkProfessionalLimit({ maxProfessionals: null, currentCount: 100 })
    expect(result.allowed).toBe(true)
  })
})
```

**Step 2: Run to verify failure**

Run: `npx vitest run src/lib/subscription/limits.test.ts`
Expected: FAIL.

**Step 3: Implement**

Create `src/lib/subscription/limits.ts`:

```typescript
export interface ProfessionalLimitCheck {
  maxProfessionals: number | null
  currentCount: number
}

export interface LimitResult {
  allowed: boolean
  message?: string
}

/**
 * Check if a clinic can add another professional based on their plan limit.
 * maxProfessionals: -1 means unlimited, null means no plan (allow all).
 */
export function checkProfessionalLimit(check: ProfessionalLimitCheck): LimitResult {
  const { maxProfessionals, currentCount } = check

  if (maxProfessionals === null || maxProfessionals === -1) {
    return { allowed: true }
  }

  if (currentCount >= maxProfessionals) {
    return {
      allowed: false,
      message: `Seu plano permite no maximo ${maxProfessionals} profissionais. Faca upgrade para adicionar mais.`,
    }
  }

  return { allowed: true }
}
```

**Step 4: Update index.ts**

Add to `src/lib/subscription/index.ts`:

```typescript
export { checkProfessionalLimit, type ProfessionalLimitCheck, type LimitResult } from "./limits"
```

**Step 5: Run tests**

Run: `npx vitest run src/lib/subscription/limits.test.ts`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/lib/subscription/
git commit -m "feat: add plan limit enforcement helper with tests"
```

---

## Phase 2: Auth Config Updates + Public Signup

### Task 5: Update auth config for new public routes

**Files:**
- Modify: `src/lib/auth.config.ts`

**Step 1: Add signup, cancel, and superadmin routes to public routes**

In `src/lib/auth.config.ts`, update the `authorized` callback to allow new public routes:

```typescript
authorized({ auth, request: { nextUrl } }) {
  const isLoggedIn = !!auth?.user
  const isLoginPage = nextUrl.pathname === "/login"
  const isSignupPage = nextUrl.pathname === "/signup"
  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth")
  const isPublicApiRoute = nextUrl.pathname.startsWith("/api/public")
  const isWebhookRoute = nextUrl.pathname.startsWith("/api/webhooks")
  const isConfirmPage = nextUrl.pathname === "/confirm"
  const isCancelPage = nextUrl.pathname === "/cancel"
  const isSuperAdminRoute = nextUrl.pathname.startsWith("/superadmin")
  const isPublicRoute =
    isLoginPage || isSignupPage || isApiAuthRoute || isPublicApiRoute ||
    isWebhookRoute || isConfirmPage || isCancelPage || isSuperAdminRoute

  if (isPublicRoute) {
    if (isLoggedIn && isLoginPage) {
      return Response.redirect(new URL("/", nextUrl.origin))
    }
    return true
  }

  if (!isLoggedIn) {
    return false
  }

  return true
},
```

Key changes:
- Add `isSignupPage` for `/signup`
- Add `isWebhookRoute` for `/api/webhooks/*` (Stripe webhooks must not require auth)
- Add `isSuperAdminRoute` for `/superadmin/*` (has its own auth)
- Add `isCancelPage` for `/cancel` (was already present but making explicit)

**Step 2: Add subscriptionStatus to JWT and Session types**

In `src/types/next-auth.d.ts`, add `subscriptionStatus` field to all three interfaces:

```typescript
// In User interface, add:
subscriptionStatus: string

// In Session.user, add:
subscriptionStatus: string

// In JWT interface, add:
subscriptionStatus: string
```

**Step 3: Add subscriptionStatus to JWT/session callbacks in auth.config.ts**

In `src/lib/auth.config.ts`, update the `jwt` callback:

```typescript
jwt({ token, user }) {
  if (user) {
    token.id = user.id
    token.clinicId = user.clinicId
    token.role = user.role
    token.professionalProfileId = user.professionalProfileId
    token.appointmentDuration = user.appointmentDuration
    token.permissions = user.permissions
    token.subscriptionStatus = user.subscriptionStatus
  }
  return token
},
```

And the `session` callback:

```typescript
session({ session, token }) {
  if (token) {
    session.user.id = token.id as string
    session.user.clinicId = token.clinicId as string
    session.user.role = token.role as string
    session.user.professionalProfileId = token.professionalProfileId as string | null
    session.user.appointmentDuration = token.appointmentDuration as number | null
    session.user.permissions = token.permissions
    session.user.subscriptionStatus = token.subscriptionStatus as string
  }
  return session
},
```

**Step 4: Add subscriptionStatus to auth.ts authorize return**

In `src/lib/auth.ts`, update the return object in `authorize()` (around line 85):

```typescript
return {
  id: user.id,
  email: user.email,
  name: user.name,
  clinicId: user.clinicId,
  role: user.role,
  professionalProfileId: user.professionalProfile?.id ?? null,
  appointmentDuration: user.professionalProfile?.appointmentDuration ?? null,
  permissions,
  subscriptionStatus: user.clinic.subscriptionStatus,
}
```

Also update the Prisma query to include `clinic`:

```typescript
const user = await prisma.user.findFirst({
  where: {
    email: email,
    isActive: true,
  },
  include: {
    professionalProfile: {
      select: {
        id: true,
        appointmentDuration: true,
      },
    },
    clinic: {
      select: {
        subscriptionStatus: true,
      },
    },
  },
})
```

**Step 5: Commit**

```bash
git add src/lib/auth.config.ts src/lib/auth.ts src/types/next-auth.d.ts
git commit -m "feat: update auth config for SaaS routes and subscription status in session"
```

---

### Task 6: Public signup API

**Files:**
- Create: `src/app/api/public/signup/route.ts`

**Step 1: Create the signup API route**

Create `src/app/api/public/signup/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/password"
import { z } from "zod"
import { stripe } from "@/lib/stripe"

const signupSchema = z.object({
  clinicName: z.string().min(2, "Nome da clinica deve ter pelo menos 2 caracteres"),
  ownerName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  phone: z.string().min(10, "Telefone invalido"),
  specialty: z.string().min(2, "Especialidade deve ter pelo menos 2 caracteres"),
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      )
    }

    const { clinicName, ownerName, email, password, phone, specialty } = parsed.data

    // Check if email already exists in any clinic (global uniqueness for owners)
    const existingUser = await prisma.user.findFirst({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "Ja existe uma conta com este email" },
        { status: 409 }
      )
    }

    // Generate unique slug
    let slug = slugify(clinicName)
    const existingSlug = await prisma.clinic.findUnique({ where: { slug } })
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`
    }

    const passwordHash = await hashPassword(password)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 14)

    // Create Stripe customer
    const stripeCustomer = await stripe.customers.create({
      email,
      name: clinicName,
      metadata: { ownerName },
    })

    // Create everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: clinicName,
          slug,
          phone,
          subscriptionStatus: "trialing",
          trialEndsAt,
          stripeCustomerId: stripeCustomer.id,
        },
      })

      const user = await tx.user.create({
        data: {
          clinicId: clinic.id,
          name: ownerName,
          email,
          passwordHash,
          role: "ADMIN",
        },
      })

      await tx.professionalProfile.create({
        data: {
          userId: user.id,
          specialty,
        },
      })

      return { clinic, user }
    })

    return NextResponse.json(
      {
        clinicId: result.clinic.id,
        userId: result.user.id,
        slug: result.clinic.slug,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json(
      { error: "Erro interno ao criar conta. Tente novamente." },
      { status: 500 }
    )
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/public/signup/route.ts
git commit -m "feat: add public signup API with Stripe customer creation"
```

---

### Task 7: Signup page

**Files:**
- Create: `src/app/signup/page.tsx`
- Modify: `src/app/login/page.tsx` (add "Criar conta" link)

**Step 1: Create the signup page**

Create `src/app/signup/page.tsx` — a "use client" page with a form for:
- `clinicName` (text)
- `ownerName` (text)
- `email` (email)
- `password` (password)
- `passwordConfirmation` (password, client-side match check)
- `phone` (text, with Brazilian phone mask)
- `specialty` (text)

On submit:
1. POST to `/api/public/signup`
2. On success: call `signIn("credentials", { email, password, redirect: false })`
3. On success: `router.push("/")`
4. On error: show error message

Style: Match the login page style (centered card, max-w-md). Add a "Ja tem conta? Entrar" link at the bottom.

Use `@superpowers:frontend-design` skill for the actual UI implementation.

**Step 2: Add "Criar conta" link to login page**

In `src/app/login/page.tsx`, add after the submit button (around line 93):

```tsx
<p className="text-center text-sm text-muted-foreground mt-4">
  Nao tem conta?{" "}
  <Link href="/signup" className="text-primary hover:underline font-medium">
    Criar conta gratuitamente
  </Link>
</p>
```

Add `import Link from "next/link"` at the top.

**Step 3: Commit**

```bash
git add src/app/signup/page.tsx src/app/login/page.tsx
git commit -m "feat: add signup page and link from login"
```

---

## Phase 3: Subscription Access Control

### Task 8: Add subscription gating to API wrappers

**Files:**
- Modify: `src/lib/api/with-auth.ts`

**Step 1: Add subscription check to the common auth extraction logic**

The strategy: Add a subscription check inside `withAuth`, `withAuthentication`, and `withFeatureAuth`. When the subscription is read-only, block non-GET requests.

Add this helper function at the top of `src/lib/api/with-auth.ts`:

```typescript
import { prisma } from "@/lib/prisma"
import { isReadOnly, type SubscriptionInfo } from "@/lib/subscription"

async function checkSubscriptionAccess(
  clinicId: string,
  method: string
): Promise<NextResponse | null> {
  // Only check mutation methods
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  })

  if (!clinic) {
    return null // let the handler deal with missing clinic
  }

  const info: SubscriptionInfo = {
    subscriptionStatus: clinic.subscriptionStatus,
    trialEndsAt: clinic.trialEndsAt,
  }

  if (isReadOnly(info)) {
    return NextResponse.json(
      {
        error: "Subscription required",
        message: "Sua assinatura esta inativa. Assine para realizar esta acao.",
        statusCode: 403,
      },
      { status: 403 }
    )
  }

  return null
}
```

Then add a call to `checkSubscriptionAccess` in each wrapper, after the auth check but before the handler:

In `withAuth`:
```typescript
// After line "const scope = getPermissionScope(...)"
const subscriptionBlock = await checkSubscriptionAccess(user.clinicId, req.method)
if (subscriptionBlock) return subscriptionBlock
```

In `withAuthentication`:
```typescript
// After building the user object
const subscriptionBlock = await checkSubscriptionAccess(user.clinicId, req.method)
if (subscriptionBlock) return subscriptionBlock
```

In `withFeatureAuth`:
```typescript
// After the meetsMinAccess check
const subscriptionBlock = await checkSubscriptionAccess(user.clinicId, req.method)
if (subscriptionBlock) return subscriptionBlock
```

**Step 2: Commit**

```bash
git add src/lib/api/with-auth.ts
git commit -m "feat: add subscription access gating to API wrappers"
```

---

### Task 9: Add subscription banner to the frontend layout

**Files:**
- Create: `src/shared/components/SubscriptionBanner.tsx`
- Modify: `src/app/layout.tsx` (or the main authenticated layout)

**Step 1: Create SubscriptionBanner component**

Create `src/shared/components/SubscriptionBanner.tsx`:

```tsx
"use client"

import { useSession } from "next-auth/react"
import { useMemo } from "react"
import Link from "next/link"
import { AlertTriangle, Info, XCircle } from "lucide-react"
import { getSubscriptionBanner, type SubscriptionInfo } from "@/lib/subscription"

export function SubscriptionBanner() {
  const { data: session } = useSession()

  const banner = useMemo(() => {
    if (!session?.user?.subscriptionStatus) return null

    const info: SubscriptionInfo = {
      subscriptionStatus: session.user.subscriptionStatus,
      // trialEndsAt is not in session — we derive from subscriptionStatus alone
      // For trial banners with days remaining, we'd need trialEndsAt in the session
      // For now, show a generic trial message when status is "trialing"
      trialEndsAt: null,
    }

    return getSubscriptionBanner(info)
  }, [session?.user?.subscriptionStatus])

  if (!banner) return null

  const bgColor =
    banner.type === "error"
      ? "bg-destructive/10 border-destructive/20 text-destructive"
      : banner.type === "warning"
        ? "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200"
        : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"

  const Icon =
    banner.type === "error" ? XCircle : banner.type === "warning" ? AlertTriangle : Info

  return (
    <div className={`border-b px-4 py-2 text-sm flex items-center gap-2 ${bgColor}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{banner.message}</span>
      <Link
        href="/admin/billing"
        className="font-medium underline hover:no-underline shrink-0"
      >
        Gerenciar assinatura
      </Link>
    </div>
  )
}
```

**Step 2: Add the banner to the authenticated layout**

Find the main layout that wraps authenticated pages. Add `<SubscriptionBanner />` at the top of the page content area (below the header/nav). The exact placement depends on the existing layout structure — insert it so it appears as a persistent banner at the top.

**Step 3: Commit**

```bash
git add src/shared/components/SubscriptionBanner.tsx
git commit -m "feat: add subscription status banner component"
```

---

## Phase 4: Stripe Billing

### Task 10: Stripe Checkout API

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`

**Step 1: Create the checkout route**

Create `src/app/api/billing/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { withAuthentication } from "@/lib/api"

export const POST = withAuthentication(async (req: NextRequest, user) => {
  const body = await req.json()
  const { planId } = body

  if (!planId) {
    return NextResponse.json({ error: "planId obrigatorio" }, { status: 400 })
  }

  // Only ADMIN can manage billing
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem gerenciar a assinatura" },
      { status: 403 }
    )
  }

  const [clinic, plan] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    }),
    prisma.plan.findUnique({
      where: { id: planId },
      select: { stripePriceId: true, isActive: true },
    }),
  ])

  if (!clinic?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Clinica sem cadastro no Stripe" },
      { status: 400 }
    )
  }

  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: "Plano invalido" }, { status: 400 })
  }

  // If already subscribed, redirect to customer portal for plan change
  if (clinic.stripeSubscriptionId) {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: clinic.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing`,
    })
    return NextResponse.json({ url: portalSession.url })
  }

  // Create a new checkout session
  const session = await stripe.checkout.sessions.create({
    customer: clinic.stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing?canceled=true`,
    metadata: {
      clinicId: user.clinicId,
      planId,
    },
  })

  return NextResponse.json({ url: session.url })
})
```

**Step 2: Commit**

```bash
git add src/app/api/billing/checkout/route.ts
git commit -m "feat: add Stripe Checkout API route"
```

---

### Task 11: Stripe Customer Portal API

**Files:**
- Create: `src/app/api/billing/portal/route.ts`

**Step 1: Create the portal route**

Create `src/app/api/billing/portal/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { withAuthentication } from "@/lib/api"

export const POST = withAuthentication(async (req: NextRequest, user) => {
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem gerenciar a assinatura" },
      { status: 403 }
    )
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: { stripeCustomerId: true },
  })

  if (!clinic?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Clinica sem cadastro no Stripe" },
      { status: 400 }
    )
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: clinic.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
})
```

**Step 2: Commit**

```bash
git add src/app/api/billing/portal/route.ts
git commit -m "feat: add Stripe Customer Portal API route"
```

---

### Task 12: Stripe webhook handler

**Files:**
- Create: `src/app/api/webhooks/stripe/route.ts`

**Step 1: Create the webhook handler**

Create `src/app/api/webhooks/stripe/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id
          const clinicId = session.metadata?.clinicId
          const planId = session.metadata?.planId

          if (clinicId) {
            await prisma.clinic.update({
              where: { id: clinicId },
              data: {
                subscriptionStatus: "active",
                stripeSubscriptionId: subscriptionId,
                ...(planId ? { planId } : {}),
              },
            })
          }
        }
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id

        const clinic = await prisma.clinic.findUnique({
          where: { stripeCustomerId: customerId },
        })

        if (clinic) {
          await prisma.clinic.update({
            where: { id: clinic.id },
            data: {
              subscriptionStatus: subscription.status === "active"
                ? "active"
                : subscription.status === "past_due"
                  ? "past_due"
                  : subscription.status === "canceled"
                    ? "canceled"
                    : subscription.status === "unpaid"
                      ? "unpaid"
                      : clinic.subscriptionStatus,
            },
          })
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id

        await prisma.clinic.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
          },
        })
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id

        if (customerId) {
          await prisma.clinic.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "past_due" },
          })
        }
        break
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id

        if (customerId) {
          await prisma.clinic.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "active" },
          })
        }
        break
      }
    }
  } catch (error) {
    console.error("Stripe webhook processing error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
```

**Step 2: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler for subscription events"
```

---

### Task 13: Plans API (list available plans)

**Files:**
- Create: `src/app/api/public/plans/route.ts`

**Step 1: Create public plans endpoint**

Create `src/app/api/public/plans/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceInCents: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      maxProfessionals: true,
      priceInCents: true,
    },
  })

  return NextResponse.json({ plans })
}
```

**Step 2: Commit**

```bash
git add src/app/api/public/plans/route.ts
git commit -m "feat: add public plans listing API"
```

---

### Task 14: Billing page (frontend)

**Files:**
- Create: `src/app/admin/billing/page.tsx`

**Step 1: Create the billing page**

Create `src/app/admin/billing/page.tsx` — a "use client" page that:

1. Fetches clinic billing info: `GET /api/billing/status` (you'll need to create this simple API that returns the clinic's plan, status, trialEndsAt)
2. Shows:
   - Current plan name and price
   - Subscription status badge (Ativo, Teste, Vencido, Cancelado)
   - Trial expiry date if trialing
   - "Assinar" button → calls `POST /api/billing/checkout` with selected planId, then redirects to the returned URL
   - "Gerenciar assinatura" button → calls `POST /api/billing/portal`, redirects to returned URL
3. Shows success/canceled toast from query params

Use `@superpowers:frontend-design` skill for the actual UI.

**Step 2: Create billing status API**

Create `src/app/api/billing/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuthentication } from "@/lib/api"

export const GET = withAuthentication(async (req: NextRequest, user) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeSubscriptionId: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          priceInCents: true,
          maxProfessionals: true,
        },
      },
    },
  })

  if (!clinic) {
    return NextResponse.json({ error: "Clinica nao encontrada" }, { status: 404 })
  }

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceInCents: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      priceInCents: true,
      maxProfessionals: true,
    },
  })

  return NextResponse.json({
    currentPlan: clinic.plan,
    subscriptionStatus: clinic.subscriptionStatus,
    trialEndsAt: clinic.trialEndsAt,
    hasSubscription: !!clinic.stripeSubscriptionId,
    plans,
  })
})
```

**Step 3: Commit**

```bash
git add src/app/admin/billing/ src/app/api/billing/status/route.ts
git commit -m "feat: add billing page and status API"
```

---

## Phase 5: Landing Page

### Task 15: Replace unauthenticated root page with landing page

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Replace the unauthenticated block**

In `src/app/page.tsx`, replace the unauthenticated block (currently lines ~345-371) with a full landing page that includes:

1. **Header**: Logo ("Clinica") + "Entrar" link → `/login` + "Comecar gratuitamente" button → `/signup`
2. **Hero**: Headline "Gerencie sua clinica de forma simples", subtext about the product, CTA button → `/signup`
3. **Features**: 3-4 feature cards with icons:
   - Agenda (CalendarDays icon) — scheduling and appointments
   - Pacientes (Users icon) — patient management
   - Notificacoes (Bell icon) — WhatsApp/email reminders
   - Relatorios (BarChart3 icon) — dashboard and analytics
4. **Pricing**: Fetch plans from `/api/public/plans` and render a 3-column pricing table. Each plan shows: name, price (formatted as R$X/mes), maxProfessionals, and CTA button → `/signup`
5. **Footer**: "Clinica" branding, copyright year

Use `@superpowers:frontend-design` skill for the actual UI implementation. Ensure the landing page is a separate component (e.g., `LandingPage`) extracted from the main `page.tsx` for clarity.

**Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add SaaS landing page for unauthenticated visitors"
```

---

## Phase 6: Super Admin Panel

### Task 16: Super admin auth (JWT-based)

**Files:**
- Create: `src/lib/superadmin-auth.ts`
- Create: `src/lib/api/with-superadmin.ts`
- Modify: `src/lib/api/index.ts`

**Step 1: Create a standalone JWT helper for super admin**

We use a separate JWT mechanism (not NextAuth) for super admins since they don't have a `clinicId`.

Create `src/lib/superadmin-auth.ts`:

```typescript
import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const SUPER_ADMIN_COOKIE = "superadmin-token"
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret")

export interface SuperAdminSession {
  id: string
  email: string
  name: string
}

export async function createSuperAdminToken(payload: SuperAdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .setIssuedAt()
    .sign(SECRET)
}

export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
    }
  } catch {
    return null
  }
}

export async function setSuperAdminCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SUPER_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60, // 8 hours
    path: "/",
  })
}

export async function clearSuperAdminCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SUPER_ADMIN_COOKIE)
}
```

Note: `jose` is already available as a transitive dependency of `next-auth`. If not, install it: `npm install jose`.

**Step 2: Create withSuperAdmin wrapper**

Create `src/lib/api/with-superadmin.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getSuperAdminSession, type SuperAdminSession } from "@/lib/superadmin-auth"

type SuperAdminHandler = (
  req: NextRequest,
  admin: SuperAdminSession,
  params: Record<string, string>
) => Promise<NextResponse>

type RouteParams = { params: Promise<Record<string, string>> }

export function withSuperAdmin(handler: SuperAdminHandler) {
  return async (req: NextRequest, routeContext?: RouteParams): Promise<NextResponse> => {
    const session = await getSuperAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: "Super admin authentication required" },
        { status: 401 }
      )
    }

    const params = routeContext?.params ? await routeContext.params : {}

    return handler(req, session, params)
  }
}
```

**Step 3: Export from index**

Add to `src/lib/api/index.ts`:

```typescript
export { withSuperAdmin } from "./with-superadmin"
```

**Step 4: Commit**

```bash
git add src/lib/superadmin-auth.ts src/lib/api/with-superadmin.ts src/lib/api/index.ts
git commit -m "feat: add super admin JWT auth and withSuperAdmin wrapper"
```

---

### Task 17: Super admin login API

**Files:**
- Create: `src/app/api/superadmin/login/route.ts`
- Create: `src/app/api/superadmin/logout/route.ts`
- Create: `src/app/api/superadmin/me/route.ts`

**Step 1: Create login route**

Create `src/app/api/superadmin/login/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import { createSuperAdminToken, setSuperAdminCookie } from "@/lib/superadmin-auth"

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha obrigatorios" }, { status: 400 })
  }

  const admin = await prisma.superAdmin.findUnique({
    where: { email },
  })

  if (!admin) {
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 })
  }

  const valid = await verifyPassword(password, admin.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 })
  }

  const token = await createSuperAdminToken({
    id: admin.id,
    email: admin.email,
    name: admin.name,
  })

  await setSuperAdminCookie(token)

  return NextResponse.json({
    admin: { id: admin.id, email: admin.email, name: admin.name },
  })
}
```

**Step 2: Create logout route**

Create `src/app/api/superadmin/logout/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { clearSuperAdminCookie } from "@/lib/superadmin-auth"

export async function POST() {
  await clearSuperAdminCookie()
  return NextResponse.json({ ok: true })
}
```

**Step 3: Create me route**

Create `src/app/api/superadmin/me/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async (_req, admin) => {
  return NextResponse.json({ admin })
})
```

**Step 4: Commit**

```bash
git add src/app/api/superadmin/
git commit -m "feat: add super admin login, logout, and me API routes"
```

---

### Task 18: Super admin login page

**Files:**
- Create: `src/app/superadmin/login/page.tsx`
- Create: `src/app/superadmin/layout.tsx`

**Step 1: Create super admin login page**

Create `src/app/superadmin/login/page.tsx` — a "use client" page similar to the clinic login (`src/app/login/page.tsx`), but:
- POSTs to `/api/superadmin/login`
- On success: `router.push("/superadmin")`
- Title: "Super Admin"
- No "Criar conta" link

**Step 2: Create super admin layout**

Create `src/app/superadmin/layout.tsx`:

```tsx
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
```

This layout intentionally does NOT include the clinic-level header/nav. The super admin pages have their own navigation.

**Step 3: Commit**

```bash
git add src/app/superadmin/
git commit -m "feat: add super admin login page and layout"
```

---

### Task 19: Super admin clinics API

**Files:**
- Create: `src/app/api/superadmin/clinics/route.ts`
- Create: `src/app/api/superadmin/clinics/[id]/route.ts`

**Step 1: Create clinics list endpoint**

Create `src/app/api/superadmin/clinics/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const status = searchParams.get("status") || ""
  const page = parseInt(searchParams.get("page") || "1")
  const limit = 20

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ]
  }

  if (status) {
    where.subscriptionStatus = status
  }

  const [clinics, total] = await Promise.all([
    prisma.clinic.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        isActive: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
        plan: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            users: true,
            patients: true,
          },
        },
      },
    }),
    prisma.clinic.count({ where }),
  ])

  return NextResponse.json({ clinics, total, page, totalPages: Math.ceil(total / limit) })
})
```

**Step 2: Create single clinic endpoint with actions**

Create `src/app/api/superadmin/clinics/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async (_req, _admin, params) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: {
      plan: true,
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: {
          patients: true,
          appointments: true,
        },
      },
    },
  })

  if (!clinic) {
    return NextResponse.json({ error: "Clinica nao encontrada" }, { status: 404 })
  }

  return NextResponse.json({ clinic })
})

export const PATCH = withSuperAdmin(async (req: NextRequest, _admin, params) => {
  const body = await req.json()
  const { action } = body

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id } })
  if (!clinic) {
    return NextResponse.json({ error: "Clinica nao encontrada" }, { status: 404 })
  }

  switch (action) {
    case "extend_trial": {
      const { days } = body
      const currentEnd = clinic.trialEndsAt || new Date()
      const newEnd = new Date(currentEnd)
      newEnd.setDate(newEnd.getDate() + (days || 14))
      await prisma.clinic.update({
        where: { id: params.id },
        data: { trialEndsAt: newEnd, subscriptionStatus: "trialing" },
      })
      return NextResponse.json({ ok: true, trialEndsAt: newEnd })
    }

    case "change_plan": {
      const { planId } = body
      await prisma.clinic.update({
        where: { id: params.id },
        data: { planId },
      })
      return NextResponse.json({ ok: true })
    }

    case "deactivate": {
      await prisma.clinic.update({
        where: { id: params.id },
        data: { isActive: false },
      })
      return NextResponse.json({ ok: true })
    }

    case "reactivate": {
      await prisma.clinic.update({
        where: { id: params.id },
        data: { isActive: true },
      })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 })
  }
})
```

**Step 3: Commit**

```bash
git add src/app/api/superadmin/clinics/
git commit -m "feat: add super admin clinics API with actions"
```

---

### Task 20: Super admin plans API

**Files:**
- Create: `src/app/api/superadmin/plans/route.ts`
- Create: `src/app/api/superadmin/plans/[id]/route.ts`

**Step 1: Create plans CRUD endpoints**

Create `src/app/api/superadmin/plans/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async () => {
  const plans = await prisma.plan.findMany({
    orderBy: { priceInCents: "asc" },
    include: {
      _count: { select: { clinics: true } },
    },
  })

  return NextResponse.json({ plans })
})

export const POST = withSuperAdmin(async (req: NextRequest) => {
  const body = await req.json()
  const { name, slug, stripePriceId, maxProfessionals, priceInCents } = body

  if (!name || !slug || !stripePriceId || maxProfessionals === undefined || !priceInCents) {
    return NextResponse.json({ error: "Todos os campos sao obrigatorios" }, { status: 400 })
  }

  const plan = await prisma.plan.create({
    data: { name, slug, stripePriceId, maxProfessionals, priceInCents },
  })

  return NextResponse.json({ plan }, { status: 201 })
})
```

Create `src/app/api/superadmin/plans/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const PATCH = withSuperAdmin(async (req: NextRequest, _admin, params) => {
  const body = await req.json()

  const plan = await prisma.plan.update({
    where: { id: params.id },
    data: body,
  })

  return NextResponse.json({ plan })
})
```

**Step 2: Commit**

```bash
git add src/app/api/superadmin/plans/
git commit -m "feat: add super admin plans CRUD API"
```

---

### Task 21: Super admin dashboard API

**Files:**
- Create: `src/app/api/superadmin/dashboard/route.ts`

**Step 1: Create dashboard stats endpoint**

Create `src/app/api/superadmin/dashboard/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async () => {
  const [
    totalClinics,
    activeTrial,
    activeSubscription,
    canceledCount,
    pastDueCount,
  ] = await Promise.all([
    prisma.clinic.count(),
    prisma.clinic.count({ where: { subscriptionStatus: "trialing" } }),
    prisma.clinic.count({ where: { subscriptionStatus: "active" } }),
    prisma.clinic.count({ where: { subscriptionStatus: "canceled" } }),
    prisma.clinic.count({ where: { subscriptionStatus: "past_due" } }),
  ])

  // MRR calculation: sum of active subscriptions' plan prices
  const activeClinicPlans = await prisma.clinic.findMany({
    where: {
      subscriptionStatus: "active",
      planId: { not: null },
    },
    select: {
      plan: { select: { priceInCents: true } },
    },
  })

  const mrrInCents = activeClinicPlans.reduce(
    (sum, c) => sum + (c.plan?.priceInCents || 0),
    0
  )

  return NextResponse.json({
    totalClinics,
    activeTrial,
    activeSubscription,
    canceledCount,
    pastDueCount,
    mrrInCents,
  })
})
```

**Step 2: Commit**

```bash
git add src/app/api/superadmin/dashboard/route.ts
git commit -m "feat: add super admin dashboard stats API"
```

---

### Task 22: Super admin frontend pages

**Files:**
- Create: `src/app/superadmin/page.tsx` (dashboard)
- Create: `src/app/superadmin/clinics/page.tsx` (clinic list)
- Create: `src/app/superadmin/clinics/[id]/page.tsx` (clinic detail)
- Create: `src/app/superadmin/plans/page.tsx` (plan management)
- Modify: `src/app/superadmin/layout.tsx` (add nav)

Use `@superpowers:frontend-design` skill for all UI implementations in this task.

**Step 1: Update layout with sidebar navigation**

Update `src/app/superadmin/layout.tsx` to include a sidebar with links to:
- Dashboard (`/superadmin`)
- Clinicas (`/superadmin/clinics`)
- Planos (`/superadmin/plans`)
- Logout button (calls `POST /api/superadmin/logout` then redirects to `/superadmin/login`)

Check the super admin session via `GET /api/superadmin/me` on mount. If not authenticated, redirect to `/superadmin/login`.

**Step 2: Dashboard page**

Fetches from `GET /api/superadmin/dashboard` and shows stat cards:
- Total clinicas
- Em teste (trialing)
- Assinantes ativos
- MRR formatted as R$

**Step 3: Clinics list page**

Fetches from `GET /api/superadmin/clinics` with search and status filter. Table columns: Name, Slug, Plan, Status badge, Users count, Patients count, Created date. Click row → clinic detail.

**Step 4: Clinic detail page**

Fetches from `GET /api/superadmin/clinics/[id]`. Shows:
- Clinic info (name, slug, email, phone)
- Subscription info (plan, status, trial expiry)
- Action buttons: Extend trial, Change plan, Deactivate/Reactivate
- Users table
- Usage counts (patients, appointments)

**Step 5: Plans management page**

Fetches from `GET /api/superadmin/plans`. Table with plan CRUD. Form for creating/editing plans.

**Step 6: Commit**

```bash
git add src/app/superadmin/
git commit -m "feat: add super admin dashboard, clinics, and plans pages"
```

---

## Phase 7: Plan Limit Enforcement + Seed

### Task 23: Enforce professional limit on user creation

**Files:**
- Modify: `src/app/api/users/route.ts`

**Step 1: Add plan limit check to POST handler**

In the `POST` handler of `src/app/api/users/route.ts`, after the duplicate email check and before creating the user, add:

```typescript
// Check professional limit if creating a PROFESSIONAL user
if (role !== "ADMIN") {
  const [clinic, profCount] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { plan: { select: { maxProfessionals: true } } },
    }),
    prisma.professionalProfile.count({
      where: { user: { clinicId: user.clinicId } },
    }),
  ])

  const { allowed, message } = checkProfessionalLimit({
    maxProfessionals: clinic?.plan?.maxProfessionals ?? null,
    currentCount: profCount,
  })

  if (!allowed) {
    return NextResponse.json({ error: message }, { status: 403 })
  }
}
```

Add import: `import { checkProfessionalLimit } from "@/lib/subscription"`

**Step 2: Commit**

```bash
git add src/app/api/users/route.ts
git commit -m "feat: enforce plan professional limit on user creation"
```

---

### Task 24: Seed plans and super admin

**Files:**
- Create: `prisma/seed-saas.ts`

**Step 1: Create a SaaS seed script**

Create `prisma/seed-saas.ts` — a script that seeds:
1. Three plans (Basic, Pro, Enterprise) with placeholder Stripe price IDs
2. One super admin user (`superadmin@clinica.com` / `admin`)

```typescript
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

async function main() {
  // Seed plans
  const plans = [
    {
      name: "Basic",
      slug: "basic",
      stripePriceId: "price_basic_placeholder",
      maxProfessionals: 2,
      priceInCents: 9900, // R$99
    },
    {
      name: "Pro",
      slug: "pro",
      stripePriceId: "price_pro_placeholder",
      maxProfessionals: 10,
      priceInCents: 19900, // R$199
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      stripePriceId: "price_enterprise_placeholder",
      maxProfessionals: -1, // unlimited
      priceInCents: 39900, // R$399
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    })
  }
  console.log("Plans seeded")

  // Seed super admin
  const passwordHash = await bcrypt.hash("admin", 12)
  await prisma.superAdmin.upsert({
    where: { email: "superadmin@clinica.com" },
    update: { passwordHash },
    create: {
      email: "superadmin@clinica.com",
      name: "Super Admin",
      passwordHash,
    },
  })
  console.log("Super admin seeded: superadmin@clinica.com / admin")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

**Step 2: Add a script to package.json**

Add to `scripts` in `package.json`:

```json
"prisma:seed-saas": "npx tsx prisma/seed-saas.ts"
```

**Step 3: Run the seed**

Run: `npm run prisma:seed-saas`
Expected: Plans and super admin created.

**Step 4: Commit**

```bash
git add prisma/seed-saas.ts package.json
git commit -m "feat: add SaaS seed script for plans and super admin"
```

---

### Task 25: Run full test suite and fix issues

**Step 1: Run all tests**

Run: `npm run test`
Expected: All existing tests still pass. Fix any that break due to schema changes.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds. Fix any TypeScript errors from the new `subscriptionStatus` field on session or missing optional chaining.

**Step 3: Commit fixes if needed**

```bash
git add -A
git commit -m "fix: resolve test and build issues from SaaS changes"
```

---

### Task 26: Create Stripe products (manual step)

This is a manual configuration step, not code:

1. Go to https://dashboard.stripe.com/test/products
2. Create 3 products: Basic, Pro, Enterprise
3. For each, create a recurring price in BRL (R$99, R$199, R$399 per month)
4. Copy the price IDs (`price_xxx`) and update the plan records in the database (or update `seed-saas.ts` and re-run)
5. Configure the Stripe Customer Portal at https://dashboard.stripe.com/test/settings/billing/portal
6. Set up the webhook endpoint at https://dashboard.stripe.com/test/webhooks — point to your deployment URL's `/api/webhooks/stripe` and select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`
7. Copy the webhook signing secret to your `.env` as `STRIPE_WEBHOOK_SECRET`

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-4 | Schema, Stripe SDK, subscription helpers (TDD) |
| 2 | 5-7 | Auth config, signup API + page |
| 3 | 8-9 | Subscription gating (API + banner) |
| 4 | 10-14 | Stripe checkout, webhooks, billing page |
| 5 | 15 | Landing page |
| 6 | 16-22 | Super admin (auth, APIs, pages) |
| 7 | 23-26 | Plan limits, seed, tests, Stripe config |

Total: 26 tasks across 7 phases.
