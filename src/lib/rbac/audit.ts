import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import type { AuthUser, Resource, Action } from "./types"

/**
 * Standard audit action types for consistent logging
 */
export const AuditAction = {
  // Appointments
  APPOINTMENT_CREATED: "APPOINTMENT_CREATED",
  APPOINTMENT_UPDATED: "APPOINTMENT_UPDATED",
  APPOINTMENT_DELETED: "APPOINTMENT_DELETED",
  APPOINTMENT_STATUS_CHANGED: "APPOINTMENT_STATUS_CHANGED",
  APPOINTMENT_CANCELLED: "APPOINTMENT_CANCELLED",
  PROFESSIONAL_CANCELLATION: "PROFESSIONAL_CANCELLATION",
  CONFIRMATION_RESENT: "CONFIRMATION_RESENT",

  // Patients
  PATIENT_CREATED: "PATIENT_CREATED",
  PATIENT_UPDATED: "PATIENT_UPDATED",
  PATIENT_DELETED: "PATIENT_DELETED",

  // Professionals/Users
  PROFESSIONAL_CREATED: "PROFESSIONAL_CREATED",
  PROFESSIONAL_UPDATED: "PROFESSIONAL_UPDATED",
  PROFESSIONAL_DELETED: "PROFESSIONAL_DELETED",
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",

  // Authentication
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",

  // Authorization
  PERMISSION_DENIED: "PERMISSION_DENIED",
} as const

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction]

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

interface AuditLogRequestParams {
  user: AuthUser
  action: AuditActionType
  entityType: string
  entityId: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  request?: Request
}

/**
 * Extract IP address and user-agent from request headers
 */
function extractRequestMetadata(request?: Request): {
  ipAddress?: string
  userAgent?: string
} {
  if (!request) return {}

  const ipAddress =
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined
  const userAgent = request.headers.get("user-agent") ?? undefined

  return { ipAddress, userAgent }
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
  const { ipAddress, userAgent } = extractRequestMetadata(request)

  await createAuditLog({
    user,
    action: AuditAction.PERMISSION_DENIED,
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

/**
 * Service-layer audit logging method.
 * Simplified API that extracts request metadata automatically.
 *
 * Example usage:
 * ```ts
 * await audit.log({
 *   user,
 *   action: AuditAction.PATIENT_CREATED,
 *   entityType: "Patient",
 *   entityId: patient.id,
 *   newValues: { name: patient.name },
 *   request,
 * })
 * ```
 */
export const audit = {
  async log(params: AuditLogRequestParams): Promise<void> {
    const { user, action, entityType, entityId, oldValues, newValues, request } = params
    const { ipAddress, userAgent } = extractRequestMetadata(request)

    await createAuditLog({
      user,
      action,
      entityType,
      entityId,
      oldValues: oldValues as Prisma.InputJsonValue,
      newValues: newValues as Prisma.InputJsonValue,
      ipAddress,
      userAgent,
    })
  },
}

/**
 * Log authentication events (login success/failure).
 * Since login events may not have a full AuthUser, this takes minimal params.
 */
export async function logAuthEvent(params: {
  clinicId: string
  userId?: string
  action: typeof AuditAction.LOGIN_SUCCESS | typeof AuditAction.LOGIN_FAILED
  email: string
  request?: Request
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { clinicId, userId, action, email, request, metadata } = params
  const { ipAddress, userAgent } = extractRequestMetadata(request)

  await prisma.auditLog.create({
    data: {
      clinicId,
      userId: userId ?? null,
      action,
      entityType: "User",
      entityId: userId ?? email,
      oldValues: Prisma.JsonNull,
      newValues: {
        email,
        ...metadata,
      } as Prisma.InputJsonValue,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  })
}
