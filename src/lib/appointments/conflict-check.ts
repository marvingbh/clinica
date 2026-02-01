import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client/client"

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
  /** Exclude appointments with the same groupId (for group sessions) */
  excludeGroupId?: string
  /** @deprecated Buffer is no longer used in conflict checks - it only affects available slots */
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
 * - Back-to-back appointments (e.g., 8:00-8:45 and 8:45-9:30) are allowed
 *
 * Note: Buffer time is NOT applied here - it only affects available slots shown to users.
 * This allows manual scheduling of back-to-back appointments when needed.
 */
export async function checkConflict(
  params: ConflictCheckParams,
  tx?: Prisma.TransactionClient
): Promise<ConflictCheckResult> {
  const client = tx || prisma
  const { professionalProfileId, scheduledAt, endAt, excludeAppointmentId, excludeGroupId } = params

  // Use raw query with FOR UPDATE to acquire row-level lock
  // This prevents race conditions when multiple requests try to book the same slot
  // Note: We check for actual overlaps only (start1 < end2 AND end1 > start2)
  // Back-to-back appointments where end1 = start2 are allowed
  // For group sessions: exclude appointments with the same groupId (they share the same time slot intentionally)
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
      AND a."scheduledAt" < ${endAt}
      AND a."endAt" > ${scheduledAt}
      ${excludeAppointmentId ? Prisma.sql`AND a.id != ${excludeAppointmentId}` : Prisma.empty}
      ${excludeGroupId ? Prisma.sql`AND (a."groupId" IS NULL OR a."groupId" != ${excludeGroupId})` : Prisma.empty}
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
 * Format time for display in Portuguese locale
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

/**
 * Format date for display in Portuguese locale
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
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
  const dateStr = formatDate(conflict.scheduledAt)
  const startTime = formatTime(conflict.scheduledAt)
  const endTime = formatTime(conflict.endAt)

  return {
    error: `Conflito de horário: já existe uma consulta agendada com ${conflict.patientName} em ${dateStr} das ${startTime} às ${endTime}`,
    code: "APPOINTMENT_CONFLICT",
    conflictingAppointment: {
      id: conflict.id,
      scheduledAt: conflict.scheduledAt.toISOString(),
      endAt: conflict.endAt.toISOString(),
      patientName: conflict.patientName,
    },
  }
}
