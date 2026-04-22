/**
 * Tenant-scope filter for therapy group queries.
 *
 * PROFESSIONAL users without `groups_others` see only groups they're a member
 * of (via `TherapyGroupProfessional`).
 */

import type { Prisma } from "@prisma/client"
import type { AuthUser } from "../rbac/types"

export function groupScopeFilter(user: AuthUser): Prisma.TherapyGroupWhereInput {
  const canSeeOthers = user.permissions.groups_others === "WRITE" || user.permissions.groups_others === "READ"
  if (user.role === "ADMIN" || canSeeOthers) return {}
  if (!user.professionalProfileId) return { id: "__none__" }
  const profId = user.professionalProfileId
  return {
    OR: [
      { professionalProfileId: profId },
      { additionalProfessionals: { some: { professionalProfileId: profId } } },
    ],
  }
}

export function canSeeAllGroups(user: AuthUser): boolean {
  if (user.role === "ADMIN") return true
  return user.permissions.groups_others === "WRITE" || user.permissions.groups_others === "READ"
}
