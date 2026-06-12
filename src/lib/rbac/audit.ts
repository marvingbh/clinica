import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
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

  // Invoices
  INVOICE_STATUS_CHANGED: "INVOICE_STATUS_CHANGED",
  INVOICE_RECALCULATED: "INVOICE_RECALCULATED",
  INVOICE_ITEM_ADDED: "INVOICE_ITEM_ADDED",
  INVOICE_ITEM_UPDATED: "INVOICE_ITEM_UPDATED",
  INVOICE_ITEM_DELETED: "INVOICE_ITEM_DELETED",
  INVOICE_DELETED: "INVOICE_DELETED",
  INVOICE_SENT: "INVOICE_SENT",
  INVOICE_DUE_DATE_CHANGED: "INVOICE_DUE_DATE_CHANGED",
  INVOICE_NF_CHANGED: "INVOICE_NF_CHANGED",
  INVOICE_NOTES_UPDATED: "INVOICE_NOTES_UPDATED",
  INVOICE_ITEMS_RELINKED: "INVOICE_ITEMS_RELINKED",

  // NFS-e
  NFSE_EMITIDA: "NFSE_EMITIDA",
  NFSE_ERRO: "NFSE_ERRO",
  NFSE_CANCELADA: "NFSE_CANCELADA",
  NFSE_CONFIG_UPDATED: "NFSE_CONFIG_UPDATED",
  NFSE_EMAILED: "NFSE_EMAILED",

  // Intake submissions
  INTAKE_APPROVED: "INTAKE_APPROVED",
  INTAKE_REJECTED: "INTAKE_REJECTED",

  // Online booking
  BOOKING_SETTINGS_UPDATED: "BOOKING_SETTINGS_UPDATED",
  BOOKING_REQUEST_APPROVED: "BOOKING_REQUEST_APPROVED",
  BOOKING_REQUEST_REJECTED: "BOOKING_REQUEST_REJECTED",

  // Waitlist (lista de espera)
  WAITLIST_ENTRY_CREATED: "WAITLIST_ENTRY_CREATED",
  WAITLIST_ENTRY_UPDATED: "WAITLIST_ENTRY_UPDATED",
  WAITLIST_ENTRY_REMOVED: "WAITLIST_ENTRY_REMOVED",
  WAITLIST_ENTRIES_REORDERED: "WAITLIST_ENTRIES_REORDERED",
  WAITLIST_OFFER_SENT: "WAITLIST_OFFER_SENT",
  WAITLIST_OFFER_ACCEPTED: "WAITLIST_OFFER_ACCEPTED",
  WAITLIST_OFFER_DECLINED: "WAITLIST_OFFER_DECLINED",
  WAITLIST_OFFER_EXPIRED: "WAITLIST_OFFER_EXPIRED",
  WAITLIST_CONVERTED: "WAITLIST_CONVERTED",
  WAITLIST_SETTINGS_UPDATED: "WAITLIST_SETTINGS_UPDATED",

  // Repasse Payments
  REPASSE_PAYMENT_CREATED: "REPASSE_PAYMENT_CREATED",
  REPASSE_PAYMENT_DELETED: "REPASSE_PAYMENT_DELETED",

  // Expenses
  EXPENSE_CREATED: "EXPENSE_CREATED",
  EXPENSE_UPDATED: "EXPENSE_UPDATED",
  EXPENSE_DELETED: "EXPENSE_DELETED",
  EXPENSE_STATUS_CHANGED: "EXPENSE_STATUS_CHANGED",
  EXPENSE_RECURRENCE_CREATED: "EXPENSE_RECURRENCE_CREATED",
  EXPENSE_RECURRENCE_UPDATED: "EXPENSE_RECURRENCE_UPDATED",
  EXPENSE_RECURRENCE_DEACTIVATED: "EXPENSE_RECURRENCE_DEACTIVATED",

  // Bank reconciliation
  TRANSACTION_REFUND_LINK_CREATED: "TRANSACTION_REFUND_LINK_CREATED",
  TRANSACTION_REFUND_LINK_DELETED: "TRANSACTION_REFUND_LINK_DELETED",

  // Cron Jobs
  REMINDER_JOB_EXECUTED: "REMINDER_JOB_EXECUTED",
  RECURRING_EXPENSES_GENERATED: "RECURRING_EXPENSES_GENERATED",
  OVERDUE_EXPENSES_MARKED: "OVERDUE_EXPENSES_MARKED",

  // Prontuário (NEVER include section content in oldValues/newValues)
  CLINICAL_NOTE_CREATED: "CLINICAL_NOTE_CREATED",
  CLINICAL_NOTE_UPDATED: "CLINICAL_NOTE_UPDATED",
  CLINICAL_NOTE_SIGNED: "CLINICAL_NOTE_SIGNED",
  CLINICAL_NOTE_DELETED: "CLINICAL_NOTE_DELETED",
  CLINICAL_NOTE_ADDENDUM_CREATED: "CLINICAL_NOTE_ADDENDUM_CREATED",
  CLINICAL_NOTE_ACCESSED: "CLINICAL_NOTE_ACCESSED", // read of another professional's note
  PATIENT_RECORD_CLOSED: "PATIENT_RECORD_CLOSED",
  PATIENT_RECORD_REOPENED: "PATIENT_RECORD_REOPENED",
  PATIENT_RECORD_DISPOSED: "PATIENT_RECORD_DISPOSED",
  PATIENT_RECORD_EXPORTED: "PATIENT_RECORD_EXPORTED",
  PENDING_NOTES_JOB_EXECUTED: "PENDING_NOTES_JOB_EXECUTED",

  // AI assistant (NEVER include clinical content in oldValues/newValues)
  AI_DRAFT_GENERATED: "AI_DRAFT_GENERATED",
  CLINIC_AI_ENABLED: "CLINIC_AI_ENABLED",
  CLINIC_AI_DISABLED: "CLINIC_AI_DISABLED",

  // Calendar sync (Google / iCal) — never include patient PII in values
  CALENDAR_INTEGRATION_CONNECTED: "calendar_integration.connected",
  CALENDAR_INTEGRATION_DISCONNECTED: "calendar_integration.disconnected",
  CALENDAR_INTEGRATION_UPDATED: "calendar_integration.updated",
  CALENDAR_INTEGRATION_RETRY: "calendar_integration.retry",
  CALENDAR_INTEGRATION_CLEANUP_REQUESTED: "calendar_integration.cleanup_requested",
  CALENDAR_ICS_TOKEN_GENERATED: "calendar_integration.ics_token_generated",
  CALENDAR_ICS_TOKEN_REVOKED: "calendar_integration.ics_token_revoked",
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
