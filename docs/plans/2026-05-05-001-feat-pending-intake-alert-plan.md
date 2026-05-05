---
title: "feat: Pending intake submissions global alert"
type: feat
status: completed
date: 2026-05-05
origin: docs/brainstorms/2026-05-05-pending-intake-alert-brainstorm.md
---

# feat: Pending intake submissions global alert

## Overview

Surface pending intake form submissions to staff who can act on them through
two coordinated UI surfaces driven by a single client-side count source:

- **Banner** in the app shell (mirrors `SubscriptionBanner` styling) shown
  while there is at least one `IntakeSubmission` with status `PENDING`.
- **Badge** on the **Pacientes** nav item across all three nav variants
  (sidebar, desktop header, bottom nav).

Audience is gated to users with `patients` WRITE permission. The count is
fetched from a new small endpoint and refreshed every 60s plus on tab focus
through a `usePendingIntakeCount` hook exposed via context. When the count
hits 0, both surfaces disappear automatically.

## Problem Statement / Motivation

Staff currently have no way to know that a new intake form has been
submitted unless they happen to open the Pacientes → "Fichas de cadastro"
tab. The email notification helps, but emails get missed (and we just
fixed a bug where the production email wasn't sending at all). A
persistent in-app alert ensures pending forms aren't lost.

This plan implements **Approach A** from the brainstorm
(see brainstorm: docs/brainstorms/2026-05-05-pending-intake-alert-brainstorm.md):
a single client poller exposed via context. Approach B (server-render in
layout) was rejected because a fresh submission via the public route
wouldn't appear on already-open tabs. Approach C (SSE) was rejected as
overkill for a low-frequency event.

## Proposed Solution

```
┌──────────────────────────────────────────────────────────────────────┐
│ app/layout.tsx                                                       │
│                                                                      │
│  <AppShell>                                                          │
│    <PendingIntakeProvider>          ← new client provider            │
│      <SubscriptionBanner />                                          │
│      <PendingIntakeBanner />        ← new banner                     │
│      <PageTransition>                                                │
│        {children}                                                    │
│      </PageTransition>                                               │
│    </PendingIntakeProvider>                                          │
│  </AppShell>                                                         │
│                                                                      │
│  <SidebarNav />  ← Pacientes nav item reads count via context        │
│  <DesktopHeader />                                                   │
│  <BottomNavigation />                                                │
└──────────────────────────────────────────────────────────────────────┘

PendingIntakeProvider
  └─ usePendingIntakeCount (hook)
        ├─ useSession + usePermission("patients") → gate WRITE
        ├─ initial fetch                        → /api/intake-submissions/pending-count
        ├─ setInterval(60s) refetch
        └─ visibilitychange → refetch on tab focus (debounced 5s)
```

### Why a context, not a prop

Three nav components plus the banner all need the count. Threading it
through props from `app/layout.tsx` would require restructuring multiple
client components. A context provider keeps the fetch single-source and
lets each consumer subscribe locally.

### Endpoint shape

`GET /api/intake-submissions/pending-count` returns:

```json
{ "count": 3 }
```

Auth: `withFeatureAuth({ feature: "patients", minAccess: "WRITE" })`.
Implementation: `prisma.intakeSubmission.count({ where: { clinicId: user.clinicId, status: "PENDING" } })`.

`Cache-Control: private, max-age=30` so a tab refresh inside the 60s
poll window doesn't always re-hit Prisma — at most one DB count per
30 seconds per user.

## Technical Considerations

- **Architecture:** No new infrastructure; one new endpoint, one context,
  one hook, one banner, three nav-component edits. Follows existing
  `SubscriptionBanner` pattern almost verbatim.
- **Performance:** 1 request/60s/user. At a clinic with 5 staff that's 5
  requests/minute. The endpoint executes a single Prisma count on an
  indexed column (status). Negligible.
- **Security:**
  - Endpoint scoped to `user.clinicId` — no cross-tenant leakage.
  - `minAccess: "WRITE"` so a read-only user can't even see the count
    (defense-in-depth; the UI also gates by `patients` WRITE so it's
    enforced both client-side and server-side).
  - Endpoint returns only an integer — no PII.
- **CLAUDE.md `useEffect` rule:** Rule 2 prohibits raw `useEffect+fetch+
  setState`. We use `useMountEffect` for the single mount-time setup of
  interval + visibility listener (matches `useDashboard.ts:59-97`).
- **Multi-tenant:** `withFeatureAuth` already injects `user.clinicId`.
  The count query filters by it. No risk of leaking another clinic's
  count.
- **Superadmin:** The superadmin auth path doesn't populate
  `session.user.permissions`, so `usePermission("patients").canWrite`
  returns `false`. Banner/badge stay hidden in superadmin views — desired
  (this is a clinic-scoped feature).
- **Public routes:** `AppShell` short-circuits to bare children on
  `/login`, `/signup`, `/intake/[slug]`, etc. (`app-shell.tsx:7`).
  Putting the provider INSIDE AppShell guarantees it's not mounted on
  public routes, so we never poll for unauthenticated users.

## System-Wide Impact

- **Interaction graph:** `usePendingIntakeCount` mount → `fetch
  /api/intake-submissions/pending-count` → Prisma count → context state
  update → React re-renders banner + each nav variant that reads the
  context. No middleware, observers, or callbacks fire. The interval
  fires every 60s and on `visibilitychange` (`document.hidden === false`).
- **Error propagation:** A 4xx/5xx response is swallowed and logged via
  `console.warn`. The hook keeps the last good count rather than dropping
  to 0 — an unrelated transient error shouldn't make the banner vanish
  while submissions actually exist. A 401 (session expired) stops the
  interval and zeroes the count so the banner doesn't flash on the login
  screen.
- **State lifecycle risks:** No DB writes; the feature is read-only.
  No risk of orphaned rows or partial-failure inconsistency.
- **API surface parity:** The new endpoint is the only place exposing a
  pending count. The existing `GET /api/intake-submissions` returns the
  full list (with pagination) — distinct concern, no overlap.
- **Integration test scenarios:**
  1. **Cross-clinic isolation:** clinic A's staff member must not see
     clinic B's pending count. Covered by feature auth scoping in the
     endpoint test.
  2. **Permission downgrade:** if an admin demotes a user from `patients`
     WRITE → READ, the banner stops showing on next render. Covered by
     `usePendingIntakeCount` returning 0 when `canWrite === false`.
  3. **New submission visibility:** a fresh public-form submission
     appears on an already-open authenticated tab within ≤ 60s
     (or instantly on tab focus). Manual smoke test post-deploy.

## Implementation Plan

Order matters because each step depends on the previous. Each step ends
with a working build.

### Step 1: Endpoint

**File:** `src/app/api/intake-submissions/pending-count/route.ts` (new)

```ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"

export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "WRITE" },
  async (_req, { user }) => {
    const count = await prisma.intakeSubmission.count({
      where: { clinicId: user.clinicId, status: "PENDING" },
    })
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "private, max-age=30" } },
    )
  },
)
```

**Test:** `src/app/api/intake-submissions/pending-count/route.test.ts`
mirrors the existing handler-test pattern from `with-auth.test.ts`:

- Returns `count` for the user's clinic
- Returns 0 when no PENDING rows
- Excludes APPROVED and REJECTED
- Excludes other clinics' rows (the count happens through Prisma; the
  test asserts the where-clause includes `clinicId: user.clinicId`)
