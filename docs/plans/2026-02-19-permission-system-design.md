# Permission System Design

## Overview

Replace the current rigid 2-role (ADMIN/PROFESSIONAL) permission system with a feature-based permission system that keeps roles as defaults but allows per-user overrides. Each feature has 3 access levels: NONE, READ, WRITE.

## Data Model

### FeatureAccess enum

```
NONE   - No access
READ   - View only
WRITE  - Full access (create, edit, delete)
```

### Features

| Feature key          | Description                          | Default ADMIN | Default PROFESSIONAL |
|----------------------|--------------------------------------|---------------|----------------------|
| `agenda_own`         | Own agenda                           | WRITE         | WRITE                |
| `agenda_others`      | Other professionals' agendas         | WRITE         | NONE                 |
| `patients`           | Patients (list, records)             | WRITE         | READ                 |
| `groups`             | Therapy groups                       | WRITE         | WRITE                |
| `users`              | User management                      | WRITE         | NONE                 |
| `clinic_settings`    | Clinic settings                      | WRITE         | NONE                 |
| `professionals`      | Professional management              | WRITE         | NONE                 |
| `notifications`      | Notification templates               | WRITE         | NONE                 |
| `audit_logs`         | Audit logs                           | READ          | NONE                 |
| `availability_own`   | Own availability                     | WRITE         | WRITE                |
| `availability_others`| Others' availability                 | WRITE         | NONE                 |

### Prisma model

```prisma
enum FeatureAccess {
  NONE
  READ
  WRITE
}

model UserPermission {
  id        String        @id @default(cuid())
  userId    String
  clinicId  String
  feature   String
  access    FeatureAccess

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  clinic Clinic @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@unique([userId, feature])
  @@index([clinicId])
}
```

### Resolution logic

1. Get role defaults for user's role
2. Fetch overrides from UserPermission table
3. Override wins if present; otherwise role default applies

Resolved permissions are loaded into the NextAuth session to avoid per-request DB queries.

## Backend

### withAuth changes

The `withAuth` wrapper changes from resource/action to feature/minAccess:

```typescript
export const GET = withAuth(
  { feature: "patients", minAccess: "READ" },
  async (req, { user, access }, params) => {
    // access = resolved FeatureAccess for this user+feature
  }
)
```

### Feature-to-route mapping

| API Route                             | Feature             | GET needs | Mutate needs |
|---------------------------------------|---------------------|-----------|--------------|
| `/api/appointments` (own)             | `agenda_own`        | READ      | WRITE        |
| `/api/appointments` (others)          | `agenda_others`     | READ      | WRITE        |
| `/api/patients`                       | `patients`          | READ      | WRITE        |
| `/api/groups`                         | `groups`            | READ      | WRITE        |
| `/api/users`                          | `users`             | READ      | WRITE        |
| `/api/admin/settings`                 | `clinic_settings`   | READ      | WRITE        |
| `/api/professionals`                  | `professionals`     | READ      | WRITE        |
| `/api/admin/notification-templates`   | `notifications`     | READ      | WRITE        |
| `/api/admin/audit-logs`               | `audit_logs`        | READ      | N/A          |
| `/api/availability` (own)             | `availability_own`  | READ      | WRITE        |
| `/api/availability` (others)          | `availability_others`| READ     | WRITE        |

## Frontend

### Permissions page (`/admin/permissions`)

Table layout: users (rows) x features (columns). Each cell has a dropdown (Nenhum / Leitura / Escrita). Overrides (values different from role default) are visually distinct. "Restore default" option per override.

### usePermission hook

```typescript
function usePermission(feature: string) {
  const session = useSession()
  const access = session?.data?.user?.permissions?.[feature] ?? "NONE"
  return {
    canRead: access === "READ" || access === "WRITE",
    canWrite: access === "WRITE",
    access,
  }
}
```

### Enforcement

- Navigation: menu items hidden if user has NONE for the feature
- Pages: redirect to home if access = NONE
- Action buttons: hidden if access = READ
- Forms: disabled fields in read-only mode

### Session shape

```typescript
session.user.permissions = {
  agenda_own: "WRITE",
  agenda_others: "READ",
  patients: "WRITE",
  groups: "WRITE",
  users: "NONE",
  // ... all features pre-resolved
}
```

## Migration path

1. Add FeatureAccess enum and UserPermission model to Prisma
2. Refactor RBAC layer (types, permissions, authorize, withAuth)
3. Update NextAuth session to include resolved permissions
4. Update all API routes to use new withAuth signature
5. Create /admin/permissions page and API
6. Update frontend navigation and pages to use usePermission hook
7. Existing behavior preserved: ADMIN gets full access, PROFESSIONAL gets restricted access (same as today's defaults)
