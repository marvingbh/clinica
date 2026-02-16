import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export interface ConflictingAppointment {
  id: string
  scheduledAt: Date
  endAt: Date
  patientName: string | null
  title: string | null
  type: string
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
 * - Non-blocking entries (LEMBRETE, NOTA) are excluded from conflict checks
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
  // Only blocking entries (blocksTime = true) are considered for conflicts
  const conflictingAppointments = await client.$queryRaw<Array<{
    id: string
    scheduledAt: Date
    endAt: Date
    patientName: string | null
    title: string | null
    type: string
  }>>`
    SELECT
      a.id,
      a."scheduledAt",
      a."endAt",
      p.name as "patientName",
      a.title,
      a.type
    FROM "Appointment" a
    LEFT JOIN "Patient" p ON a."patientId" = p.id
    WHERE a."professionalProfileId" = ${professionalProfileId}
      AND a.status NOT IN ('CANCELADO_PACIENTE', 'CANCELADO_PROFISSIONAL')
      AND a."blocksTime" = true
      AND a."scheduledAt" < ${endAt}
      AND a."endAt" > ${scheduledAt}
      ${excludeAppointmentId ? Prisma.sql`AND a.id != ${excludeAppointmentId}` : Prisma.empty}
      ${excludeGroupId ? Prisma.sql`AND (a."groupId" IS NULL OR a."groupId" != ${excludeGroupId})` : Prisma.empty}
    ORDER BY a."scheduledAt"
    LIMIT 1
    FOR UPDATE OF a
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
        title: conflict.title,
        type: conflict.type,
      },
    }
  }

  return { hasConflict: false }
}

export interface BulkConflictCheckParams {
  professionalProfileId: string
  dates: Array<{ scheduledAt: Date; endAt: Date }>
  excludeAppointmentIds?: string[]
  excludeGroupId?: string
  bufferMinutes?: number
}

export interface BulkConflictResult {
  /** Indices (0-based) of dates that have conflicts */
  conflicts: Array<{
    index: number
    conflictingAppointment: ConflictingAppointment
  }>
}

/**
 * Check scheduling conflicts for multiple date ranges in a single query.
 * Returns which indices have conflicts, stopping at the first conflict found.
 *
 * Uses a VALUES list joined against the Appointment table to find overlaps
 * across all proposed dates in one round-trip.
 */
export async function checkConflictsBulk(
  params: BulkConflictCheckParams,
  tx?: Prisma.TransactionClient
): Promise<BulkConflictResult> {
  const client = tx || prisma
  const { professionalProfileId, dates, excludeAppointmentIds, excludeGroupId } = params

  if (dates.length === 0) {
    return { conflicts: [] }
  }

  // Build VALUES clause for all date ranges
  // We use a parameterized approach: flatten all values into a single array
  const valuesClauses: string[] = []
  const queryParams: unknown[] = [professionalProfileId]
  let paramIndex = 2

  for (let i = 0; i < dates.length; i++) {
    valuesClauses.push(`($${paramIndex}::int, $${paramIndex + 1}::timestamptz, $${paramIndex + 2}::timestamptz)`)
    queryParams.push(i, dates[i].scheduledAt, dates[i].endAt)
    paramIndex += 3
  }

  let excludeClause = ""
  if (excludeAppointmentIds && excludeAppointmentIds.length > 0) {
    const placeholders = excludeAppointmentIds.map((_, i) => `$${paramIndex + i}`).join(", ")
    queryParams.push(...excludeAppointmentIds)
    excludeClause = `AND a.id NOT IN (${placeholders})`
    paramIndex += excludeAppointmentIds.length
  }

  let excludeGroupClause = ""
  if (excludeGroupId) {
    excludeGroupClause = `AND (a."groupId" IS NULL OR a."groupId" != $${paramIndex})`
    queryParams.push(excludeGroupId)
    paramIndex += 1
  }

  const sql = `
    SELECT DISTINCT ON (v.idx) v.idx, a.id, a."scheduledAt", a."endAt", p.name as "patientName", a.title, a.type
    FROM (VALUES ${valuesClauses.join(", ")}) AS v(idx, start_at, end_at)
    JOIN "Appointment" a ON a."professionalProfileId" = $1
      AND a.status NOT IN ('CANCELADO_PACIENTE', 'CANCELADO_PROFISSIONAL')
      AND a."blocksTime" = true
      AND a."scheduledAt" < v.end_at AND a."endAt" > v.start_at
      ${excludeClause}
      ${excludeGroupClause}
    LEFT JOIN "Patient" p ON a."patientId" = p.id
    ORDER BY v.idx, a."scheduledAt"
  `

  const results = await client.$queryRawUnsafe<Array<{
    idx: number
    id: string
    scheduledAt: Date
    endAt: Date
    patientName: string | null
    title: string | null
    type: string
  }>>(sql, ...queryParams)

  return {
    conflicts: results.map(r => ({
      index: r.idx,
      conflictingAppointment: {
        id: r.id,
        scheduledAt: r.scheduledAt,
        endAt: r.endAt,
        patientName: r.patientName,
        title: r.title,
        type: r.type,
      },
    })),
  }
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
    patientName: string | null
    title: string | null
    type: string
  }
} {
  const dateStr = formatDate(conflict.scheduledAt)
  const startTime = formatTime(conflict.scheduledAt)
  const endTime = formatTime(conflict.endAt)

  // Use title as display name for non-patient entries, patientName for CONSULTA
  const displayName = conflict.patientName || conflict.title || "outro compromisso"

  return {
    error: `Conflito de horário: já existe um compromisso agendado com ${displayName} em ${dateStr} das ${startTime} às ${endTime}`,
    code: "APPOINTMENT_CONFLICT",
    conflictingAppointment: {
      id: conflict.id,
      scheduledAt: conflict.scheduledAt.toISOString(),
      endAt: conflict.endAt.toISOString(),
      patientName: conflict.patientName,
      title: conflict.title,
      type: conflict.type,
    },
  }
}