- Returns 403 for users without `patients` WRITE (covered by
  `withFeatureAuth` already; adding one explicit case)

### Step 2: Hook + Provider

**File:** `src/shared/hooks/usePendingIntakeCount.ts` (new) — pure hook

Implementation sketch:

```ts
const REFRESH_INTERVAL = 60_000
const MIN_REFETCH_GAP_MS = 5_000

interface State { count: number; isLoading: boolean }

export function usePendingIntakeCount(): State {
  const { canWrite } = usePermission("patients")
  const [state, setState] = useState<State>({ count: 0, isLoading: true })
  const lastFetchRef = useRef(0)

  useMountEffect(() => {
    if (!canWrite) {
      setState({ count: 0, isLoading: false })
      return
    }

    let cancelled = false

    async function fetchCount() {
      const now = Date.now()
      if (now - lastFetchRef.current < MIN_REFETCH_GAP_MS) return
      lastFetchRef.current = now
      try {
        const res = await fetch("/api/intake-submissions/pending-count")
        if (res.status === 401) {
          // Session expired — stop and zero out so the banner doesn't
          // linger on the login screen.
          if (!cancelled) setState({ count: 0, isLoading: false })
          clearInterval(interval)
          return
        }
        if (!res.ok) return // keep last good count, log
        const data = await res.json()
        if (!cancelled) setState({ count: data.count, isLoading: false })
      } catch (err) {
        // Keep last good count.
        console.warn("[pending-intake-count] fetch failed", err)
      }
    }

    fetchCount()
    const interval = setInterval(fetchCount, REFRESH_INTERVAL)
    function onVisibility() {
      if (document.visibilityState === "visible") fetchCount()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  })

  return state
}
```

