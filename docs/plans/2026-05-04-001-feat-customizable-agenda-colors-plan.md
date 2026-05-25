---
title: Customizable Agenda Colors per Clinic
type: feat
status: active
date: 2026-05-04
origin: docs/brainstorms/2026-05-04-customizable-agenda-colors-brainstorm.md
---

# Customizable Agenda Colors per Clinic

## Enhancement Summary

**Deepened on:** 2026-05-04
**Sections enhanced:** Helper module, API, React Context, Acceptance Criteria, Risks, Files to Modify
**Research agents used:** kieran-typescript-reviewer, security-sentinel, performance-oracle, code-simplicity-reviewer, architecture-strategist, data-integrity-guardian, best-practices-researcher (Tailwind v4), framework-docs-researcher (Prisma JSON / Next.js 16 / NextAuth)

### Key improvements layered onto v1

1. **Module relocation** — moved from `src/app/agenda/lib/clinic-colors.ts` into a domain module `src/lib/clinic/colors/` per CLAUDE.md DDD policy (the API route can't import from `src/app/agenda/`). Split into `types.ts`, `palette.ts`, `schema.ts`, `resolvers.ts`, `colors.test.ts`.
2. **Type system upgrade** — `as const satisfies Record<...>` instead of explicit annotations to preserve literal-string inference. `PaletteName`, `AgendaColorSlot`, `AgendaColors` derived from `as const` arrays so Zod, types, and the literal map are guaranteed to stay in sync.
3. **Provider memoization (perf-critical)** — `AppointmentBlock` is already `React.memo`-wrapped. Without `useMemo` on the Provider's `value`, every parent re-render of the agenda page would invalidate 50–200 memoized appointment blocks via the context-update path. Now mandatory.
4. **Separate read-only endpoint** — added `GET /api/clinic/agenda-colors` (gated on `agenda_own`) so PROFESSIONAL users — who don't have `clinic_settings:READ` — can fetch agenda colors without granting them admin scope. Resolves the API-surface ambiguity in v1.
5. **Server Component data fetch** — switched from "client mount + Context" to Next.js 16's documented pattern: fetch in a Server Component layout, pass an unawaited `Promise<AgendaColors>` to a Client Provider, resolve with `use()` in consumers. Eliminates Flash of Default Colors and avoids `useEffect` per CLAUDE.md.
6. **Tailwind v4 belt-and-suspenders safelist** — literal `PALETTE_CLASSES` map remains the primary mechanism, but now also adds an `@source inline("…")` directive in `globals.css` as defense-in-depth (the v4 official safelist mechanism — there is no `@safelist`).
7. **Hardened type narrowing** — `resolveAgendaColors` does per-key narrowing for `Prisma.JsonValue`, handling `undefined`, SQL `NULL`, JSON `null`, scalars, arrays, partial objects, and unknown keys. Tests for every malformed shape.
8. **Single generic resolver** — collapsed `getAppointmentColors` / `getGroupSessionColors` / `getAvailabilityColors` into one `paletteFor(slot, colors)` taking a `AgendaColorSlot` discriminator. Three call-site flavors become trivial wrappers.
9. **Adversarial Zod tests** — explicit tests for `__proto__`, prototype-pollution payloads, top-level arrays/scalars, unknown enum values. Even though `.strict()` covers them, lock the contract via tests.
10. **CI guardrails** — repo-wide grep in PR CI rejects `` bg-${ ``, `` border-${ ``, `` text-${ `` interpolations in `src/app/agenda` and `src/app/admin/settings`. Plus the existing compiled-CSS smoke test (AC-15) keeps the Tailwind safelist honest.

### New considerations discovered

- **Audit logging gap is pre-existing, not introduced.** The existing `/api/admin/settings` PATCH writes zero audit log entries today (covers `slug`, `billingMode`, `taxPercentage`, etc.). `agendaColors` is low-sensitivity cosmetic config — defer the audit work to a separate plan.
- **JWT bloat.** Putting `agendaColors` on the NextAuth JWT was tempting (zero round-trips) but rejected per official docs — JWT cookies are bounded to ~4096 bytes and a clinic config blob doesn't belong there. Server-Component fetch is cheaper and always fresh.
- **Cookie SameSite is `lax` by default** in NextAuth v5 → CSRF on the new tab is blocked at the cookie level. No new mitigation work.
- **Postgres JSONB defaults are metadata-only** in PG 11+ — the migration is fast (sub-second `AccessExclusiveLock`), no table rewrite, no NULL window. Mirror the precedent migrations `20260317_add_clinic_email_bcc` and `20260319_add_attending_professional_and_repasse_payment`.
- **Prototype pollution is contained** by Zod `.strict()` — verified no spread/Object.assign code path that would expose it.

## Overview

Today, every agenda block draws its color from a hard-coded `ENTRY_TYPE_COLORS` map (`bg-violet-50`, `bg-sky-50`, …) plus several inline literals scattered across the agenda components (group sessions are unconditionally purple, availability slots unconditionally teal). When the user filters to a single professional, every block also collapses onto the same color and the view becomes hard to scan.

This plan adds a **per-clinic JSON column** that maps each entry-type slot to a Tailwind palette name, a new "Cores" tab in `/admin/settings` where ADMIN users pick palettes from a 16-swatch grid, and reworks the agenda's color resolution so blocks render in the configured colors when the per-professional palette isn't in play. It also drops Tarefa and Nota from the agenda's create-FAB menu (they live in `/tarefas` now) while keeping legacy records rendering via the original constants.

## Problem Statement

Three connected problems:

1. **Single-professional view is illegible.** When a single professional is selected, the agenda drops the per-professional color palette and falls back to type-based colors that today read white-with-blue-border for Consulta — the dominant entry type — making CONSULTA appointments visually disappear against the grid background.
2. **Colors are not configurable per clinic.** Each clinic has different visual conventions; the current hard-coded map can't reflect them.
3. **Inconsistent color sources.** `AppointmentBlock`/`AppointmentCard` read `ENTRY_TYPE_COLORS`, but `GroupSessionBlock`/`GroupSessionCard` use hardcoded `purple-*`, `AvailabilitySlotBlock` uses hardcoded `teal-*`, `DailyPrintGrid` has its own `TYPE_CHIP` map, and `AgendaFabMenu` icons hardcode their own palette. Any color change today requires touching 5+ files; there's no single source of truth.

## Proposed Solution

A single `agendaColors` JSONB column on `Clinic` stores `{ consulta, reuniao, lembrete, groupSession, availability }`, each value a short palette name (`"red"`, `"blue"`, …) drawn from a fixed allowlist. A new module `src/app/agenda/lib/clinic-colors.ts` exposes:

- `PALETTE_NAMES` — the canonical allowlist (~16 entries).
- `PALETTE_CLASSES` — a **literal-string** map from palette name to `{ bg, border, borderLeft, text, accent }` Tailwind classes (so Tailwind v4's content scanner sees every class statically — see Risk #1).
- `DEFAULT_AGENDA_COLORS` — the fallback shape (`{ consulta: "red", reuniao: "blue", lembrete: "yellow", groupSession: "violet", availability: "green" }`).
- Resolver helpers (`getAppointmentColors(type, clinicColors)`, `getGroupSessionColors(clinicColors)`, `getAvailabilityColors(clinicColors)`) that merge stored colors with defaults and fall back to the legacy `ENTRY_TYPE_COLORS` for `TAREFA`/`NOTA` records (no migration needed for old rows).

The agenda page wraps its tree in an `AgendaColorsProvider` so every nested block, card, and print view reads the same source via `useAgendaColors()`. The activation rule is unchanged from today: **whenever the per-professional palette is not being applied, the clinic-configured colors are used.** This covers (a) ADMIN with a single-professional filter and (b) PROFESSIONAL role users (who never see the per-professional palette today).

ADMIN users edit colors in a new tab "Cores" on `/admin/settings`. Each of the 5 slots renders as a row with a 16-swatch grid; clicking a swatch updates local form state, the bottom Save button issues a `PATCH /api/admin/settings` (existing route extended with the new `agendaColors` field). No live preview in v1.

## Technical Approach

### Architecture

#### Source of truth

```
Clinic.agendaColors (JSONB)            ← persisted shape, validated by Zod
        │
        ▼
GET /api/admin/settings (existing)     ← extended select returns agendaColors
        │
        ▼
src/app/agenda/lib/clinic-colors.ts    ← merge with DEFAULT_AGENDA_COLORS
        │
        ▼
<AgendaColorsProvider>                 ← React context, set once per page render
        │
        ▼
useAgendaColors() in every block       ← AppointmentBlock, GroupSessionBlock,
                                         AvailabilitySlotBlock, AppointmentCard,
                                         GroupSessionCard, DailyOverviewGrid,
                                         WeeklyPrintGrid, DailyPrintGrid,
                                         AgendaFabMenu icons
```

#### Schema (`prisma/schema.prisma`)

```prisma
model Clinic {
  // …existing fields
  agendaColors Json @default("{}")  // NOT NULL; first JSON column on this model
}
```

**Use `Json @default("{}")` (NOT NULL), not `Json? @default("{}")`** — keeps the contract that the column is always present and the resolver is always merging real data. The `?` modifier weakens the type on the Prisma side and creates a third null state to handle.

Migration: `npx prisma migrate dev --name add_clinic_agenda_colors`. Default is empty object so all existing rows pick up defaults at read time without an explicit backfill — Postgres 11+ applies a constant default during `ADD COLUMN` as a metadata-only operation (no table rewrite, sub-second `AccessExclusiveLock`).

**Verification:** after generating, inspect `prisma/migrations/<ts>_add_clinic_agenda_colors/migration.sql` to confirm it reads exactly:

```sql
ALTER TABLE "Clinic" ADD COLUMN "agendaColors" JSONB NOT NULL DEFAULT '{}';
```

Mirrors the precedent migrations `20260317_add_clinic_email_bcc` and `20260319_add_attending_professional_and_repasse_payment` for `Clinic`-scoped column additions.

**Down-migration is forbidden on this column.** Once shipped, deprecate by ignoring rather than dropping — a `DROP COLUMN` would have to coordinate with code revert and risk forward-compatibility breakage on running containers. Repo policy is **migrations only — never `prisma db push`** (see `feedback_never_use_db_push.md`).

##### Research Insights

**Migration safety**
- Postgres 11+ optimization: `ADD COLUMN ... DEFAULT '<constant>'` is metadata-only. `'{}'::jsonb` qualifies as constant. No row rewrite, no NULL window. Safe even with traffic.
- `prisma migrate deploy` runs sequentially in `vercel-build` (`prisma generate && vitest run && prisma migrate deploy && next build`) — migration completes before new code goes live. Old containers serving traffic during this window never reference `agendaColors`, so no compatibility risk.
- **No backfill UPDATE.** An explicit `UPDATE Clinic SET "agendaColors" = '{}'::jsonb` would force a full table rewrite. Skip.
- **No shadow DB flag.** `package.json:19` runs vanilla `prisma migrate deploy` — don't add `--shadow-database-url`.

**Type narrowing**
- `Prisma.JsonValue` (read result) does not preserve the inferred shape. Only `resolveAgendaColors` is allowed to touch raw `Prisma.JsonValue` from a clinic row; all other call sites consume the typed `AgendaColors`.
- The resolver covers all 6 malformed-input cases (undefined / SQL NULL / JSON null / scalar / array / partial) — see "Edge cases now handled" above.

**References**
- `prisma/migrations/20260317_add_clinic_email_bcc/migration.sql` — single-column precedent
- `prisma/migrations/20260319_add_attending_professional_and_repasse_payment/migration.sql` — multi-column NOT NULL DEFAULT precedent

#### Helper module — domain location: `src/lib/clinic/colors/`

Moved from the original `src/app/agenda/lib/` location per CLAUDE.md DDD policy ("Business logic lives in domain modules under `src/lib/`, organized by bounded context"). The API route at `src/app/api/admin/settings/route.ts` cannot import from `src/app/agenda/`; the agenda components can import from `src/lib/`. Files:

- `src/lib/clinic/colors/types.ts` — `PaletteName`, `AgendaColorSlot`, `AgendaColors`, `EntryColors`
- `src/lib/clinic/colors/palette.ts` — `PALETTE_NAMES`, `PALETTE_CLASSES` (the literal Tailwind map)
- `src/lib/clinic/colors/schema.ts` — Zod schemas + `DEFAULT_AGENDA_COLORS` + `resolveAgendaColors`
- `src/lib/clinic/colors/resolvers.ts` — `paletteFor(slot, colors)` + cancelled/finalized opacity helpers
- `src/lib/clinic/colors/colors.test.ts` — unit tests
- (optional) `src/lib/clinic/colors/index.ts` only if needed for ergonomics; otherwise consumers import the specific submodule directly (no barrel — prevents tree-shaking pessimization, mirrors `professional-colors.ts` style).

**Type system — derive everything from `as const` arrays.** This guarantees `PALETTE_CLASSES`, the Zod enum, and the form-state types cannot drift:

```ts
// types.ts
export const PALETTE_NAMES = [
  "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "sky", "blue", "indigo", "violet", "purple", "fuchsia",
  "pink", "rose", "slate",
] as const
export type PaletteName = (typeof PALETTE_NAMES)[number]

export const AGENDA_COLOR_SLOTS = [
  "consulta", "reuniao", "lembrete", "groupSession", "availability",
] as const
export type AgendaColorSlot = (typeof AGENDA_COLOR_SLOTS)[number]

export type EntryColors = Readonly<{
  bg: string; border: string; borderLeft: string; text: string; accent: string
}>
export type AgendaColors = Readonly<Record<AgendaColorSlot, PaletteName>>
```

**`PALETTE_CLASSES`** uses `as const satisfies Record<PaletteName, EntryColors>` — the `satisfies` keeps literal-string inference for tooling AND enforces exhaustiveness. Annotating with `: Record<…>` widens to `string` and loses that:

```ts
// palette.ts — every utility is a literal string Tailwind v4 can extract
export const PALETTE_CLASSES = {
  red:    { bg: "bg-red-50",    border: "border-red-200",    borderLeft: "border-l-red-500",    text: "text-red-700",    accent: "bg-red-500"    },
  orange: { bg: "bg-orange-50", border: "border-orange-200", borderLeft: "border-l-orange-500", text: "text-orange-700", accent: "bg-orange-500" },
  amber:  { bg: "bg-amber-50",  border: "border-amber-200",  borderLeft: "border-l-amber-500",  text: "text-amber-700",  accent: "bg-amber-500"  },
  yellow: { bg: "bg-yellow-50", border: "border-yellow-200", borderLeft: "border-l-yellow-500", text: "text-yellow-800", accent: "bg-yellow-500" },  // -800 for AA contrast on -50 bg
  lime:   { bg: "bg-lime-50",   border: "border-lime-200",   borderLeft: "border-l-lime-500",   text: "text-lime-800",   accent: "bg-lime-500"   },  // -800 for AA contrast
  green:  { bg: "bg-green-50",  border: "border-green-200",  borderLeft: "border-l-green-500",  text: "text-green-700",  accent: "bg-green-500"  },
  emerald:{ bg: "bg-emerald-50",border: "border-emerald-200",borderLeft: "border-l-emerald-500",text: "text-emerald-700",accent: "bg-emerald-500"},
  teal:   { bg: "bg-teal-50",   border: "border-teal-200",   borderLeft: "border-l-teal-500",   text: "text-teal-700",   accent: "bg-teal-500"   },
  sky:    { bg: "bg-sky-50",    border: "border-sky-200",    borderLeft: "border-l-sky-500",    text: "text-sky-700",    accent: "bg-sky-500"    },
  blue:   { bg: "bg-blue-50",   border: "border-blue-200",   borderLeft: "border-l-blue-500",   text: "text-blue-700",   accent: "bg-blue-500"   },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", borderLeft: "border-l-indigo-500", text: "text-indigo-700", accent: "bg-indigo-500" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", borderLeft: "border-l-violet-500", text: "text-violet-700", accent: "bg-violet-500" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", borderLeft: "border-l-purple-500", text: "text-purple-700", accent: "bg-purple-500" },
  fuchsia:{ bg: "bg-fuchsia-50",border: "border-fuchsia-200",borderLeft: "border-l-fuchsia-500",text: "text-fuchsia-700",accent: "bg-fuchsia-500"},
  pink:   { bg: "bg-pink-50",   border: "border-pink-200",   borderLeft: "border-l-pink-500",   text: "text-pink-700",   accent: "bg-pink-500"   },
  rose:   { bg: "bg-rose-50",   border: "border-rose-200",   borderLeft: "border-l-rose-500",   text: "text-rose-700",   accent: "bg-rose-500"   },
  slate:  { bg: "bg-slate-50",  border: "border-slate-200",  borderLeft: "border-l-slate-500",  text: "text-slate-700",  accent: "bg-slate-500"  },
} as const satisfies Record<PaletteName, EntryColors>
```

**Defaults + Zod + resolver** — Zod enum derived from the same `as const` array; resolver does per-key narrowing of `Prisma.JsonValue`:

```ts
// schema.ts
import { z } from "zod"
import type { Prisma } from "@/generated/prisma"

const paletteNameSchema = z.enum(PALETTE_NAMES)

// Full schema for resolution; `.partial().strict()` for PATCH
export const agendaColorsSchema = z.object({
  consulta:     paletteNameSchema,
  reuniao:      paletteNameSchema,
  lembrete:     paletteNameSchema,
  groupSession: paletteNameSchema,
  availability: paletteNameSchema,
}).strict()

export const DEFAULT_AGENDA_COLORS: AgendaColors = {
  consulta:     "red",
  reuniao:      "blue",
  lembrete:     "yellow",
  groupSession: "violet",
  availability: "green",
}

/**
 * Per-key narrowing of an opaque Prisma.JsonValue. The persisted column may be:
 * - `undefined`   (Prisma omitted the field from select)
 * - SQL `NULL`    (only if column gets dropped to nullable later)
 * - JSON `null`   (the value `null` inside JSONB)
 * - scalar/array  (someone wrote raw via SQL)
 * - partial obj   (older row missing a slot)
 * - unknown keys  (rolled-back schema)
 *
 * Result is `Object.freeze`d to encourage immutability at call sites.
 */
export function resolveAgendaColors(
  stored: Prisma.JsonValue | null | undefined,
): AgendaColors {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return DEFAULT_AGENDA_COLORS
  }
  const obj = stored as Record<string, unknown>
  const result: Record<AgendaColorSlot, PaletteName> = { ...DEFAULT_AGENDA_COLORS }
  for (const slot of AGENDA_COLOR_SLOTS) {
    const v = obj[slot]
    if (typeof v === "string" && (PALETTE_NAMES as readonly string[]).includes(v)) {
      result[slot] = v as PaletteName
    }
  }
  return Object.freeze(result)
}
```

**Single generic resolver** with discriminated-union safety. `TAREFA` and `NOTA` are not configurable slots — call sites for those types continue to read `ENTRY_TYPE_COLORS` directly (1–2 sites only):

```ts
// resolvers.ts
export function paletteFor(slot: AgendaColorSlot, colors: AgendaColors): EntryColors {
  return PALETTE_CLASSES[colors[slot]]
}

export function appointmentColorsFor(
  type: CalendarEntryType, colors: AgendaColors,
): EntryColors {
  switch (type) {
    case "CONSULTA":  return paletteFor("consulta", colors)
    case "REUNIAO":   return paletteFor("reuniao", colors)
    case "LEMBRETE":  return paletteFor("lembrete", colors)
    case "TAREFA":    return ENTRY_TYPE_COLORS.TAREFA   // legacy
    case "NOTA":      return ENTRY_TYPE_COLORS.NOTA     // legacy
    default: {
      const _exhaustive: never = type
      throw new Error(`Unhandled entry type: ${_exhaustive as string}`)
    }
  }
}
```

##### Research Insights

**Best practices**
- **`as const satisfies Record<…>` over plain annotation.** Mirrors the `RECURRENCE_TYPE_LABELS = {...} as const` pattern at `src/app/agenda/lib/constants.ts:41` and the `FEATURES = [...] as const` pattern at `src/lib/rbac/types.ts:4-21`. Preserves literal-string types in tooling.
- **Discriminated-union exhaustiveness.** Always emit a `default: never` arm so adding a new `CalendarEntryType` later forces a TS error at the resolver site. Without it, the switch silently returns `undefined`.
- **Zod's `.partial().strict()` for PATCH.** Lets admins update one slot at a time without sending the full object; rejects unknown keys. The full schema (without `.partial()`) is used internally by `resolveAgendaColors` only as a contract reference — runtime narrowing is per-key for performance and resilience.

**Implementation details — Prisma JSON narrowing**
- Prisma returns `Prisma.JsonValue` on read. The codebase has no existing pattern for narrowing this (only writes via `Prisma.InputJsonValue` exist in `src/lib/rbac/audit.ts`). Establish the pattern in `colors/schema.ts` as shown above.
- **Read-paths must always go through `resolveAgendaColors`.** Add an explicit comment in the file forbidding `clinic.agendaColors as AgendaColors` direct casts.

**Edge cases now handled by the resolver**
- `undefined` → defaults
- SQL `NULL` → defaults
- JSON `null` → defaults
- Top-level scalar (`"red"`) → defaults
- Top-level array (`["red"]`) → defaults
- Partial object (`{ consulta: "red" }`) → merged with defaults
- Unknown keys (`{ evil: "rgb(255,0,0)" }`) → silently dropped
- Unknown palette name (`{ consulta: "magenta" }`) → falls back to default `red`

**References**
- [Prisma JSON fields docs](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields)
- `src/app/agenda/lib/professional-colors.ts` — existing literal-class-map pattern in this repo

#### React context — file: `src/app/agenda/components/AgendaColorsProvider.tsx`

A typed provider/hook pair. The provider takes a **resolved, frozen** `AgendaColors` and exposes it via `useAgendaColors()`. `useAgendaColors()` throws when called outside a provider (loud-fail rather than silent default fallback). Memoization on `value` is **mandatory** — `AppointmentBlock` is `React.memo`-wrapped and `memo` does not stop re-renders triggered by context updates; without `useMemo` every parent re-render of `agenda/page.tsx` (date change, professional filter change, hover) would cascade through 50–200 appointment blocks.

```tsx
"use client"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AgendaColors } from "@/lib/clinic/colors/types"

const AgendaColorsContext = createContext<AgendaColors | null>(null)

export function AgendaColorsProvider({
  value, children,
}: { value: AgendaColors; children: ReactNode }) {
  // Stable reference unless any of the 5 palette names actually changed.
  const memoValue = useMemo(() => value, [
    value.consulta, value.reuniao, value.lembrete, value.groupSession, value.availability,
  ])
  return <AgendaColorsContext.Provider value={memoValue}>{children}</AgendaColorsContext.Provider>
}

export function useAgendaColors(): AgendaColors {
  const v = useContext(AgendaColorsContext)
  if (!v) throw new Error("useAgendaColors must be called inside <AgendaColorsProvider>")
  return v
}
```

#### Data fetch — Server-Component layout (preferred)

Per the Next.js 16 docs, the documented pattern for sharing fetched data with a client subtree without `useEffect` is: **fetch in a Server Component, pass the unawaited Promise to a Client Provider, resolve with `use()` in consumers** (or `await` server-side and pass the resolved value).

For this feature we don't need streaming — the colors are <500 bytes and arrive instantly from the same request that already authenticates the user. The simplest variant: a Server Component agenda layout (or page wrapper) that `await`s the colors and passes the resolved object to the existing client `AgendaColorsProvider`.

```tsx
// src/app/agenda/layout.tsx (NEW Server Component)
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveAgendaColors } from "@/lib/clinic/colors/schema"
import { AgendaColorsProvider } from "./components/AgendaColorsProvider"

export default async function AgendaLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.clinicId) return children  // unauth fallthrough

  const clinic = await prisma.clinic.findUnique({
    where: { id: session.user.clinicId },
    select: { agendaColors: true },
  })
  const colors = resolveAgendaColors(clinic?.agendaColors)

  return <AgendaColorsProvider value={colors}>{children}</AgendaColorsProvider>
}
```

This eliminates the Flash of Default Colors entirely (colors arrive synchronously with the first paint) and removes any `useEffect`/`useMountEffect` from the agenda page. If the agenda already has a layout, extend it; otherwise create one.

**Fallback (only if a Server-Component layout is impractical):** add `GET /api/clinic/agenda-colors` (see API surface below) and fetch via `useMountEffect` in the client `agenda/page.tsx`, with `DEFAULT_AGENDA_COLORS` as the initial value to avoid a flash.

##### Research Insights

**Performance**
- Without `useMemo` on `value`, the agenda page would re-render `AppointmentBlock` × 50–200 instances on every parent state change (date/filter/hover). Confirmed `AppointmentBlock` is `React.memo`-wrapped at `src/app/agenda/weekly/components/AppointmentBlock.tsx:31` — memo doesn't stop context-driven re-renders.
- `paletteFor` per-block resolver call is ~5ns × 200 = 1µs total per render. **Do not memoize the resolver result** — `useMemo` overhead exceeds the saved work.

**Documented Next.js 16 patterns**
- Server-Component-with-Provider is the only canonical pattern for "fetch once, share with subtree, no `useEffect`." Confirmed via Next.js docs ([fetching-data](https://nextjs.org/docs/app/getting-started/fetching-data) + [streaming](https://nextjs.org/docs/app/guides/streaming)).
- NextAuth FAQ explicitly warns against putting per-tenant config blobs on the JWT (4096-byte cookie limit, stale-until-refresh). Stick with database session lookup at the layout level.

**References**
- [Next.js fetching data](https://nextjs.org/docs/app/getting-started/fetching-data)
- [NextAuth callbacks](https://next-auth.js.org/configuration/callbacks)

#### API surface — split read and write

**Write path (existing route, extended):** `PATCH /api/admin/settings`

- Add `agendaColors: agendaColorsSchema.partial().strict().optional()` to `updateSettingsSchema` (`src/app/api/admin/settings/route.ts:115`).
- The route MUST keep its current per-field destructure-and-assign pattern (lines 130–149) — never `Object.assign(updateData, parsed.data)` — so the security model holds.
- The route hard-scopes `prisma.clinic.update({ where: { id: user.clinicId } })`. Multi-tenant isolation is preserved as-is (verified `src/app/api/admin/settings/route.ts:187, 199`).
- Gated on `withFeatureAuth({ feature: "clinic_settings", minAccess: "WRITE" })` — already in place — which `permissions.ts:174` denies for PROFESSIONAL by default.
- Server response runs `resolveAgendaColors()` over the persisted value before returning, so the client gets a fully-merged object (no client-side merging needed).

**Read path (NEW dedicated endpoint):** `GET /api/clinic/agenda-colors`

`/api/admin/settings` is gated on `clinic_settings` which PROFESSIONAL users don't have by default. Per acceptance criterion AC-6, PROFESSIONAL users render with clinic colors too — so they need a read path that doesn't require admin scope.

```ts
// src/app/api/clinic/agenda-colors/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { resolveAgendaColors } from "@/lib/clinic/colors/schema"

export const GET = withFeatureAuth(
  { feature: "agenda_own", minAccess: "READ" },
  async (_req, { user }) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { agendaColors: true },
    })
    return NextResponse.json({ agendaColors: resolveAgendaColors(clinic?.agendaColors) })
  },
)
```

Used as the fallback path if the agenda is rendered without a Server-Component layout (the preferred path; see "Data fetch" above). It returns only the merged colors object — not the entire clinic settings — so the response is small and cacheable per session.

**Domain function extraction** — keep the route an adapter per CLAUDE.md DDD policy. Move validation + merge into a domain helper:

```ts
// src/lib/clinic/colors/index.ts
import { agendaColorsSchema, resolveAgendaColors } from "./schema"

export function validateAgendaColorsPatch(input: unknown) {
  return agendaColorsSchema.partial().strict().safeParse(input)
}
```

Route: zod-parse via `validateAgendaColorsPatch`, return 400 on failure, otherwise pass to `prisma.clinic.update`. Mirrors how `src/lib/financeiro/invoice-generator` is invoked from routes.

##### Research Insights

**Security**
- Confirmed by audit: the existing PATCH never reads `clinicId` from the body. Reviewer must reject any PR that introduces a `data: parsed.data` or `Object.assign(updateData, parsed.data)` shortcut.
- `.strict()` blocks `__proto__` injection because Zod parses to a clean object before the spread. Add a unit test asserting `{ __proto__: { polluted: true } }` is rejected.
- NextAuth v5 cookies default to `SameSite=lax` → CSRF on PATCH is mitigated at the cookie level. No new work.

**Multi-tenant**
- `withFeatureAuth` reads `user.clinicId` from the session; never accept a `clinicId` query param or body field on either route.
- `UserPermission` overrides (per CLAUDE.md) can grant PROFESSIONAL `clinic_settings:WRITE` — that's an intentional escalation path, not a vulnerability.

**Audit logging — pre-existing gap**
- Today's `/api/admin/settings` PATCH writes zero audit entries (covers `slug`, `billingMode`, `taxPercentage`, etc.). `agendaColors` is low-sensitivity cosmetic config — defer audit work to a separate plan.

**References**
- `src/lib/api/with-auth.ts:287-323` — `withFeatureAuth` implementation
- `src/lib/rbac/permissions.ts:168-184, 205-211` — RBAC matrix + `meetsMinAccess`

#### Settings UI — file: `src/app/admin/settings/components/AgendaColorsTab.tsx`

Mirrors the existing tab pattern (read `settings.agendaColors`, local form state, batch save on Submit, replace local state with API response). Each of the 5 slots renders a labelled row with a 16-swatch grid; the active swatch shows a check. Disabled save when no diff; toast on success/error.

Tab is registered in `src/app/admin/settings/page.tsx` between `agenda` and `financeiro` (e.g. `cores`). No new RBAC feature key needed — the existing `clinic_settings` feature gates this tab.

#### Tailwind v4 safelist (defense-in-depth)

The literal `PALETTE_CLASSES` map is the primary safelist mechanism — Tailwind v4's content scanner picks up every full-string class. As belt-and-suspenders, also add an `@source inline(...)` directive to `src/app/globals.css`:

```css
@import "tailwindcss";

/* Belt-and-suspenders safelist for clinic-configurable palettes.
   Primary safelist is the literal PALETTE_CLASSES map in src/lib/clinic/colors/palette.ts;
   this directive guarantees the utilities ship even if the map is moved or refactored. */
@source inline("{bg,text,border,border-l}-{red,orange,amber,yellow,lime,green,emerald,teal,sky,blue,indigo,violet,purple,fuchsia,pink,rose,slate}-{50,200,500,700,800}");
```

Brace expansion generates 17 palettes × 5 utilities × 5 shades = 425 entries; gzipped CSS impact is ~3kB.

##### Research Insights

**Tailwind v4 specifics**
- `@source inline(...)` is the v4 official mechanism. v4 **removed** the JS `safelist` config; there is no `tailwind.config.{js,ts}` in this repo (verified — config is CSS-first via `globals.css`).
- v4's content scanner reads every non-gitignored file by default — so the literal `PALETTE_CLASSES` map (anywhere in `src/`) is already extracted. The `@source inline` directive is insurance against future refactors that might move the map outside the scanned tree.
- **PostCSS plugin must be `@tailwindcss/postcss`** (verified in `package.json`). The old `tailwindcss` plugin is the #1 cause of "missing classes in prod, fine in dev." No action needed; just don't downgrade.
- **Don't construct class names dynamically anywhere.** A single `` `bg-${name}-50` `` regression silently breaks the feature in prod. CI lint guards against this (AC-18).

**CI verification**
- The compiled CSS smoke test (AC-15) runs in CI: after `next build`, grep `.next/static/css/*.css` for a sample of expected utilities. Failing fast is cheap — a `for` loop over `PALETTE_NAMES` × shades takes <100ms.
- A `/dev/palette-preview` page that renders one swatch per palette is an even cheaper smoke test if visual regression tooling (Chromatic/Percy) ever lands.

**References**
- [Tailwind v4 — detecting classes in source files](https://tailwindcss.com/docs/detecting-classes-in-source-files)
- [Tailwind v4.1 release blog — `@source inline()`](https://tailwindcss.com/blog/tailwindcss-v4-1)
- [v4 safelist discussion #16592](https://github.com/tailwindlabs/tailwindcss/discussions/16592)

#### FAB cleanup — file: `src/app/agenda/components/AgendaFabMenu.tsx`

Remove `TAREFA` (line 38) and `NOTA` (line 50) from `MENU_ITEMS`. Narrow `FabMenuSelection` to drop those literals. Verify `useFabMenu.handleSelect` (and any caller of it) does not break — they switch on the union, removing literals is type-safe. Also rewire the `REUNIAO` and `GROUP_SESSION` menu icons to read from `useAgendaColors()` so the icon palette tracks the configured color.

### Implementation Phases

#### Phase 1 — Foundation (~half day)

1. **Schema migration.** Add `agendaColors Json @default("{}")` to `Clinic`. Run `npx prisma migrate dev --name add_clinic_agenda_colors`. Verify `clinica_dev` (local Docker) picks up the column.
2. **Helper module + tests.** Create `src/app/agenda/lib/clinic-colors.ts`:
   - `PaletteName` union, `PALETTE_NAMES` array, `PALETTE_CLASSES` literal map (Risk #1).
   - `AgendaColors` type, `agendaColorsSchema` (Zod, `.strict()`, palette enum).
   - `DEFAULT_AGENDA_COLORS`, `resolveAgendaColors`, `getAppointmentColors`, `getGroupSessionColors`, `getAvailabilityColors`.
   - Colocated `clinic-colors.test.ts`: defaults applied when input is `{}`, `null`, or `undefined`; unknown keys/values dropped; legacy TAREFA/NOTA fall back to `ENTRY_TYPE_COLORS`; every palette in `PALETTE_NAMES` has a `PALETTE_CLASSES` entry.
3. **API extension.** Update `GET`/`PATCH` in `src/app/api/admin/settings/route.ts`. Tests for the API route may not exist; add a Zod-level test in `src/lib/...` if the surrounding pattern has any.

#### Phase 2 — Color propagation (~1–2 days)

1. **Context provider.** `AgendaColorsProvider` + `useAgendaColors`. Wrap `src/app/agenda/page.tsx` and `src/app/agenda/weekly/page.tsx`. Fetch `agendaColors` once on mount via the same path other clinic settings use; while pending, render with `DEFAULT_AGENDA_COLORS`.
2. **Replace direct color reads** in the 13 touch points:
   - `src/app/agenda/weekly/components/AppointmentBlock.tsx` — replace `entryColors = ENTRY_TYPE_COLORS[type]` with `getAppointmentColors(type, useAgendaColors())`.
   - `src/app/agenda/weekly/components/GroupSessionBlock.tsx` — drop hardcoded `border-purple-*` literals; use `getGroupSessionColors`.
   - `src/app/agenda/weekly/components/AvailabilitySlotBlock.tsx` — drop hardcoded `teal-*`; use `getAvailabilityColors`.
   - `src/app/agenda/components/AppointmentCard.tsx` — replace entry-color read; also rewire the inline group-session deep-link banner (line 153–155) to `getGroupSessionColors`.
   - `src/app/agenda/components/GroupSessionCard.tsx` — replace **all 14 purple references** including header hover, participant chips, divider, and skeleton state. Skeleton uses the configured group-session palette's `accent` shade.
   - `src/app/agenda/components/DailyOverviewGrid.tsx` — empty-slot CTAs (group + availability, line 377–401) read from configured colors.
   - `src/app/agenda/components/DailyPrintGrid.tsx` — replace local `TYPE_CHIP` map (line 79–82) with derived classes from `useAgendaColors()`. Print views are also React, can use the same hook.
   - `src/app/agenda/components/WeeklyPrintGrid.tsx` — replace `ENTRY_TYPE_COLORS` lookup (line 148) with `getAppointmentColors`. Group fallback (purple) → `getGroupSessionColors`.
   - `src/app/agenda/components/AgendaFabMenu.tsx` — REUNIAO and GROUP_SESSION icon backgrounds read from configured palette.
3. **Activation rule audit.** Confirm callers of these components pass `showProfessional` correctly (`agenda/page.tsx:261`, `weekly/page.tsx:215`). No code change expected; document in plan that `showProfessional=false` covers BOTH "ADMIN with single-prof filter" and "PROFESSIONAL role" — the latter inherits clinic colors automatically.

#### Phase 3 — Settings UI (~1 day)

1. **`AgendaColorsTab.tsx`.** Build the tab, mirroring an existing tab in `src/app/admin/settings/components/`. Match its form library / save flow / toast style.
2. **Swatch grid component.** `<PaletteSwatchPicker value={...} onChange={...} options={PALETTE_NAMES} />` — 16 buttons in a 4×4 (or 8×2) grid; each shows a 24px circle filled with the palette's `accent` class; active swatch shows a check icon and a focus ring (`ring-ring`, NOT the palette being picked — Risk #5).
3. **Wire into tab page.** Register `cores` tab in `src/app/admin/settings/page.tsx` `TABS` array between `agenda` and `financeiro`.

#### Phase 4 — Cleanup & polish (~half day)

1. **Drop TAREFA/NOTA from FAB.** Edit `MENU_ITEMS` in `AgendaFabMenu.tsx`; narrow union types.
2. **Print color-adjust.** Verify `print-color-adjust: exact` is set on `.agenda-print-area` (or add it). Without it, Chrome strips backgrounds in print preview.
3. **Cancelled/finalized opacity sanity.** Smoke-test `opacity-50` on the lightest palettes (yellow, lime, amber) for legibility — already-known existing risk, but new palettes broaden the surface.
4. **Compiled-CSS smoke test.** `npm run build` then `grep "bg-red-50" .next/static/css/*.css` (and a sampling of other palettes) confirms Tailwind v4 emitted every literal class. Add this as a manual verification step in the PR description.

## Alternative Approaches Considered

| Alternative | Why rejected |
|-------------|--------------|
| Free hex picker per slot | Easy to pick low-contrast colors; would force a custom contrast-checker; doubles the persisted state shape (need bg/border/text for each picked color); maintenance burden. Brainstorm rejected. |
| Hard-coded defaults only, no settings UI | User explicitly asked for configurability "para todas as psis" and to be admin-editable. |
| Per-user color preferences | Out of scope; user wants clinic-wide colors ("ESSAS MESMAS CORES PARA TODAS AS PSIS"). |
| Storing full Tailwind class strings in JSON | Defeats the safelist guarantee — admin or rogue API client could store any string. Storing palette **names** (validated against an enum) keeps storage minimal and forces every render through the literal `PALETTE_CLASSES` map. |
| One column per slot (5 columns) | Adding a 6th slot later requires another migration. Single JSON gives schema flexibility for free; loss of column-level type safety mitigated by Zod at the boundary. |
| Add `tailwind.config.ts` and use safelist | Fights against Tailwind v4's CSS-first design. The static literal map is the idiomatic solution. |

## System-Wide Impact

### Interaction graph

```
Admin saves AgendaColorsTab
  → POST /api/admin/settings (PATCH)
    → withFeatureAuth → permission check (ADMIN + clinic_settings WRITE)
    → agendaColorsSchema.parse  (rejects bad payloads)
    → prisma.clinic.update({ where: { id: user.clinicId }, data: { agendaColors } })
    → return updated settings (full row)
  → AgendaColorsTab.setSettings(updated)  (replaces local state)
  → admin navigates to /agenda
    → agenda/page.tsx fetches /api/admin/settings (or shared endpoint)
    → resolveAgendaColors(settings.agendaColors)
    → <AgendaColorsProvider value={…}>
      → all 13 touch points re-render with new classes
```

### Error & failure propagation

- **Bad palette name** → Zod parse fails at API → 400 to admin tab → toast error, form stays dirty so admin can retry. No partial save.
- **DB write fails** → caught by route handler's try/catch, 500 returned, admin tab shows error toast, no client-state mutation.
- **Stored JSON has been corrupted** (e.g. by direct DB edit) → `resolveAgendaColors` falls back to defaults; agenda renders normally; settings tab shows defaults until admin re-saves.
- **Tailwind v4 didn't emit a class** (Risk #1) → silent rendering bug — class is present in DOM but does nothing. **Detection: Phase 4's CSS smoke test.**

### State lifecycle risks

- **Concurrent admin edits.** Two admins on the settings tab → last-write-wins on the JSONB column. Acceptable; document in acceptance.
- **Stale colors in already-open agenda tabs.** Once colors are saved, an open agenda in another tab keeps the old colors until refresh — the agenda fetches once on mount. Acceptable for an admin-only setting; documented.
- **Migration on existing rows.** `Json @default("{}")` means all current rows get an empty object, which `resolveAgendaColors` merges with defaults — no backfill required, no data loss.

### API surface parity

- The existing `/api/admin/settings` is the only writable settings surface. The new field plugs in alongside `reminderHours`, `taxPercentage`, etc., with no change in shape or auth model.
- No new GET endpoint needed if agenda already reads from `/api/admin/settings`. **If it doesn't**, the planning step has TWO options: (a) extend the settings GET to be readable by any authenticated clinic user (RBAC change), or (b) add a tiny GET `/api/clinic/agenda-colors` that returns just `{ agendaColors }` and is available to PROFESSIONAL too. Decide during implementation based on what exists.

### Integration test scenarios

1. **Cross-role rendering**: ADMIN with "Todos" → professional palette. ADMIN with single-prof → clinic palette. PROFESSIONAL (no admin) → clinic palette regardless of selection. Verifies the activation rule covers all three role/filter combinations.
2. **Concurrent save**: Admin A saves `consulta: "red"`; Admin B (with a stale form snapshot showing default `red`) saves `consulta: "blue"` — last write wins, no 500, both clients render `blue` after refresh.
3. **Legacy data**: Seed a TAREFA appointment, change clinic config, navigate to weekly view. The TAREFA still renders with `bg-amber-50` (legacy `ENTRY_TYPE_COLORS`); CONSULTA renders with the configured palette.
4. **JSON corruption**: Manually set `Clinic.agendaColors = {"consulta": "fuchsia", "evil": "rgb(255,0,0)"}` in DB. Render agenda. `evil` is dropped, `consulta` is honored — unknown keys silently ignored, defaults fill the rest.
5. **Empty migration**: New clinic created via signup with no agendaColors set; agenda renders with full defaults; admin opens settings and sees all 5 slots pre-selected at the defaults.

## Acceptance Criteria

### Functional Requirements

- [ ] **AC-1** Admin can navigate to `/admin/settings` → "Cores" tab and see 5 rows (Consulta / Reunião / Lembrete / Sessão em grupo / Disponível) each with a 16-swatch palette picker.
- [ ] **AC-2** Selecting a palette and clicking Save persists to `Clinic.agendaColors` and the agenda picks up the change on next navigation/refresh.
- [ ] **AC-3** Existing clinics (rows where `agendaColors = {}`) render with defaults: Consulta=red, Reunião=blue, Lembrete=yellow, Sessão em grupo=violet, Disponível=green.
- [ ] **AC-4** ADMIN with "Todos" selected → professional palette is used (current behavior).
- [ ] **AC-5** ADMIN with a single professional filter → configured clinic colors are used.
- [ ] **AC-6** PROFESSIONAL role users → configured clinic colors are used regardless of selection (`showProfessional` is always false for them today).
- [ ] **AC-7** Existing TAREFA and NOTA appointments still render with their legacy colors (amber/slate) after the FAB removal.
- [ ] **AC-8** The agenda create-FAB no longer offers Tarefa or Nota; only Consulta, Reunião, Lembrete, and Sessão em grupo are creatable.
- [ ] **AC-9** Group session blocks/cards (including the loading skeleton, member chips, divider, and inline deep-link banner in regular appointments) all render with the configured `groupSession` palette.
- [ ] **AC-10** Availability slots and the daily-grid empty-slot CTAs render with the configured `availability` palette.
- [ ] **AC-11** Print views (weekly and daily) reflect the configured colors.

### Non-Functional Requirements

- [ ] **AC-12 (security)** API rejects palette strings outside the allowlist with 400. API rejects unknown slot keys (`.strict()` Zod). API never reads `clinicId` from the body — always from `user.clinicId`. PATCH preserves the per-field destructure-and-assign pattern (no `Object.assign(updateData, parsed.data)`).
- [ ] **AC-13 (a11y)** Focus rings on the swatch picker use a neutral color (e.g. `ring-ring`), not the palette being picked.
- [ ] **AC-14 (a11y)** `text-yellow-700` and `text-lime-700` are upgraded to `-800` in `PALETTE_CLASSES` to maintain WCAG AA on the lightest backgrounds.
- [ ] **AC-15 (build correctness)** `npm run build` followed by `grep "bg-red-50\|bg-violet-500\|bg-fuchsia-200" .next/static/css/*.css` returns matches for every palette × shade. Add to PR description and consider scripting in `vercel-build`.
- [ ] **AC-16 (print)** `print-color-adjust: exact` is set on the agenda print container so chosen backgrounds survive print preview.
- [ ] **AC-17 (perf)** `AgendaColorsProvider` value reference is stable across parent re-renders that don't change the colors. Verifiable with React DevTools profiler — toggling date/professional filter must not show `AppointmentBlock` re-renders attributed to the colors context.
- [ ] **AC-18 (CI lint)** Repo-wide grep for `` bg-${ ``, `` border-${ ``, `` text-${ `` in `src/app/agenda` and `src/app/admin/settings/components` returns zero hits in any PR diff. Wire as a pre-commit or CI check.
- [ ] **AC-19 (data narrowing)** All reads of `Clinic.agendaColors` go through `resolveAgendaColors()`. Direct `as AgendaColors` casts are forbidden by code review (and by an explicit comment in `colors/schema.ts`).
- [ ] **AC-20 (migration SQL)** Generated `prisma/migrations/<ts>_add_clinic_agenda_colors/migration.sql` reads `ALTER TABLE "Clinic" ADD COLUMN "agendaColors" JSONB NOT NULL DEFAULT '{}';` (verified before merge).
- [ ] **AC-21 (PROFESSIONAL read access)** `GET /api/clinic/agenda-colors` returns the merged colors object for a PROFESSIONAL session. Tested.

### Quality Gates

- [ ] Domain-module unit tests in `src/lib/clinic/colors/colors.test.ts` cover: defaults applied for `undefined`/`null`/JSON `null`/scalar/array/empty-object/partial; unknown keys silently dropped; unknown palette names fall back to defaults; legacy `TAREFA`/`NOTA` fall back to `ENTRY_TYPE_COLORS`; every `PaletteName` has a `PALETTE_CLASSES` entry.
- [ ] **Adversarial Zod tests:** `{ __proto__: { polluted: true } }`, `{ constructor: { ... } }`, top-level `[]`, top-level `"red"`, unknown enum value, all return `safeParse({ success: false })`.
- [ ] `npm run build` passes (catches TS errors that tests miss — see `feedback_build_before_commit.md`).
- [ ] All 13 touch points enumerated below are touched (see "Files to modify" — checking off is the audit).
- [ ] No `prisma db push` was used — only `prisma migrate dev` (see `feedback_never_use_db_push.md`).
- [ ] Repo-wide `grep "purple-" src/app/agenda` returns zero unwanted hits after Phase 2 (legacy `ENTRY_TYPE_COLORS.NOTA` slate aside).

## Files to Modify

**New files**
- `prisma/migrations/<timestamp>_add_clinic_agenda_colors/migration.sql`
- `src/lib/clinic/colors/types.ts`
- `src/lib/clinic/colors/palette.ts`
- `src/lib/clinic/colors/schema.ts`
- `src/lib/clinic/colors/resolvers.ts`
- `src/lib/clinic/colors/colors.test.ts`
- `src/app/agenda/components/AgendaColorsProvider.tsx`
- `src/app/agenda/layout.tsx` (Server Component, only if no agenda layout exists today)
- `src/app/api/clinic/agenda-colors/route.ts` (read-only GET for PROFESSIONAL users)
- `src/app/admin/settings/components/AgendaColorsTab.tsx` (swatch picker inlined as a local component, not a separate file)

**Modified — schema/api**
- `prisma/schema.prisma` — add `agendaColors Json @default("{}")` on `Clinic`
- `src/app/api/admin/settings/route.ts` — add `agendaColors` to GET `select` and PATCH zod schema (preserve per-field destructure-and-assign)
- `src/app/globals.css` — add `@source inline(...)` safelist directive

**Modified — settings UI**
- `src/app/admin/settings/page.tsx` — register `cores` tab in `TABS`

**Modified — agenda color reads (13 touch points)**
- `src/app/agenda/page.tsx` — wrap with `AgendaColorsProvider`, fetch colors
- `src/app/agenda/weekly/page.tsx` — wrap with `AgendaColorsProvider`, fetch colors
- `src/app/agenda/weekly/components/AppointmentBlock.tsx`
- `src/app/agenda/weekly/components/GroupSessionBlock.tsx`
- `src/app/agenda/weekly/components/AvailabilitySlotBlock.tsx`
- `src/app/agenda/components/AppointmentCard.tsx` — main + group-link banner
- `src/app/agenda/components/GroupSessionCard.tsx` — including skeleton + chips
- `src/app/agenda/components/DailyOverviewGrid.tsx` — empty-slot CTAs
- `src/app/agenda/components/DailyAppointmentBlock.tsx` — verify, may already inherit from AppointmentCard
- `src/app/agenda/components/DailyPrintGrid.tsx` — `TYPE_CHIP` + status colors
- `src/app/agenda/components/WeeklyPrintGrid.tsx` — group + entry colors
- `src/app/agenda/components/AgendaFabMenu.tsx` — drop TAREFA/NOTA + rewire icons

## Success Metrics

- Single-clinic SaaS today: success = the active clinic admin successfully changes Consulta to red and confirms the agenda no longer reads white.
- Long-term: zero `Clinic.agendaColors` rows containing palette names outside the allowlist (validated via DB scan after release).
- Zero regressions in agenda performance (no extra API calls per appointment block — colors fetched once per page mount).

## Dependencies & Prerequisites

- Local DB synced with prod (`bash scripts/sync-prod-to-local.sh`) before running the migration so the new column is present.
- Existing `clinic_settings` RBAC feature in `src/lib/rbac/types.ts:10` (already in place).
- No new packages required — Zod, react-hook-form (if used), Tailwind v4, and Prisma are all already in `package.json`.

## Risk Analysis & Mitigation

**Risk #1 — Tailwind v4 doesn't emit dynamic classes.**
- Severity: HIGH. Bug is silent at runtime; CSS bundle is missing classes; agenda renders bare HTML elements with no styling.
- Mitigation: literal-string `PALETTE_CLASSES` map (every class statically referenced) + AC-15 build smoke test grepping the compiled CSS.

**Risk #2 — Activation rule misnamed in spec.**
- Severity: MEDIUM. Reviewers may push back: "you said single-professional, but PROFESSIONAL users always get clinic colors."
- Mitigation: AC-6 documents this explicitly. The rule is "whenever the per-professional palette isn't in play."

**Risk #3 — A11y contrast fails for yellow/lime palettes.**
- Severity: MEDIUM. WCAG AA requires 4.5:1 for body text; `text-yellow-700` on `bg-yellow-50` is ~3.8:1.
- Mitigation: AC-14 — yellow and lime palettes use `-800` text instead of `-700` in `PALETTE_CLASSES`.

**Risk #4 — Print views drop backgrounds in some browsers.**
- Severity: LOW–MEDIUM. Chrome respects `print-color-adjust: exact`; Safari less reliable.
- Mitigation: AC-16; document Safari quirks if encountered during testing.

**Risk #5 — Swatch picker focus ring inherits the picked palette.**
- Severity: LOW. Picking yellow → invisible focus ring → keyboard users can't navigate.
- Mitigation: AC-13 — explicit `ring-ring` on the picker buttons.

**Risk #6 — Group session UI has 14+ scattered purple references.**
- Severity: MEDIUM. Easy to miss one (e.g., the loading skeleton).
- Mitigation: enumerated explicitly in "Files to Modify" → `GroupSessionCard.tsx — including skeleton + chips`. Reviewer should grep `purple-` in `agenda/` after merge to confirm zero stragglers.

**Risk #7 — Concurrent admin saves overwrite each other.**
- Severity: LOW. Acceptable for a configuration setting.
- Mitigation: documented as acceptable behavior; no optimistic concurrency token needed.

**Risk #8 — Provider value reference instability cascades through 200 memoized blocks.**
- Severity: MEDIUM. `AppointmentBlock` is `React.memo`-wrapped but `memo` does not stop context re-renders. Every parent state change (date/filter/hover) would invalidate every block.
- Mitigation: AC-17 — `useMemo` on the provider's `value` keyed on the 5 palette name strings. Verified via React DevTools profiler.

**Risk #9 — Server route imports from `src/app/agenda/` (App Router boundary violation).**
- Severity: MEDIUM. v1 of this plan placed the helper at `src/app/agenda/lib/clinic-colors.ts`; the API route would have had to import from there, breaking the DDD layering policy.
- Mitigation: relocated to `src/lib/clinic/colors/`. API route + agenda components both import from `src/lib/`.

**Risk #10 — PROFESSIONAL users can't fetch from `/api/admin/settings`.**
- Severity: HIGH for AC-6 (PROFESSIONAL render uses clinic colors). v1 had a single read endpoint gated on `clinic_settings:READ`, which PROFESSIONAL doesn't have by default.
- Mitigation: dedicated `GET /api/clinic/agenda-colors` gated on `agenda_own:READ`. Already designed.

**Risk #11 — Prisma `Json` value not narrowed at boundary.**
- Severity: MEDIUM. Direct `clinic.agendaColors as AgendaColors` casts would be type-unsafe and could render "no class" silently if DB content drifts.
- Mitigation: `resolveAgendaColors` does per-key narrowing; AC-19 forbids direct casts; explicit comment in `colors/schema.ts` documents the rule.

**Risk #12 — Class-name interpolation regression in future PRs.**
- Severity: HIGH if it lands in prod (silent visual bug). LOW probability.
- Mitigation: AC-18 — repo-wide CI grep for `` bg-${ ``, `` border-${ ``, `` text-${ `` in `src/app/agenda` and `src/app/admin/settings/components`.

**Risk #13 — Tailwind v4 `@source inline()` typo / brace-expansion bug.**
- Severity: MEDIUM. Brace-expansion typos fail silently (`{50, 100}` with spaces does not work, `{50,100}` does). The literal `PALETTE_CLASSES` map is the primary defense; `@source inline` is belt-and-suspenders.
- Mitigation: AC-15 compiled-CSS smoke test catches missing classes regardless of which mechanism failed.

## Resource Requirements

- Single developer, ~2.5–3 days end-to-end:
  - Phase 1 (schema/helper/api): 0.5 day
  - Phase 2 (color propagation across 13 files): 1–1.5 days (most of the time is the audit, not the diff)
  - Phase 3 (settings UI): 1 day
  - Phase 4 (cleanup/print/build smoke test): 0.5 day

## Future Considerations

- **Live preview** in the settings tab — defer until at least one user requests it. A simple inline "card" preview using the in-flight form state is ~2 hours of work but not load-bearing.
- **Per-professional color overrides** — out of scope per brainstorm; explicit user statement was "ESSAS MESMAS CORES PARA TODAS AS PSIS."
- **Color-blind-safe presets** — defer until needed. Could later expose preset bundles ("Daltonic-friendly: blue/orange/yellow/purple/green") instead of free choice.
- **Theming the patient/professional/financeiro pages** — explicitly NOT in scope. The JSON column covers agenda only; if other modules want theming, that's a separate plan.

## Documentation Plan

- Update `CLAUDE.md` "Architecture" section under **Key Domain Models** to mention `Clinic.agendaColors` (one line).
- Add a comment block in `clinic-colors.ts` explaining why `PALETTE_CLASSES` must be literal (Risk #1).
- No new public API doc; the route is admin-internal.

## Sources & References

### Origin

- **Brainstorm document:** [`docs/brainstorms/2026-05-04-customizable-agenda-colors-brainstorm.md`](../../docs/brainstorms/2026-05-04-customizable-agenda-colors-brainstorm.md). Key decisions carried forward:
  - Single JSONB `agendaColors` column on `Clinic` (rejected: 5 separate columns).
  - Tailwind palette dropdown with ~16 named palettes (rejected: free hex picker).
  - 5 slots: `consulta`, `reuniao`, `lembrete`, `groupSession`, `availability`.
  - Activation rule: type-based when not using per-professional palette; per-professional palette when "Todos" is selected.
  - Tarefa/Nota dropped from FAB; legacy records still render via existing constants.

### Internal references

- `src/app/agenda/lib/constants.ts:77-119` — current `ENTRY_TYPE_COLORS` (kept as legacy fallback).
- `src/app/agenda/lib/professional-colors.ts` — pattern to mirror for the literal-string class map.
- `src/app/agenda/weekly/components/AppointmentBlock.tsx:80` — current entry-type read site.
- `src/app/agenda/components/AppointmentCard.tsx:49,58-63,153-155` — current entry-type read + group-link banner.
- `src/app/agenda/components/GroupSessionCard.tsx:62-80` — 14+ purple references.
- `src/app/agenda/components/DailyPrintGrid.tsx:79-82` — separate `TYPE_CHIP` map.
- `src/app/agenda/components/AgendaFabMenu.tsx:24-61` — `MENU_ITEMS` definition + TAREFA/NOTA entries.
- `src/app/admin/settings/page.tsx:18-24` — `TABS` array (where `cores` slots in).
- `src/app/api/admin/settings/route.ts:46-206` — extension target (GET select + PATCH zod schema).
- `src/lib/rbac/types.ts:4-19` — `clinic_settings` feature (already exists).
- `prisma/schema.prisma:192-261` — `Clinic` model (no existing JSON columns).

### Repo conventions

- `feedback_never_use_db_push.md` — migrations only.
- `feedback_build_before_commit.md` — `npm run build` before committing.
- `CLAUDE.md` — useEffect rules (use `useMountEffect` if needed in the provider's data fetch).
