import { Role, FeatureAccess } from "@prisma/client"
import type { Resource, Action, Permission, Feature, ResolvedPermissions } from "./types"
import { FEATURES } from "./types"

type RolePermissions = Record<Role, Permission[]>

/**
 * Define permissions for each role.
 *
 * ADMIN: Can access all resources within their clinic
 * PROFESSIONAL: Can only access own resources (appointments, profile)
 */
export const rolePermissions: RolePermissions = {
  ADMIN: [
    // Full clinic-wide access to appointments
    { resource: "appointment", action: "create", scope: "clinic" },
    { resource: "appointment", action: "read", scope: "clinic" },
    { resource: "appointment", action: "update", scope: "clinic" },
    { resource: "appointment", action: "delete", scope: "clinic" },
    { resource: "appointment", action: "list", scope: "clinic" },

    // Full clinic-wide access to patients
    { resource: "patient", action: "create", scope: "clinic" },
    { resource: "patient", action: "read", scope: "clinic" },
    { resource: "patient", action: "update", scope: "clinic" },
    { resource: "patient", action: "delete", scope: "clinic" },
    { resource: "patient", action: "list", scope: "clinic" },

    // Full clinic-wide access to users
    { resource: "user", action: "create", scope: "clinic" },
    { resource: "user", action: "read", scope: "clinic" },
    { resource: "user", action: "update", scope: "clinic" },
    { resource: "user", action: "delete", scope: "clinic" },
    { resource: "user", action: "list", scope: "clinic" },

    // Clinic settings management
    { resource: "clinic", action: "read", scope: "own" },
    { resource: "clinic", action: "update", scope: "own" },

    // Professional profiles management
    { resource: "professional-profile", action: "create", scope: "clinic" },
    { resource: "professional-profile", action: "read", scope: "clinic" },
    { resource: "professional-profile", action: "update", scope: "clinic" },
    { resource: "professional-profile", action: "delete", scope: "clinic" },
    { resource: "professional-profile", action: "list", scope: "clinic" },

    // Availability management for all professionals
    { resource: "availability-rule", action: "create", scope: "clinic" },
    { resource: "availability-rule", action: "read", scope: "clinic" },
    { resource: "availability-rule", action: "update", scope: "clinic" },
    { resource: "availability-rule", action: "delete", scope: "clinic" },
    { resource: "availability-rule", action: "list", scope: "clinic" },

    { resource: "availability-exception", action: "create", scope: "clinic" },
    { resource: "availability-exception", action: "read", scope: "clinic" },
    { resource: "availability-exception", action: "update", scope: "clinic" },
    { resource: "availability-exception", action: "delete", scope: "clinic" },
    { resource: "availability-exception", action: "list", scope: "clinic" },

    // Audit logs read-only access
    { resource: "audit-log", action: "read", scope: "clinic" },
    { resource: "audit-log", action: "list", scope: "clinic" },

    // Notifications management
    { resource: "notification", action: "read", scope: "clinic" },
    { resource: "notification", action: "list", scope: "clinic" },

    // Notification templates management
    { resource: "notification-template", action: "read", scope: "clinic" },
    { resource: "notification-template", action: "update", scope: "clinic" },
    { resource: "notification-template", action: "list", scope: "clinic" },

    // Therapy groups management
    { resource: "therapy-group", action: "create", scope: "clinic" },
    { resource: "therapy-group", action: "read", scope: "clinic" },
    { resource: "therapy-group", action: "update", scope: "clinic" },
    { resource: "therapy-group", action: "delete", scope: "clinic" },
    { resource: "therapy-group", action: "list", scope: "clinic" },
  ],

  PROFESSIONAL: [
    // Own appointments only
    { resource: "appointment", action: "create", scope: "own" },
    { resource: "appointment", action: "read", scope: "own" },
    { resource: "appointment", action: "update", scope: "own" },
    { resource: "appointment", action: "delete", scope: "own" },
    { resource: "appointment", action: "list", scope: "own" },

    // Can view patients they have appointments with
    { resource: "patient", action: "read", scope: "own" },
    { resource: "patient", action: "list", scope: "own" },

    // Own profile only
    { resource: "professional-profile", action: "read", scope: "own" },
    { resource: "professional-profile", action: "update", scope: "own" },

    // Own availability management
    { resource: "availability-rule", action: "create", scope: "own" },
    { resource: "availability-rule", action: "read", scope: "own" },
    { resource: "availability-rule", action: "update", scope: "own" },
    { resource: "availability-rule", action: "delete", scope: "own" },
    { resource: "availability-rule", action: "list", scope: "own" },

    { resource: "availability-exception", action: "create", scope: "own" },
    { resource: "availability-exception", action: "read", scope: "own" },
    { resource: "availability-exception", action: "update", scope: "own" },
    { resource: "availability-exception", action: "delete", scope: "own" },
    { resource: "availability-exception", action: "list", scope: "own" },

    // Own notifications
    { resource: "notification", action: "read", scope: "own" },
    { resource: "notification", action: "list", scope: "own" },

    // Own therapy groups
    { resource: "therapy-group", action: "create", scope: "own" },
    { resource: "therapy-group", action: "read", scope: "own" },
    { resource: "therapy-group", action: "update", scope: "own" },
    { resource: "therapy-group", action: "delete", scope: "own" },
    { resource: "therapy-group", action: "list", scope: "own" },
  ],
}

/**
 * Check if a role has a specific permission for a resource and action
 */
export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action
): Permission | null {
  const permissions = rolePermissions[role]
  return permissions.find(p => p.resource === resource && p.action === action) ?? null
}

// ---- Feature-based permission system ----

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