**File:** `src/shared/components/PendingIntakeProvider.tsx` (new)

```tsx
"use client"
const Ctx = createContext<{ count: number; isLoading: boolean }>({
  count: 0,
  isLoading: true,
})

export function PendingIntakeProvider({ children }: { children: React.ReactNode }) {
  const value = usePendingIntakeCount()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePendingIntake() {
  return useContext(Ctx)
}
```

**Test:** `src/shared/hooks/usePendingIntakeCount.test.ts`

Use vitest with `vi.useFakeTimers()` to advance the interval. Mock
`fetch` and the `useSession` / `usePermission` modules. Verify:

- Returns `{ count: 0, isLoading: false }` immediately when `canWrite` is false
  and never calls fetch
- Initial fetch populates count
- Advancing 60s triggers another fetch
- Failed fetch keeps prior count (no zero)
- 401 zeroes count and stops the interval
- visibility → "visible" triggers fetch (debounced by `MIN_REFETCH_GAP_MS`)

### Step 3: Banner

**File:** `src/shared/components/PendingIntakeBanner.tsx` (new)

```tsx
"use client"
export function PendingIntakeBanner() {
  const { count, isLoading } = usePendingIntake()
  if (isLoading || count === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b px-4 py-2 text-sm flex items-center gap-2 bg-yellow-50"
    >
      <BellIcon className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        {count === 1
          ? "Há 1 ficha de cadastro pendente"
          : `Há ${count} fichas de cadastro pendentes`}
      </span>
      <Link
        href="/patients?tab=intake"
        className="font-medium underline hover:no-underline"
      >
        Revisar
      </Link>
    </div>
  )
}
```

**Note:** copy uses singular/plural correctly. `bg-yellow-50` mirrors
`SubscriptionBanner`'s "warning" tone (line 25-29 of that file).

### Step 4: Wire provider + banner into the layout

**File:** `src/app/layout.tsx` (edit)

Wrap children inside AppShell with `<PendingIntakeProvider>`, render the
banner right after `<SubscriptionBanner />`:

```tsx
<AppShell>
  <PendingIntakeProvider>
    <SubscriptionBanner />
    <PendingIntakeBanner />
    <PageTransition>{children}</PageTransition>
  </PendingIntakeProvider>
</AppShell>
```

Putting it inside AppShell guarantees the provider doesn't mount on
public routes (AppShell early-returns to bare children there per
`app-shell.tsx:13-29`). Public-form submitters won't be polling.

### Step 5: Sidebar nav badge

**File:** `src/shared/components/ui/sidebar-nav.tsx` (edit)

The `NavBadge` component and tone palette already exist (lines 167-182).
The Pacientes item is in `navGroups` at line 80-84. Two changes:

