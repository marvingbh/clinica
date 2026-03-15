import { RecurrenceType, AppointmentStatus, AppointmentModality, AppointmentType } from "@prisma/client"
import { calculateDayShiftedDates, calculateBiweeklySwapDates } from "@/lib/appointments/recurrence"
import { checkConflictsBulk } from "@/lib/appointments/conflict-check"

// ============================================================================
// Types
// ============================================================================

interface FutureAppointment {
  id: string
  scheduledAt: Date
  endAt: Date
  status: string
  modality: AppointmentModality | null
}

interface ShiftedAppointment {
  id: string
  oldScheduledAt: Date
  oldEndAt: Date
  newScheduledAt: Date
  newEndAt: Date
}

interface ConflictInfo {
  date: string
  conflictsWith: string | null
}

interface AdditionalProfessional {
  professionalProfileId: string
}

// ============================================================================
// Day-of-Week Shift
// ============================================================================

export async function prepareDayShift(params: {
  appointments: FutureAppointment[]
  newDayOfWeek: number
  newStartTime?: string
  newEndTime?: string
  currentStartTime: string
  currentEndTime: string
  professionalProfileId: string
  additionalProfessionalIds: string[]
}): Promise<{ shifted: ShiftedAppointment[] } | { conflicts: ConflictInfo[] }> {
  const {
    appointments, newDayOfWeek, newStartTime, newEndTime,
    currentStartTime, currentEndTime, professionalProfileId, additionalProfessionalIds,
  } = params

  const effectiveStartTime = newStartTime || currentStartTime
  const effectiveEndTime = newEndTime || currentEndTime
  const isAlsoTimeChange = newStartTime !== undefined || newEndTime !== undefined

  const shiftedDates = appointments.map(apt => {
    const actualDayOfWeek = apt.scheduledAt.getDay()
    let { scheduledAt: newScheduledAt, endAt: newEndAt } = calculateDayShiftedDates(
      apt.scheduledAt, apt.endAt, actualDayOfWeek, newDayOfWeek
    )

    if (isAlsoTimeChange) {
      const [sh, sm] = effectiveStartTime.split(":").map(Number)
      const [eh, em] = effectiveEndTime.split(":").map(Number)
      newScheduledAt = new Date(newScheduledAt)
      newScheduledAt.setHours(sh, sm, 0, 0)
      newEndAt = new Date(newEndAt)
      newEndAt.setHours(eh, em, 0, 0)
    }

    return { apt, newScheduledAt, newEndAt }
  })

  const bulkResult = await checkConflictsBulk({
    professionalProfileId,
    dates: shiftedDates.map(d => ({ scheduledAt: d.newScheduledAt, endAt: d.newEndAt })),
    excludeAppointmentIds: appointments.map(a => a.id),
    additionalProfessionalIds,
  })

  if (bulkResult.conflicts.length > 0) {
    return {
      conflicts: bulkResult.conflicts.map(c => ({
        date: shiftedDates[c.index].newScheduledAt.toLocaleDateString("pt-BR"),
        conflictsWith: c.conflictingAppointment.patientName,
      })),
    }
  }

  return {
    shifted: shiftedDates.map(({ apt, newScheduledAt, newEndAt }) => ({
      id: apt.id,
      oldScheduledAt: apt.scheduledAt,
      oldEndAt: apt.endAt,
      newScheduledAt,
      newEndAt,
    })),
  }
}

// ============================================================================
// Biweekly Week Swap
// ============================================================================

export async function prepareBiweeklySwap(params: {
  appointments: Array<{ id: string; scheduledAt: Date; endAt: Date }>
  professionalProfileId: string
  additionalProfessionalIds: string[]
}): Promise<{ shifted: Array<{ id: string; newScheduledAt: Date; newEndAt: Date }> } | { conflicts: ConflictInfo[] }> {
  const { appointments, professionalProfileId, additionalProfessionalIds } = params

  const swappedDates = calculateBiweeklySwapDates(appointments)

  const bulkResult = await checkConflictsBulk({
    professionalProfileId,
    dates: swappedDates.map(d => ({ scheduledAt: d.newScheduledAt, endAt: d.newEndAt })),
    excludeAppointmentIds: appointments.map(a => a.id),
    additionalProfessionalIds,
  })

  if (bulkResult.conflicts.length > 0) {
    return {
      conflicts: bulkResult.conflicts.map(c => ({
        date: swappedDates[c.index].newScheduledAt.toLocaleDateString("pt-BR"),
        conflictsWith: c.conflictingAppointment.patientName || c.conflictingAppointment.title || "outro compromisso",
      })),
    }
  }

  return { shifted: swappedDates }
}

