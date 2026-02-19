# Permission System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the rigid ADMIN/PROFESSIONAL role system with feature-based permissions (NONE/READ/WRITE) that support per-user overrides while keeping roles as defaults.

**Architecture:** Features (agenda_own, patients, users, etc.) each have an access level. Role defaults are defined in code. Per-user overrides are stored in a UserPermission DB table. Resolved permissions are loaded into the NextAuth JWT/session for zero-cost access checks on every request.

**Tech Stack:** Prisma (schema + enum), NextAuth.js (session/JWT callbacks), React (usePermission hook), existing withAuth wrapper refactored.

---

### Task 1: Prisma Schema — FeatureAccess enum and UserPermission model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add FeatureAccess enum and UserPermission model**

Add after the existing enums:

```prisma
enum FeatureAccess {
  NONE
  READ
  WRITE
}
```

Add the UserPermission model:

```prisma
model UserPermission {
  id        String        @id @default(cuid())
  userId    String
  clinicId  String
  feature   String        // e.g. "agenda_own", "patients", "users"
  access    FeatureAccess

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@unique([userId, feature])
  @@index([clinicId])
  @@index([userId])
}
```

Add the reverse relation to the User model:

```prisma
// In model User, add:
permissions UserPermission[]
```

Add the reverse relation to the Clinic model:

```prisma
// In model Clinic, add:
userPermissions UserPermission[]
```

**Step 2: Push schema changes**

Run: `npx prisma db push`
Expected: Schema synced, Prisma Client regenerated.

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add FeatureAccess enum and UserPermission model"
```

---

### Task 2: RBAC Layer — Feature definitions and resolution logic

**Files:**
- Modify: `src/lib/rbac/types.ts`
- Modify: `src/lib/rbac/permissions.ts`
- Modify: `src/lib/rbac/authorize.ts`
- Modify: `src/lib/rbac/index.ts`

**Step 1: Update types.ts**

Replace entire file content. Keep `AuthUser` but add `permissions` field and the new types:

```typescript
import { Role, FeatureAccess } from "@prisma/client"

// All controllable features in the system
export const FEATURES = [
  "agenda_own",
  "agenda_others",
  "patients",
  "groups",
  "users",
  "clinic_settings",
  "professionals",
  "notifications",
  "audit_logs",
  "availability_own",
  "availability_others",
] as const

export type Feature = (typeof FEATURES)[number]

// Human-readable labels for the admin UI
export const FEATURE_LABELS: Record<Feature, string> = {
  agenda_own: "Agenda (propria)",
  agenda_others: "Agenda (outros)",
  patients: "Pacientes",
  groups: "Grupos",
  users: "Usuarios",
  clinic_settings: "Config. Clinica",
  professionals: "Profissionais",
  notifications: "Notificacoes",
  audit_logs: "Logs de Auditoria",
  availability_own: "Disponibilidade (propria)",
  availability_others: "Disponibilidade (outros)",
}

export type ResolvedPermissions = Record<Feature, FeatureAccess>

export interface AuthUser {
  id: string
  clinicId: string
  role: Role
  professionalProfileId: string | null
  permissions: ResolvedPermissions
}

// Keep legacy types for backward compat during migration
export type Resource =
  | "appointment"
  | "patient"
  | "user"
  | "clinic"
  | "professional-profile"
  | "availability-rule"
  | "availability-exception"
  | "audit-log"
  | "notification"
  | "notification-template"
  | "therapy-group"

export type Action = "create" | "read" | "update" | "delete" | "list"

export interface Permission {
  resource: Resource
  action: Action
  scope: "own" | "clinic" | "all"
}

export interface AuthorizationContext {
  user: AuthUser
  resource: Resource
  action: Action
  resourceOwnerId?: string
  resourceClinicId?: string
}

export interface AuthorizationResult {
  allowed: boolean
  reason?: string
}
```

**Step 2: Update permissions.ts**

Keep the existing `rolePermissions` and `hasPermission` (needed during migration). Add role defaults and resolution:

```typescript
import { Role, FeatureAccess } from "@prisma/client"
import type { Resource, Action, Permission, Feature, ResolvedPermissions } from "./types"
import { FEATURES } from "./types"

