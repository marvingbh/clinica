# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clinica is a multi-tenant clinic management system built with Next.js 16+, PostgreSQL (via Prisma), and NextAuth.js for authentication. It provides appointment scheduling, patient management, notification systems, and audit logging for healthcare clinics in Brazil.

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

### Database Setup

```bash
docker-compose up -d     # Start PostgreSQL container
npm run prisma:push      # Apply schema
npm run prisma:seed      # Create test clinic and admin user (admin@x.com / admin)
```

## Architecture

### Multi-tenant Model

All data is scoped by `clinicId`. Users belong to a clinic and can only access data within their clinic. The tenant isolation is enforced at the database query level.

### Authentication & Authorization

- **NextAuth.js** with credentials provider (`src/lib/auth.ts`)
- **RBAC system** in `src/lib/rbac/`:
  - Two roles: `ADMIN` (clinic-wide access) and `PROFESSIONAL` (own resources only)
  - Permissions have scope: `own` (user's resources), `clinic` (all clinic resources)
  - `withAuth()` HOF wraps API routes with auth + permission checks

### Key Domain Models (prisma/schema.prisma)

- **Clinic**: Tenant with settings (session duration, reminder hours)
- **User**: Staff account with role (ADMIN/PROFESSIONAL)
- **ProfessionalProfile**: Extended profile for providers with availability settings
- **Patient**: LGPD-compliant patient records with consent tracking
- **Appointment**: Individual appointments with status workflow (AGENDADO → CONFIRMADO → FINALIZADO)
- **AppointmentRecurrence**: Recurring appointment patterns (weekly/biweekly/monthly)
- **AvailabilityRule/Exception**: Professional availability management
- **Notification**: Multi-channel (WhatsApp/Email) notification queue with retry logic

### Code Organization

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (use withAuth wrapper)
│   ├── agenda/            # Calendar/scheduling pages
│   │   ├── components/    # Agenda-specific components
│   │   ├── hooks/         # Custom hooks (useAppointmentCreate, etc.)
│   │   └── services/      # Data fetching services
│   └── [other pages]/
├── lib/                    # Core utilities
│   ├── api/               # API helpers (withAuth, withAuthentication)
│   ├── appointments/      # Appointment logic (conflicts, recurrence)
│   ├── notifications/     # Notification service + providers
│   ├── rbac/              # Role-based access control
│   ├── auth.ts            # NextAuth configuration
│   └── prisma.ts          # Prisma client singleton
├── shared/components/ui/   # Reusable UI components
└── generated/prisma/       # Generated Prisma client (do not edit)
```

### API Route Pattern

Use the `withAuth` wrapper for protected routes:

```typescript
export const GET = withAuth(
  { resource: "appointment", action: "read" },
  async (req, { user, scope }, params) => {
    // Handler with user context and permission scope
  }
)
```

### Notification System

- Providers: `whatsapp-mock` (dev) and `email-resend`
- Template system with variable substitution (`{{patientName}}`, etc.)
- Exponential backoff retry with configurable max attempts
- Cron job at `/api/jobs/send-reminders` for scheduled reminders

### Frontend

- PWA-enabled with service workers
- Responsive design: desktop header + mobile bottom navigation
- Page transitions via `PageTransition` component
- Toast notifications via Sonner
- Forms with react-hook-form + zod validation

### Component Guidelines

- **Extract repeated UI patterns into reusable components** in `shared/components/` or the feature's `components/` folder. Do not duplicate the same markup/logic across multiple files.
- When the same label, badge, icon, or indicator appears in 3+ places, create a small component for it (e.g., `RecurrenceBadge`, `StatusBadge`).
- Keep components small and single-purpose. A component that grows beyond ~150 lines likely needs splitting.
- Place shared/cross-feature components in `src/shared/components/`. Place feature-specific components in the feature's own `components/` folder (e.g., `src/app/agenda/components/`).
- Prefer composable props over conditional rendering spaghetti. If a component has many `isCompact && ... isTall && ...` branches, extract the variants into separate sub-components or use a layout prop.

### Localization (Brazilian Portuguese)

- **Date format**: Always use `DD/MM/YYYY` (Brazilian format)
- **Time format**: Use 24-hour format `HH:mm`
- **Currency**: BRL (R$)
- **Locale**: `pt-BR` for all `toLocaleDateString()` and `toLocaleTimeString()` calls
- **Date inputs**: Use text inputs with mask/pattern for Brazilian format, NOT native `type="date"` (which uses system locale)

## Testing

**Every new feature or bug fix must include unit tests.** Run `npm run test` before committing.

- **Test runner:** Vitest (`vitest.config.ts`)
- **Test location:** Colocated — `foo.test.ts` next to `foo.ts`
- **Run all tests:** `npm run test`
- **Run one file:** `npx vitest run src/lib/path/to/file.test.ts`
- **Watch mode:** `npm run test:watch`

### What to test

- All pure business logic in `src/lib/` (recurrence, permissions, formatting, rate limiting, etc.)
- New utility functions, validators, and formatters
- Any function with non-trivial logic, edge cases, or date/currency handling

### Test conventions

- Import `{ describe, it, expect }` from `"vitest"` (globals enabled)
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` for time-dependent code
- For Prisma enums, use plain string literals (e.g., `"ADMIN"`, `"WEEKLY"`) — they're strings at runtime
- Keep tests focused: one behavior per `it()` block
- Use unique keys/IDs per test to avoid cross-contamination in stateful modules

### Existing test coverage

Tests exist for: `appointments/recurrence`, `audit/field-labels`, `rbac/permissions`, `rbac/authorize`, `rate-limit`, `notifications/types`

## Path Aliases

Use `@/` for imports from `src/`:
```typescript
import { prisma } from "@/lib/prisma"
import { Button } from "@/shared/components/ui/button"
```
