import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import type { AuthUser, Resource, Action } from "./types"

interface AuditLogParams {
  user: AuthUser
  action: string
  entityType: string
  entityId: string
  oldValues?: Prisma.InputJsonValue
  newValues?: Prisma.InputJsonValue
  ipAddress?: string
  userAgent?: string
}

/**
 * Create an audit log entry.
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  const { user, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent } =
    params

  await prisma.auditLog.create({
    data: {
      clinicId: user.clinicId,
      userId: user.id,
      action,
      entityType,
      entityId,
      oldValues: oldValues,
      newValues: newValues,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  })
}

/**
 * Log a permission denied event.
 * This creates an audit log entry when a user attempts to access a resource
 * they don't have permission to access.
 */
export async function logPermissionDenied(
  user: AuthUser,
  resource: Resource,
  action: Action,
  resourceId: string,
  reason: string,
  request?: Request
): Promise<void> {
  const ipAddress = request
    ? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined
    : undefined
  const userAgent = request ? request.headers.get("user-agent") ?? undefined : undefined

  await createAuditLog({
    user,
    action: "PERMISSION_DENIED",
    entityType: resource,
    entityId: resourceId || "unknown",
    newValues: {
      attemptedAction: action,
      reason,
    },
    ipAddress,
    userAgent,
  })
}
