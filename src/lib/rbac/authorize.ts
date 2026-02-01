import { Role } from "@prisma/client/client"
import { hasPermission } from "./permissions"
import type {
  AuthUser,
  AuthorizationContext,
  AuthorizationResult,
  Resource,
  Action,
} from "./types"

/**
 * Main authorization function that checks if a user can perform an action on a resource.
 *
 * Authorization logic:
 * 1. Check if the user's role has permission for the resource/action
 * 2. If scope is "clinic", verify the resource belongs to the user's clinic
 * 3. If scope is "own", verify the resource belongs to the user
 */
export function authorize(context: AuthorizationContext): AuthorizationResult {
  const { user, resource, action, resourceOwnerId, resourceClinicId } = context

  // Get the permission for this role/resource/action combination
  const permission = hasPermission(user.role as Role, resource, action)

  if (!permission) {
    return {
      allowed: false,
      reason: `Role ${user.role} does not have permission to ${action} ${resource}`,
    }
  }

  // Check scope-based access
  switch (permission.scope) {
    case "all":
      // Unrestricted access (not currently used, but available for future super-admin)
      return { allowed: true }

    case "clinic":
      // User can access any resource within their clinic
      if (resourceClinicId && resourceClinicId !== user.clinicId) {
        return {
          allowed: false,
          reason: `Resource belongs to a different clinic`,
        }
      }
      return { allowed: true }

    case "own":
      // User can only access their own resources
      if (!resourceOwnerId) {
        // If no owner specified, allow (list operations will filter results)
        return { allowed: true }
      }
      if (!isResourceOwner(user, resource, resourceOwnerId)) {
        return {
          allowed: false,
          reason: `User does not own this ${resource}`,
        }
      }
      return { allowed: true }

    default:
      return {
        allowed: false,
        reason: `Unknown permission scope`,
      }
  }
}

/**
 * Check if a user owns a specific resource.
 * Ownership is determined differently based on resource type.
 */
function isResourceOwner(
  user: AuthUser,
  resource: Resource,
  resourceOwnerId: string
): boolean {
  switch (resource) {
    case "appointment":
    case "availability-rule":
    case "availability-exception":
      // These are owned by the professional profile
      return user.professionalProfileId === resourceOwnerId

    case "professional-profile":
      // Professional profile is owned by the user
      return user.professionalProfileId === resourceOwnerId || user.id === resourceOwnerId

    case "user":
      // Users own themselves
      return user.id === resourceOwnerId

    case "clinic":
      // Clinic ownership is checked by clinic ID
      return user.clinicId === resourceOwnerId

    case "patient":
      // Patients are "owned" by professionals who have appointments with them
      // This check requires database lookup, so we return true here
      // and let the API route handle the actual verification
      return true

    case "notification":
      // Notifications can be owned by the user
      return user.id === resourceOwnerId

    default:
      return false
  }
}

/**
 * Simple check if a user has permission without ownership context.
 * Useful for checking if an action is even possible for the user's role.
 */
export function canPerform(
  user: AuthUser,
  resource: Resource,
  action: Action
): boolean {
  const permission = hasPermission(user.role as Role, resource, action)
  return permission !== null
}

/**
 * Get the scope of a user's permission for a specific resource/action.
 * Returns null if the user has no permission.
 */
export function getPermissionScope(
  user: AuthUser,
  resource: Resource,
  action: Action
): "own" | "clinic" | "all" | null {
  const permission = hasPermission(user.role as Role, resource, action)
  return permission?.scope ?? null
}