type RolePermissions = Record<Role, Permission[]>

// Keep existing rolePermissions for backward compat during migration
export const rolePermissions: RolePermissions = {
  // ... keep existing content unchanged ...
}

export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action
): Permission | null {
  const permissions = rolePermissions[role]
  return permissions.find(p => p.resource === resource && p.action === action) ?? null
}

// ---- NEW: Feature-based permission system ----

export const ROLE_DEFAULTS: Record<Role, Record<Feature, FeatureAccess>> = {
  ADMIN: {
    agenda_own: "WRITE",
    agenda_others: "WRITE",
    patients: "WRITE",
    groups: "WRITE",
    users: "WRITE",
    clinic_settings: "WRITE",
    professionals: "WRITE",
    notifications: "WRITE",
    audit_logs: "READ",
    availability_own: "WRITE",
    availability_others: "WRITE",
  },
  PROFESSIONAL: {
    agenda_own: "WRITE",
    agenda_others: "NONE",
    patients: "READ",
    groups: "WRITE",
    users: "NONE",
    clinic_settings: "NONE",
    professionals: "NONE",
    notifications: "NONE",
    audit_logs: "NONE",
    availability_own: "WRITE",
    availability_others: "NONE",
  },
}

/**
 * Resolve permissions for a user by merging role defaults with per-user overrides.
 * @param role - The user's role
 * @param overrides - Map of feature -> access from UserPermission table
 */
export function resolvePermissions(
  role: Role,
  overrides: Partial<Record<Feature, FeatureAccess>>
): ResolvedPermissions {
  const defaults = ROLE_DEFAULTS[role]
  const resolved = {} as ResolvedPermissions
  for (const feature of FEATURES) {
    resolved[feature] = overrides[feature] ?? defaults[feature] ?? "NONE"
  }
  return resolved
}

/**
 * Check if an access level meets a minimum requirement.
 * WRITE > READ > NONE
 */
export function meetsMinAccess(
  actual: FeatureAccess,
  required: FeatureAccess
): boolean {
  const levels: Record<FeatureAccess, number> = { NONE: 0, READ: 1, WRITE: 2 }
  return levels[actual] >= levels[required]
}
```

**Step 3: Keep authorize.ts as-is for now**

It will still be used by routes that haven't migrated yet. No changes needed.

**Step 4: Update index.ts exports**

```typescript
export * from "./types"
export * from "./permissions"
export * from "./authorize"
export * from "./audit"
```

No change needed here — new exports come through types.ts and permissions.ts.

**Step 5: Commit**

```bash
git add src/lib/rbac/
git commit -m "feat: add feature-based permission definitions and resolution logic"
```

---

### Task 3: NextAuth Session — Load permissions into JWT/session

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth.config.ts`

**Step 1: Update next-auth type declarations**

Add `permissions` to User, Session, and JWT:

```typescript
import "next-auth"
import "next-auth/jwt"
import type { ResolvedPermissions } from "@/lib/rbac/types"

declare module "next-auth" {
  interface User {
    id: string
    clinicId: string
    role: string
    professionalProfileId: string | null
    appointmentDuration: number | null
    permissions: ResolvedPermissions
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      clinicId: string
      role: string
      professionalProfileId: string | null
      appointmentDuration: number | null
      permissions: ResolvedPermissions
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    clinicId: string
    role: string
    professionalProfileId: string | null
    appointmentDuration: number | null
    permissions: ResolvedPermissions
  }
}
```

**Step 2: Update auth.ts — Load overrides during login**

In the `authorize` callback, after fetching the user, fetch their permission overrides and resolve:

```typescript
// After the existing user query, add:
import { resolvePermissions, type Feature } from "./rbac"
import { FeatureAccess } from "@prisma/client"

// Inside authorize(), after isValidPassword check passes:
const userPermissions = await prisma.userPermission.findMany({
  where: { userId: user.id },
  select: { feature: true, access: true },
})
const overrides: Partial<Record<Feature, FeatureAccess>> = {}
for (const p of userPermissions) {
  overrides[p.feature as Feature] = p.access
}
const permissions = resolvePermissions(user.role, overrides)

// Add to the return:
return {
  id: user.id,
  email: user.email,
  name: user.name,
  clinicId: user.clinicId,
  role: user.role,
  professionalProfileId: user.professionalProfile?.id ?? null,
  appointmentDuration: user.professionalProfile?.appointmentDuration ?? null,
  permissions,
}
```

