import { prisma } from "@/lib/prisma"
import {
  computeFreeSlots,
  spToUtc,
  addDaysISO,
  type RuleInput,
  type ExceptionInput,
  type BusyInterval,
  type DaySlots,
} from "@/lib/booking"

const CANCELLED_STATUSES = [
  "CANCELADO_ACORDADO",
  "CANCELADO_FALTA",
  "CANCELADO_PROFISSIONAL",
] as const

export interface ProfessionalSlotConfig {
  professionalProfileId: string
  clinicId: string
  durationMinutes: number
  bufferMinutes: number
  minAdvanceHours: number
  horizonDays: number
}

/**
 * Fetches availability rules, exceptions (own + clinic-wide) and blocking
 * appointments for a professional over [from, from+days), then runs the pure
 * slot engine. Used by both the GET slots route and the POST revalidation so
 * the offered grid and the accepted grid are computed identically.
 */
export async function computeProfessionalSlots(
  config: ProfessionalSlotConfig,
  from: string,
  days: number,
  now: Date
): Promise<DaySlots[]> {
  const { professionalProfileId, clinicId, durationMinutes, bufferMinutes, minAdvanceHours, horizonDays } = config

  // Window bounds in UTC for the appointment query (pad by a day each side to
  // be safe against timezone edges).
  const windowStartUtc = spToUtc(addDaysISO(from, -1), "00:00")
  const windowEndUtc = spToUtc(addDaysISO(from, days + 1), "00:00")

  const [rules, exceptions, appointments] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { professionalProfileId, isActive: true },
      select: { dayOfWeek: true, startTime: true, endTime: true, isActive: true },
    }),
    prisma.availabilityException.findMany({
      where: {
        OR: [{ professionalProfileId }, { clinicId, professionalProfileId: null }],
      },
      select: {
        date: true,
        dayOfWeek: true,
        isRecurring: true,
        isAvailable: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        professionalProfileId,
        blocksTime: true,
        status: { notIn: [...CANCELLED_STATUSES] },
        scheduledAt: { lt: windowEndUtc },
        endAt: { gt: windowStartUtc },
      },
      select: { scheduledAt: true, endAt: true },
    }),
  ])

  const ruleInputs: RuleInput[] = rules.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    isActive: r.isActive,
  }))

  const exceptionInputs: ExceptionInput[] = exceptions.map((e) => ({
    // AvailabilityException.date is a @db.Date — render it as the SP calendar day.
    date: e.date ? e.date.toISOString().slice(0, 10) : null,
    dayOfWeek: e.dayOfWeek,
    isRecurring: e.isRecurring,
    isAvailable: e.isAvailable,
    startTime: e.startTime,
    endTime: e.endTime,
  }))

  const busy: BusyInterval[] = appointments.map((a) => ({ start: a.scheduledAt, end: a.endAt }))

  return computeFreeSlots({
    rules: ruleInputs,
    exceptions: exceptionInputs,
    busy,
    durationMinutes,
    bufferMinutes,
    from,
    days,
    now,
    minAdvanceHours,
    horizonDays,
  })
}
