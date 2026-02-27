# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clinica is a multi-tenant SaaS clinic management system built with Next.js 16+, PostgreSQL (via Prisma), and NextAuth.js for authentication. It provides appointment scheduling, patient management, billing/invoicing, notification systems, and audit logging for healthcare clinics in Brazil. There is also a superadmin panel for managing clinics and Stripe subscription plans.

## Development Commands

```bash
npm run dev              # Start development server
npm run build            # Build for production (runs prisma generate first)
npm run lint             # Run ESLint
npm run prisma:migrate   # Run Prisma migrations (dev)
npm run prisma:push      # Push schema changes without migrations
npm run prisma:studio    # Open Prisma Studio GUI
npm run prisma:seed      # Seed database with test data
npm run test             # Run all unit tests (vitest)
npm run test:watch       # Run tests in watch mode
```

### Single test file

```bash
npx vitest run src/lib/path/to/file.test.ts
```

### Database Setup

```bash
docker-compose up -d     # Start PostgreSQL container
npm run prisma:push      # Apply schema
npm run prisma:seed      # Create test clinic and admin user (admin@x.com / admin)
```

**Note:** When schema has drifted from migration history, use `npx prisma db push` instead of `npx prisma migrate dev`.

### Vercel Build

The `vercel-build` script runs: `prisma generate && vitest run && prisma migrate deploy && next build`. Tests must pass before deploy.

## Architecture

### Multi-tenant Model

All data is scoped by `clinicId`. Users belong to a clinic and can only access data within their clinic. The tenant isolation is enforced at the database query level.

### Authentication & Authorization

- **NextAuth.js** with credentials provider (`src/lib/auth.ts`)
- **Separate superadmin auth** (`src/lib/superadmin-auth.ts`) — JWT-based, not tied to any clinic
- **Feature-based RBAC** in `src/lib/rbac/`:
  - Two roles: `ADMIN` (clinic-wide access) and `PROFESSIONAL` (own resources only)
  - Permissions are feature-level (e.g., `agenda_own`, `patients`, `finances`) with access levels: `NONE`, `READ`, `WRITE`
  - Per-user permission overrides via `UserPermission` model (if no override exists, role default applies)
  - `withAuth()` and `withFeatureAuth()` HOFs wrap API routes with auth + permission checks
- **AuthUser type** (`src/lib/rbac/types.ts`): has `id`, `clinicId`, `role`, `professionalProfileId`, and `permissions`. Does NOT have `name` or `email`.

### Key Domain Models (prisma/schema.prisma)

- **Clinic**: Tenant with settings, Stripe subscription, and billing mode (PER_SESSION/MONTHLY_FIXED)
- **User/ProfessionalProfile**: Staff accounts with role-based access
- **Patient**: LGPD-compliant records with consent tracking, session fee, reference professional
- **Appointment**: Calendar entries with status workflow (AGENDADO → CONFIRMADO → FINALIZADO) and 5 types (CONSULTA, TAREFA, LEMBRETE, NOTA, REUNIAO)
- **AppointmentRecurrence**: Recurring patterns (weekly/biweekly/monthly) with exceptions
- **TherapyGroup/GroupMembership**: Group therapy with patient membership tracking
- **Invoice/InvoiceItem/SessionCredit**: Financial module for billing, invoicing, and credit management
- **Plan/SuperAdmin**: SaaS subscription plans and platform administration

### Appointment Types

- `CONSULTA`: Requires patient; gets notifications, reminders, confirmation tokens; blocks time
- `TAREFA`/`REUNIAO`: No patient required; blocks time; no notifications
- `LEMBRETE`/`NOTA`: No patient required; does NOT block time; renders as small chips in timeline

### Code Organization (Domain-Driven Design)

Business logic lives in **domain modules** under `src/lib/`, organized by bounded context. Each module owns its types, pure functions, barrel `index.ts`, and colocated tests. API routes and UI components are thin adapters.

```
src/
├── app/                    # Next.js App Router (adapters / thin orchestration)
│   ├── api/               # API routes — Prisma queries + domain function calls
│   │   ├── public/        # Unauthenticated routes (confirm, cancel, signup, plans)
│   │   ├── superadmin/    # Platform admin routes (JWT-based auth)
│   │   ├── jobs/          # Cron job endpoints (send-reminders, extend-recurrences)
│   │   ├── financeiro/    # Billing/invoice routes
│   │   └── ...            # Standard authenticated routes
│   ├── agenda/            # Calendar/scheduling pages
│   ├── financeiro/        # Financial pages (invoices, credits, pricing)
│   ├── superadmin/        # Platform admin UI
│   └── [other pages]/
├── lib/                    # Domain modules (business logic lives here)
│   ├── api/               # API helpers (withAuth, withFeatureAuth, withSuperAdmin)
│   ├── appointments/      # Conflicts, recurrence, biweekly pairing, status transitions, HMAC-signed links
│   ├── financeiro/        # Invoice generation, formatting, billing labels, templates
│   ├── notifications/     # Notification service, providers, phone number handling
│   ├── rbac/              # Feature-based authorization (roles, permissions, types)
│   ├── subscription/      # SaaS plan limits and subscription status checks
│   ├── groups/            # Therapy group logic
│   ├── audit/             # Audit log field labels
│   ├── auth.ts            # NextAuth configuration
│   ├── superadmin-auth.ts # Superadmin JWT auth
│   ├── prisma.ts          # Prisma client singleton
│   └── rate-limit.ts      # In-memory rate limiting
├── shared/components/ui/   # Reusable UI components
└── generated/prisma/       # Generated Prisma client (do not edit)
```