**Step 3: Update auth.config.ts — Pass permissions through JWT/session**

In the `jwt` callback:

```typescript
jwt({ token, user }) {
  if (user) {
    token.id = user.id
    token.clinicId = user.clinicId
    token.role = user.role
    token.professionalProfileId = user.professionalProfileId
    token.appointmentDuration = user.appointmentDuration
    token.permissions = user.permissions
  }
  return token
},
```

In the `session` callback:

```typescript
session({ session, token }) {
  if (token) {
    session.user.id = token.id as string
    session.user.clinicId = token.clinicId as string
    session.user.role = token.role as string
    session.user.professionalProfileId = token.professionalProfileId as string | null
    session.user.appointmentDuration = token.appointmentDuration as number | null
    session.user.permissions = token.permissions
  }
  return session
},
```

**Step 4: Commit**

```bash
git add src/types/next-auth.d.ts src/lib/auth.ts src/lib/auth.config.ts
git commit -m "feat: load resolved permissions into NextAuth session"
```

---

### Task 4: Refactor withAuth wrapper

**Files:**
- Modify: `src/lib/api/with-auth.ts`

**Step 1: Add feature-based withAuth overload**

Keep the existing `withAuth` signature working (for routes not yet migrated). Add a new `withFeatureAuth` function alongside it:

```typescript
import { FeatureAccess } from "@prisma/client"
import { meetsMinAccess, type Feature } from "@/lib/rbac"

export interface FeatureAuthOptions {
  feature: Feature
  minAccess: FeatureAccess
}

export interface FeatureAuthContext {
  user: AuthUser
  access: FeatureAccess
}

type FeatureAuthorizedHandler = (
  req: NextRequest,
  context: FeatureAuthContext,
  params: Record<string, string>
) => Promise<NextResponse>

export function withFeatureAuth(
  options: FeatureAuthOptions,
  handler: FeatureAuthorizedHandler
) {
  return async (
    req: NextRequest,
    routeContext?: RouteParams
  ): Promise<NextResponse> => {
    const session = await auth()

    if (!session?.user) {
      return unauthorizedResponse()
    }

    const user: AuthUser = {
      id: session.user.id,
      clinicId: session.user.clinicId,
      role: session.user.role as Role,
      professionalProfileId: session.user.professionalProfileId,
      permissions: session.user.permissions,
    }

    const params = routeContext?.params ? await routeContext.params : {}
    const access = user.permissions[options.feature]

    if (!meetsMinAccess(access, options.minAccess)) {
      return forbiddenResponse(
        `Sem permissao para acessar ${options.feature}`
      )
    }

    return handler(req, { user, access }, params)
  }
}
```

Also update the existing `withAuth` to populate `permissions` on AuthUser from the session:

In the `withAuth` function, change the user construction to:

```typescript
const user: AuthUser = {
  id: session.user.id,
  clinicId: session.user.clinicId,
  role: session.user.role as Role,
  professionalProfileId: session.user.professionalProfileId,
  permissions: session.user.permissions,
}
```

Same for `withAuthentication`.

**Step 2: Export from index**

In `src/lib/api/index.ts`, add:

```typescript
export { withFeatureAuth } from "./with-auth"
export type { FeatureAuthOptions, FeatureAuthContext } from "./with-auth"
```

**Step 3: Commit**

```bash
git add src/lib/api/
git commit -m "feat: add withFeatureAuth wrapper for feature-based permission checks"
```

---

### Task 5: Migrate all API routes to withFeatureAuth

**Files:** Every file in `src/app/api/` that uses `withAuth`.

This is a mechanical find-and-replace task. For each API route file, replace `withAuth` calls with `withFeatureAuth` using the feature mapping below. The handler signature changes from `{ user, scope }` to `{ user, access }`.

**Feature mapping for each route:**