// ============================================================================
// Recurrence Type Change
// ============================================================================

export function computeRecurrenceTypeChanges(params: {
  appointments: FutureAppointment[]
  newRecurrenceType: RecurrenceType
}): { toDelete: string[]; toCreate: Array<{ scheduledAt: Date; endAt: Date }> } {
  const { appointments, newRecurrenceType } = params
  const toDelete: string[] = []
  const toCreate: Array<{ scheduledAt: Date; endAt: Date }> = []

  if (appointments.length === 0) return { toDelete, toCreate }

  const sorted = [...appointments].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  const anchorApt = sorted[0]
  const lastApt = sorted[sorted.length - 1]

  const intervalDays = newRecurrenceType === RecurrenceType.WEEKLY ? 7
    : newRecurrenceType === RecurrenceType.BIWEEKLY ? 14
    : 0 // MONTHLY

  // Build valid dates under new pattern
  const validDates = new Set<string>()

  if (newRecurrenceType === RecurrenceType.MONTHLY) {
    const anchorDay = anchorApt.scheduledAt.getDate()
    for (const apt of sorted) {
      if (apt.scheduledAt.getDate() === anchorDay) {
        validDates.add(apt.scheduledAt.toISOString().split("T")[0])
      }
    }
  } else {
    const msPerDay = 24 * 60 * 60 * 1000
    let current = new Date(anchorApt.scheduledAt)
    while (current <= lastApt.scheduledAt) {
      validDates.add(current.toISOString().split("T")[0])
      current = new Date(current.getTime() + intervalDays * msPerDay)
    }
  }

  // Find appointments to delete (don't match new pattern)
  for (const apt of sorted) {
    if (!validDates.has(apt.scheduledAt.toISOString().split("T")[0])) {
      toDelete.push(apt.id)
    }
  }

  // Find dates to create (missing from new pattern)
  if (newRecurrenceType !== RecurrenceType.MONTHLY && intervalDays > 0) {
    const msPerDay = 24 * 60 * 60 * 1000
    const duration = anchorApt.endAt.getTime() - anchorApt.scheduledAt.getTime()
    const keptDates = new Set(
      appointments.filter(a => !toDelete.includes(a.id)).map(a => a.scheduledAt.toISOString().split("T")[0])
    )

    const now = new Date()
    let currentTime = anchorApt.scheduledAt.getTime()
    while (currentTime <= lastApt.scheduledAt.getTime()) {
      const candidate = new Date(currentTime)
      const dateStr = candidate.toISOString().split("T")[0]
      if (candidate > now && !keptDates.has(dateStr)) {
        toCreate.push({ scheduledAt: candidate, endAt: new Date(currentTime + duration) })
      }
      currentTime += intervalDays * msPerDay
    }
  }

  return { toDelete, toCreate }
}

export async function checkRecurrenceTypeConflicts(params: {
  appointmentsToCreate: Array<{ scheduledAt: Date; endAt: Date }>
  recurrenceId: string
  professionalProfileId: string
  additionalProfessionalIds: string[]
}): Promise<ConflictInfo[] | null> {
  if (params.appointmentsToCreate.length === 0) return null

  const bulkResult = await checkConflictsBulk({
    professionalProfileId: params.professionalProfileId,
    dates: params.appointmentsToCreate,
    excludeRecurrenceId: params.recurrenceId,
    additionalProfessionalIds: params.additionalProfessionalIds,
  })

  if (bulkResult.conflicts.length > 0) {
    return bulkResult.conflicts.map(c => ({
      date: params.appointmentsToCreate[c.index].scheduledAt.toLocaleDateString("pt-BR"),
      conflictsWith: c.conflictingAppointment.patientName || c.conflictingAppointment.title || "outro compromisso",
    }))
  }

  return null
}