**DDD principles to follow:**
- **Domain logic in `src/lib/`**: Pure functions with clear inputs/outputs, no framework dependencies. Easy to test.
- **API routes are adapters**: They handle HTTP, call Prisma for data, then pass data to domain functions. No business logic inline in routes.
- **One module per bounded context**: Each has its own types, functions, index.ts barrel, and colocated tests.
- **Avoid anemic modules**: If a domain concept has behavior (validation, computation, matching), it belongs in the domain module — not scattered across routes or components.

### API Route Patterns

Standard authenticated route with legacy resource/action check:

```typescript
export const GET = withAuth(
  { resource: "appointment", action: "read" },
  async (req, { user, scope }, params) => {
    // Handler with user context and permission scope
  }
)
```

Feature-based auth (preferred for new routes):

```typescript
export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req, { user }) => { ... }
)
```

Public routes (no auth) go in `src/app/api/public/` and use `withAuthentication()` or plain handlers.

### Notification System

- Providers: `whatsapp-mock` (dev) and `email-resend`
- Template system with variable substitution (`{{patientName}}`, etc.)
- Exponential backoff retry with configurable max attempts

### Cron Jobs (vercel.json)

- `/api/jobs/send-reminders` — daily at 10:00 UTC: sends appointment reminders
- `/api/jobs/extend-recurrences` — weekly on Mondays at 02:00 UTC: generates future appointments for INDEFINITE recurrences

### Frontend

- PWA-enabled with service workers
- Responsive design: desktop header + mobile bottom navigation
- Page transitions via `PageTransition` component
- Toast notifications via Sonner
- Forms with react-hook-form + zod validation
- Icons via lucide-react

### Component Guidelines

- **Extract repeated UI patterns into reusable components** in `shared/components/` or the feature's `components/` folder. Do not duplicate the same markup/logic across multiple files.
- When the same label, badge, icon, or indicator appears in 3+ places, create a small component for it (e.g., `RecurrenceBadge`, `StatusBadge`).
- Keep components small and single-purpose. A component that grows beyond ~150 lines likely needs splitting.
- Place shared/cross-feature components in `src/shared/components/`. Place feature-specific components in the feature's own `components/` folder (e.g., `src/app/agenda/components/`).
- Prefer composable props over conditional rendering spaghetti. If a component has many `isCompact && ... isTall && ...` branches, extract the variants into separate sub-components or use a layout prop.

### File Size & Complexity

- **Never create files longer than ~200 lines.** If a new file is approaching that, split it into focused modules before it grows further.
- **When touching an existing file that is too large (>300 lines) or has duplicated logic, proactively suggest extracting it** into a dedicated module in `src/lib/` with pure, testable functions. Do not silently add more code to an already bloated file.
- API route handlers should be thin orchestration: Prisma queries + calls to extracted business logic. If a route handler has >50 lines of inline logic, extract it.
- Duplicated logic (same pattern repeated 2+ times) must be extracted into a shared helper. Never copy-paste matching/filtering/formatting logic.

### Localization (Brazilian Portuguese)

- **Date format**: Always use `DD/MM/YYYY` (Brazilian format)
- **Time format**: Use 24-hour format `HH:mm`
- **Currency**: BRL (R$)
- **Locale**: `pt-BR` for all `toLocaleDateString()` and `toLocaleTimeString()` calls
- **Date inputs**: Use text inputs with mask/pattern for Brazilian format, NOT native `type="date"` (which uses system locale)

### Nullable Patient Gotcha

When `patient` is nullable (non-CONSULTA appointment types), ALL usages of `patient.name`, `patient.phone`, etc. need `?.` optional chaining. Run `npm run build` to catch them all. Commonly affected files: `TimeSlotCard.tsx`, `AppointmentBlock.tsx`, group session routes, cancel/confirm routes, status routes, resend-confirmation.

## Testing

**Every new feature or bug fix must include unit tests.** Run `npm run test` before committing.

- **Test runner:** Vitest (`vitest.config.ts`)
- **Test location:** Colocated — `foo.test.ts` next to `foo.ts`
- **Run all tests:** `npm run test`
- **Run one file:** `npx vitest run src/lib/path/to/file.test.ts`
- **Watch mode:** `npm run test:watch`

### What to test

- All pure business logic in `src/lib/` (recurrence, permissions, formatting, billing, rate limiting, etc.)
- New utility functions, validators, and formatters
- Any function with non-trivial logic, edge cases, or date/currency handling

### Test conventions

- Import `{ describe, it, expect }` from `"vitest"` (globals enabled)
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` for time-dependent code
- For Prisma enums, use plain string literals (e.g., `"ADMIN"`, `"WEEKLY"`) — they're strings at runtime
- Keep tests focused: one behavior per `it()` block
- Use unique keys/IDs per test to avoid cross-contamination in stateful modules

### Existing test coverage

Tests exist for: `appointments/recurrence`, `appointments/biweekly`, `appointments/appointment-links`, `appointments/status-transitions`, `audit/field-labels`, `rbac/permissions`, `rbac/authorize`, `rate-limit`, `notifications/types`, `notifications/phone-numbers`, `financeiro/format`, `financeiro/invoice-generator`, `financeiro/invoice-template`, `subscription/limits`, `subscription/status`, `superadmin-auth`, `api/with-superadmin`

## Path Aliases

Use `@/` for imports from `src/`:
```typescript
import { prisma } from "@/lib/prisma"
import { Button } from "@/shared/components/ui/button"
```