| Route file | Feature | GET/list min | Mutate min |
|---|---|---|---|
| `api/appointments/route.ts` | See note below* | READ | WRITE |
| `api/appointments/[id]/route.ts` | `agenda_own`** | READ | WRITE |
| `api/appointments/[id]/status/route.ts` | `agenda_own`** | - | WRITE |
| `api/appointments/[id]/cancel/route.ts` | `agenda_own`** | - | WRITE |
| `api/appointments/[id]/notifications/route.ts` | `agenda_own`** | READ | - |
| `api/appointments/[id]/resend-confirmation/route.ts` | `agenda_own`** | - | WRITE |
| `api/appointments/recurrences/[id]/route.ts` | `agenda_own`** | READ | WRITE |
| `api/appointments/recurrences/[id]/exceptions/route.ts` | `agenda_own`** | READ | WRITE |
| `api/appointments/recurrences/[id]/finalize/route.ts` | `agenda_own`** | - | WRITE |
| `api/patients/route.ts` | `patients` | READ | WRITE |
| `api/patients/[id]/route.ts` | `patients` | READ | WRITE |
| `api/groups/route.ts` | `groups` | READ | WRITE |
| `api/groups/[groupId]/route.ts` | `groups` | READ | WRITE |
| `api/groups/[groupId]/members/route.ts` | `groups` | - | WRITE |
| `api/groups/[groupId]/members/[memberId]/route.ts` | `groups` | - | WRITE |
| `api/groups/[groupId]/sessions/route.ts` | `groups` | - | WRITE |
| `api/group-sessions/route.ts` | `groups` | READ | - |
| `api/users/route.ts` | `users` | READ | WRITE |
| `api/users/[id]/route.ts` | `users` | READ | WRITE |
| `api/professionals/route.ts` | `professionals` | READ | WRITE |
| `api/professionals/[id]/route.ts` | `professionals` | READ | WRITE |
| `api/admin/settings/route.ts` | `clinic_settings` | READ | WRITE |
| `api/admin/notification-templates/route.ts` | `notifications` | READ | WRITE |
| `api/admin/notification-templates/preview/route.ts` | `notifications` | - | WRITE |
| `api/admin/notification-templates/reset/route.ts` | `notifications` | - | WRITE |
| `api/admin/audit-logs/route.ts` | `audit_logs` | READ | - |
| `api/availability/route.ts` | `availability_own`*** | READ | WRITE |
| `api/availability/exceptions/route.ts` | `availability_own`*** | READ | WRITE |
| `api/availability/exceptions/[id]/route.ts` | `availability_own`*** | READ | WRITE |
| `api/dashboard/route.ts` | Keep `withAuthentication` (no change) | - | - |
| `api/profile/route.ts` | Keep `withAuthentication` (no change) | - | - |
| `api/me/route.ts` | Keep as-is | - | - |

**Notes:**
- `*` Appointments GET list: use `agenda_own` with READ. Inside the handler, if user wants to see others' appointments, check `user.permissions.agenda_others`.
- `**` Appointment mutation routes: check `agenda_own` at minimum. Inside handler, if the appointment belongs to another professional, additionally check `agenda_others`.
- `***` Availability routes: check `availability_own` at minimum. Inside handler, if managing another professional's availability, check `availability_others`.

**Pattern for migration (example: patients/route.ts):**

Before:
```typescript
export const GET = withAuth(
  { resource: "patient", action: "list" },
  async (req, { user, scope }) => {
```

After:
```typescript
export const GET = withFeatureAuth(
  { feature: "patients", minAccess: "READ" },
  async (req, { user, access }) => {
```

Where the handler used `scope === "own"` to filter results, replace with:
- `access === "READ"` or check specific feature permissions
- For patients: if `user.permissions.patients === "READ"` user can see all patients (just not edit). If `user.permissions.patients === "NONE"` they can't access.

**Important:** Routes that previously checked `scope !== "clinic"` for write operations should now check `access !== "WRITE"`:

Before:
```typescript
if (scope !== "clinic") {
  return forbiddenResponse("Apenas administradores podem atualizar pacientes")
}
```

After:
```typescript
if (access !== "WRITE") {
  return forbiddenResponse("Sem permissao para modificar pacientes")
}
```

**Step: Migrate in batches and commit after each batch:**

