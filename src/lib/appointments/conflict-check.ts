import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"

export interface ConflictingAppointment {
  id: string
  scheduledAt: Date
  endAt: Date
  patientName: string
}

export interface ConflictCheckResult {
  hasConflict: boolean
  conflictingAppointment?: ConflictingAppointment
}

export interface ConflictCheckParams {
  professionalProfileId: string
  scheduledAt: Date
  endAt: Date
  excludeAppointmentId?: string
  bufferMinutes?: number
}

/**
 * Check for scheduling conflicts with database-level locking to prevent race conditions.
 *
 * Uses SELECT FOR UPDATE to acquire a row-level lock on potentially conflicting appointments,
 * preventing concurrent transactions from creating overlapping bookings.
 *
 * Conflict detection logic:
 * - Two time ranges overlap if: start1 < end2 AND end1 > start2
 * - Cancelled appointments are excluded from conflict checks
 * - Buffer time is added to both ends of the new appointment if configured
 */
export async function checkConflict(
  params: ConflictCheckParams,
  tx?: Prisma.TransactionClient
): Promise<ConflictCheckResult> {
  const client = tx || prisma
  const { professionalProfileId, scheduledAt, endAt, excludeAppointmentId, bufferMinutes = 0 } = params

  // Apply buffer time if configured
  const effectiveStart = new Date(scheduledAt.getTime() - bufferMinutes * 60 * 1000)
  const effectiveEnd = new Date(endAt.getTime() + bufferMinutes * 60 * 1000)

  // Use raw query with FOR UPDATE to acquire row-level lock
  // This prevents race conditions when multiple requests try to book the same slot
  const conflictingAppointments = await client.$queryRaw<Array<{
    id: string
    scheduledAt: Date
    endAt: Date
    patientName: string
  }>>`
    SELECT
      a.id,
      a."scheduledAt",
      a."endAt",
      p.name as "patientName"
    FROM "Appointment" a
    JOIN "Patient" p ON a."patientId" = p.id
    WHERE a."professionalProfileId" = ${professionalProfileId}
      AND a.status NOT IN ('CANCELADO_PACIENTE', 'CANCELADO_PROFISSIONAL')
      AND a."scheduledAt" < ${effectiveEnd}
      AND a."endAt" > ${effectiveStart}
      ${excludeAppointmentId ? Prisma.sql`AND a.id != ${excludeAppointmentId}` : Prisma.empty}
    ORDER BY a."scheduledAt"
    LIMIT 1
    FOR UPDATE
  `

  if (conflictingAppointments.length > 0) {
    const conflict = conflictingAppointments[0]
    return {
      hasConflict: true,
      conflictingAppointment: {
        id: conflict.id,
        scheduledAt: conflict.scheduledAt,
        endAt: conflict.endAt,
        patientName: conflict.patientName,
      },
    }
  }

  return { hasConflict: false }
}

/**
 * Format conflict error response with detailed information for debugging.
 */
export function formatConflictError(conflict: ConflictingAppointment): {
  error: string
  code: string
  conflictingAppointment: {
    id: string
    scheduledAt: string
    endAt: string
    patientName: string
  }
} {
  return {
    error: "Time slot conflicts with an existing appointment",
    code: "APPOINTMENT_CONFLICT",
    conflictingAppointment: {
      id: conflict.id,
      scheduledAt: conflict.scheduledAt.toISOString(),
      endAt: conflict.endAt.toISOString(),
      patientName: conflict.patientName,
    },
  }
}