1. Inside the rendering loop, after computing `item`, if
   `item.href === "/patients"`, inject a dynamic badge from the context
   instead of a static one. Cleanest approach: don't mutate the static
   list — add a small helper `useNavBadgeFor(item)` that returns the
   badge for items that have dynamic counts:

   ```tsx
   function useNavBadgeFor(item: NavItem): NavItem["badge"] {
     const { count } = usePendingIntake()
     if (item.href === "/patients" && count > 0) {
       return { label: String(count), tone: "warn" }
     }
     return item.badge
   }
   ```

2. Replace `item.badge` with `useNavBadgeFor(item)` at the badge render
   site (line 395). The hook is called from inside the map's render —
   acceptable here because the hook does no work; it just reads context.
   To stay safe with rules-of-hooks across loops, hoist the count once
   at component top (`const { count } = usePendingIntake()`) and inline
   the conditional.

Final form (cleaner, no per-iteration hook call):

```tsx
const { count: pendingIntakeCount } = usePendingIntake()
// ...inside item map:
const badge =
  item.href === "/patients" && pendingIntakeCount > 0
    ? { label: String(pendingIntakeCount), tone: "warn" as const }
    : item.badge
{!collapsed && badge && <NavBadge {...badge} />}
```

### Step 6: Desktop header badge

**File:** `src/shared/components/ui/desktop-header.tsx` (edit)

This component has no badge support yet. Mirror the sidebar's NavBadge
shape and tone palette:

1. Add `badge?: { label: string; tone: "brand" | "warn" | "ok" | "neutral" }`
   to the local `NavItem` interface (line 24-30).
2. Lift the same `toneClass` constant + `NavBadge` component (or extract
   to a shared `nav-badge.tsx` — see Open Questions).
3. Inside the rendering loop, hoist `pendingIntakeCount` from context and
   inject a dynamic badge for the Pacientes item, identical to the
   sidebar.
4. Render `{badge && <NavBadge {...badge} />}` next to the label.

### Step 7: Bottom nav badge (mobile)

**File:** `src/shared/components/ui/bottom-navigation.tsx` (edit)

Bottom nav uses small icon+label tiles. A pill badge is too big — use a
**dot indicator** when count > 0. Visual style follows iOS / Material
unread-dot conventions (small filled circle, top-right of the icon):

```tsx
<span className="relative inline-block">
  {item.icon}
  {showDot && (
    <span
      className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-warn-500"
      aria-label={`${pendingIntakeCount} fichas pendentes`}
    />
  )}
</span>
```

Keep it minimal — no count number on mobile, just a presence indicator.
Tap goes to `/patients` as today.

### Step 8: Verify

- `npm run build` — no type errors
- `npm run test` — all existing + new tests pass
- Manual smoke (dev server in main worktree):
  1. Submit an intake form via `/intake/<slug>` → banner appears within
     60s on an authenticated tab
  2. Approve / reject the submission → banner disappears within 60s
  3. Log in as a user with `patients` READ only → banner never appears
  4. Navigate `/patients` → click the link in the banner → lands on the
     intake tab

## Acceptance Criteria

### Functional Requirements

- [x] `GET /api/intake-submissions/pending-count` returns `{ count }`
      scoped to the caller's clinic, requires `patients` WRITE
- [x] Hook `usePendingIntakeCount` polls every 60s and refetches on tab
      focus (debounced 5s); returns 0 immediately for users without
      WRITE without making any fetch
- [x] `PendingIntakeProvider` exposes the count via context to all
      authenticated-route consumers; not mounted on public routes
- [x] Banner shows in the app shell when `count > 0`, hidden otherwise,
      with link to `/patients?tab=intake`
- [x] Pacientes nav item shows a `warn`-tone badge with the count in the
      sidebar and desktop header when `count > 0`
- [x] Pacientes bottom-nav item shows a small dot when `count > 0`
- [x] Banner copy is correctly singularized/pluralized
- [x] All UI surfaces vanish when count returns to 0 with no manual
      dismiss needed

### Non-Functional Requirements

- [x] Endpoint executes one indexed Prisma count, p95 < 50ms locally
- [x] No regression in shell render performance — both Prisma DB calls
      and React re-renders unchanged when `count === 0`
- [x] `aria-live="polite"` on the banner; `aria-label` on the bottom-nav
      dot