1. Patient routes (`api/patients/`, `api/patients/[id]/`) — commit
2. Appointment routes (all under `api/appointments/`) — commit
3. Group routes (all under `api/groups/`, `api/group-sessions/`) — commit
4. User routes (`api/users/`, `api/users/[id]/`) — commit
5. Admin routes (`api/admin/`) — commit
6. Professional routes (`api/professionals/`) — commit
7. Availability routes (`api/availability/`) — commit

**After each batch:** Run `npm run build` to verify no type errors.

---

### Task 6: Permissions management API

**Files:**
- Create: `src/app/api/admin/permissions/route.ts`

**Step 1: Create GET and PUT endpoints**

```typescript
// GET /api/admin/permissions
// Returns all users with their resolved permissions and overrides
// Only accessible to users with users:WRITE

// PUT /api/admin/permissions
// Body: { userId: string, feature: string, access: FeatureAccess | null }
// null = remove override (revert to role default)
// Only accessible to users with users:WRITE
```

GET handler:
- Fetch all active users in the clinic with their roles
- Fetch all UserPermission records for the clinic
- Return users with their role, resolved permissions, and which ones are overrides

PUT handler:
- Validate userId belongs to clinic
- Validate feature is a valid Feature
- If access is null, delete the UserPermission row (revert to default)
- If access is a valid FeatureAccess, upsert the UserPermission row
- Prevent users from removing their own `users:WRITE` permission (safety)
- Return updated resolved permissions for the user

**Step 2: Commit**

```bash
git add src/app/api/admin/permissions/
git commit -m "feat: add permissions management API"
```

---

### Task 7: usePermission hook

**Files:**
- Create: `src/shared/hooks/usePermission.ts`

**Step 1: Create the hook**

```typescript
"use client"

import { useSession } from "next-auth/react"
import type { Feature } from "@/lib/rbac/types"

export function usePermission(feature: Feature) {
  const { data: session } = useSession()
  const access = session?.user?.permissions?.[feature] ?? "NONE"
  return {
    canRead: access === "READ" || access === "WRITE",
    canWrite: access === "WRITE",
    access,
  }
}

export function usePermissions() {
  const { data: session } = useSession()
  return session?.user?.permissions ?? null
}
```

**Step 2: Commit**

```bash
git add src/shared/hooks/
git commit -m "feat: add usePermission hook"
```

---

### Task 8: Update navigation components

**Files:**
- Modify: `src/shared/components/ui/desktop-header.tsx`
- Modify: `src/shared/components/ui/bottom-navigation.tsx`

**Step 1: Update desktop-header.tsx**

Add feature-based nav filtering. Each nav item gets a `feature` property:

```typescript
interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  matchPaths?: string[]
  feature?: Feature // If set, only show if user has at least READ
}

const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: ... },
  { href: "/agenda", label: "Agenda", icon: ..., matchPaths: ["/agenda"], feature: "agenda_own" },
  { href: "/professionals", label: "Profissionais", icon: ..., matchPaths: ["/professionals", "/admin/professionals"], feature: "professionals" },
  { href: "/patients", label: "Pacientes", icon: ..., matchPaths: ["/patients"], feature: "patients" },
  { href: "/groups", label: "Grupos", icon: ..., matchPaths: ["/groups"], feature: "groups" },
]
```

In the render, filter items:

```typescript
const permissions = session?.user?.permissions
const visibleItems = navItems.filter(item => {
  if (!item.feature) return true
  const access = permissions?.[item.feature]
  return access === "READ" || access === "WRITE"
})
```

**Step 2: Same pattern for bottom-navigation.tsx**

**Step 3: Commit**

```bash
git add src/shared/components/ui/desktop-header.tsx src/shared/components/ui/bottom-navigation.tsx
git commit -m "feat: filter navigation items based on user permissions"
```

---

### Task 9: Update frontend pages — permission enforcement

**Files:** All page files that currently check `session?.user?.role === "ADMIN"`.

**Pattern for each page:**

1. Replace `const isAdmin = session?.user?.role === "ADMIN"` with `usePermission`:

```typescript
import { usePermission } from "@/shared/hooks/usePermission"

// In the component:
const { canRead, canWrite } = usePermission("patients")
```

2. Replace admin redirect checks:

Before:
```typescript
if (session?.user?.role !== "ADMIN") {
  toast.error("Acesso restrito a administradores")
  router.push("/")
  return
}
```

After:
```typescript
if (!canRead) {
  toast.error("Sem permissao para acessar esta pagina")
  router.push("/")
  return
}
```

3. Replace conditional renders:

Before: `{isAdmin && <button>Novo Paciente</button>}`
After: `{canWrite && <button>Novo Paciente</button>}`

**Pages to update:**

| Page | File | Feature | What changes |
|---|---|---|---|
| Home | `src/app/page.tsx` | Multiple | Revenue section: `canRead("clinic_settings")`. Users card: `canRead("users")`. Professionals card: `canRead("professionals")`. |
| Patients | `src/app/patients/page.tsx` | `patients` | Create/edit buttons: `canWrite`. View: `canRead`. |
| Agenda | `src/app/agenda/page.tsx` | `agenda_own`, `agenda_others` | Professional dropdown: `agenda_others.canRead`. Create/edit appointment: `canWrite`. |
| Agenda weekly | `src/app/agenda/weekly/page.tsx` | Same as agenda | Same pattern. |
| Groups | `src/app/groups/page.tsx` | `groups` | Create/edit: `canWrite`. |
| Users | `src/app/users/page.tsx` | `users` | Access gate: `canRead`. Create/edit: `canWrite`. |
| Admin Settings | `src/app/admin/settings/page.tsx` | `clinic_settings` | Access gate: `canRead`. Edit: `canWrite`. |
| Admin Notifications | `src/app/admin/settings/notifications/page.tsx` | `notifications` | Access gate: `canRead`. Edit: `canWrite`. |
| Admin Professionals | `src/app/admin/professionals/page.tsx` | `professionals` | Access gate: `canRead`. Edit: `canWrite`. |
| Professionals | `src/app/professionals/page.tsx` | `professionals` | Edit buttons: `canWrite`. |
| Availability | `src/app/settings/availability/page.tsx` | `availability_own`, `availability_others` | Edit: `canWrite`. Others: `availability_others.canRead`. |

**Migrate in batches and commit after each:**
1. Patients page — commit
2. Agenda pages (daily + weekly) — commit
3. Groups page — commit
4. Admin pages (users, settings, notifications, professionals) — commit
5. Other pages (professionals, availability, home) — commit

---

### Task 10: Admin permissions page

**Files:**
- Create: `src/app/admin/permissions/page.tsx`

**Step 1: Build the permissions management page**

Requirements:
- Admin-only page (gate: `users` feature with WRITE access)
- Fetch all users and their permissions from `GET /api/admin/permissions`
- Render a table: users as rows, features as columns
- Each cell is a dropdown with options: "Nenhum", "Leitura", "Escrita"
- Cells that differ from role default get a visual indicator (colored border or badge)
- Dropdown includes "Default (Leitura)" option text showing what the role default is
- On change: call `PUT /api/admin/permissions` with `{ userId, feature, access }`
- If selecting the role default value: send `access: null` to remove override
- Show user's role badge next to their name
- Filter/search by user name

**Step 2: Add link to admin permissions page**

In the home page (`src/app/page.tsx`), add a "Permissoes" action card visible to users with `users:WRITE`.

In the desktop header dropdown menu, add "Permissoes" link for users with `users:WRITE`.

**Step 3: Commit**

```bash
git add src/app/admin/permissions/
git commit -m "feat: add admin permissions management page"
```

---

### Task 11: Build, test, and verify

**Step 1: Run build**

```bash
npm run build
```

Expected: No errors.

**Step 2: Manual verification checklist**

1. Login as ADMIN — should see all nav items, full access everywhere
2. Login as PROFESSIONAL — should see restricted nav, readonly patients, own agenda only
3. Give a PROFESSIONAL `agenda_others: READ` — they should see others' agendas but not edit
4. Give a PROFESSIONAL `patients: WRITE` — they should be able to create/edit patients
5. Remove an override — should revert to role default
6. Verify ADMIN cannot remove their own `users: WRITE` permission

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete feature-based permission system"
```