- [x] No new files exceed 200 lines (CLAUDE.md size rule)
- [x] No raw `useEffect+fetch+setState` (use `useMountEffect`)

### Quality Gates

- [x] `npm run build` passes
- [x] `npm run test` passes (all 1533 existing + new tests)
- [x] New unit tests cover: endpoint (4 cases), hook (6 cases)
- [ ] Manual smoke confirms banner + badges appear within 60s of a fresh
      submission and disappear within 60s of a status change

## Success Metrics

- Time-to-acknowledge for new intake submissions drops from
  email-dependent (currently broken in some flows) to ≤ 60s in-app.
- Zero "I missed the submission" reports from clinic admins after rollout.

## Dependencies & Risks

- **Dependency:** None — uses existing `withFeatureAuth`, `usePermission`,
  `useMountEffect`, `IntakeSubmissionStatus.PENDING` enum, and current
  shell layout.
- **Risk: poll spam at large clinics.** Mitigated by 60s interval,
  short-lived `Cache-Control: private, max-age=30`, and one DB count
  per request (no joins).
- **Risk: superadmin polls accidentally.** Mitigated by
  `usePermission("patients").canWrite === false` for superadmin sessions
  → hook short-circuits, no fetch.
- **Risk: badge flicker on initial render.** Mitigated by gating UI on
  `!isLoading && count > 0`; nothing renders before the first fetch
  resolves. The very first banner appearance could happen ~100-300ms
  after page load — acceptable, no flash of a different state.

## Open Questions

- **Extract `NavBadge` to a shared component?** Sidebar already has it
  inline. Desktop header will need the same. Two options:
  (a) duplicate it in desktop-header (matches current "each nav owns its
  list" pattern), or
  (b) extract `src/shared/components/ui/nav-badge.tsx` and import from
  both. Recommend **(b)** since it's one small file and keeps the tone
  palette in one place. Decide during implementation.
- **Mobile badge dot color.** Plan uses `bg-warn-500`. If the codebase
  already has a notification-dot color token (search before
  implementing), use that.
- **Future:** When other entities need similar counts (unread audits,
  pending invoices, etc.), generalize the provider into a
  `useDashboardCounts` returning a map. Out of scope here — YAGNI.

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-05-05-pending-intake-alert-brainstorm.md](../brainstorms/2026-05-05-pending-intake-alert-brainstorm.md)

  Key decisions carried forward:
  1. Approach A (single client poller + context) over server-render or SSE
  2. Both surfaces (badge + banner), not just one
  3. `patients` WRITE gates audience and endpoint access
  4. Live count drives both surfaces; auto-clears when count hits 0

### Internal Patterns to Follow

- **Banner:** `src/shared/components/SubscriptionBanner.tsx:9-47`
  (markup, palette, mounting in `app/layout.tsx:74-78`)
- **Nav badge:** `src/shared/components/ui/sidebar-nav.tsx:35-42` (NavItem
  interface), `:167-182` (NavBadge + tones), `:373-399` (rendering)
- **Permission hook:** `src/shared/hooks/usePermission.ts:6-14`
- **Polling hook:** `src/app/hooks/useDashboard.ts:59-97`
- **Mount-only effect helper:** `src/shared/hooks/useMountEffect.ts`
- **API auth wrapper:** `src/lib/api/with-auth.ts` +
  `src/app/api/intake-submissions/route.ts:9-11` (existing usage on
  same resource)
- **Public-route gating in shell:** `src/shared/components/ui/app-shell.tsx:13-29`

### CLAUDE.md Rules in Force

- **Rule on `useEffect`:** use `useMountEffect` for one-time external
  setup; do NOT write `useEffect+fetch+setState`
- **File size:** every new file < 200 lines
- **No comments unless WHY is non-obvious**
- **Brazilian Portuguese:** banner copy in pt-BR
- **Tests required:** every new feature must include unit tests

### Related Work

- **Today's intake notification fix:** `a367443` — guarantees the email
  send actually happens; this banner is a complementary in-app surface
  for cases where staff don't read email promptly
