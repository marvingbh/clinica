import { toDateString } from "./utils"
import type { Appointment, AvailabilityRule, AvailabilityException, TimeSlot, BiweeklyHint, AppointmentStatus, GroupSession } from "./types"

// Cancelled statuses - these appointments don't block the slot
const CANCELLED_STATUSES: AppointmentStatus[] = [
  "CANCELADO_ACORDADO",
  "CANCELADO_FALTA",
  "CANCELADO_PROFISSIONAL",
]

/** Only time-blocking, non-cancelled appointments affect slot availability */
function isBlockingAppointment(apt: Appointment): boolean {
  return apt.blocksTime && !CANCELLED_STATUSES.includes(apt.status)
}

/** Build group session time ranges for fast overlap checking */
function buildGroupSessionRanges(groupSessions: GroupSession[]): Array<{ startMin: number; endMin: number }> {
  return groupSessions.map((session) => {
    const start = new Date(session.scheduledAt)
    const end = new Date(session.endAt)
    return {
      startMin: start.getHours() * 60 + start.getMinutes(),
      endMin: end.getHours() * 60 + end.getMinutes(),
    }
  })
}

/** Check if a slot time falls within any ongoing group session (started before, not yet ended) */
function isSlotOccupiedByGroupSession(
  ranges: Array<{ startMin: number; endMin: number }>,
  slotMinutes: number,
): boolean {
  return ranges.some((r) => r.startMin < slotMinutes && r.endMin > slotMinutes)
}

export interface FullDayBlock {
  reason: string | null
  isClinicWide: boolean
}

export interface ComputeSlotsParams {
  date: Date
  availabilityRules: AvailabilityRule[]
  availabilityExceptions: AvailabilityException[]
  appointments: Appointment[]
  groupSessions?: GroupSession[]
  biweeklyHints?: BiweeklyHint[]
  appointmentDuration: number
  selectedProfessionalId: string
}

export interface ComputeSlotsResult {
  slots: TimeSlot[]
  fullDayBlock: FullDayBlock | null
}

/**
 * Pure function that computes available time slots for a single day
 * given availability rules, exceptions, existing appointments, and group sessions.
 */
export function computeSlotsForDay({
  date,
  availabilityRules,
  availabilityExceptions,
  appointments,
  groupSessions,
  biweeklyHints,
  appointmentDuration,
  selectedProfessionalId,
}: ComputeSlotsParams): ComputeSlotsResult {
  const dateStr = toDateString(date)
  const gsRanges = buildGroupSessionRanges(groupSessions || [])

  // Single professional view - use availability rules
  const dayOfWeek = date.getDay()

  const dayRules = availabilityRules.filter(
    (rule) => rule.dayOfWeek === dayOfWeek && rule.isActive
  )

  // Check for full day block exceptions (specific date or recurring)
  const fullDayException = availabilityExceptions.find((ex) => {
    if (ex.isAvailable || ex.startTime) return false

    if (ex.isRecurring) {
      return ex.dayOfWeek === dayOfWeek
    } else {
      const exDateStr = ex.date ? ex.date.split("T")[0] : null
      return exDateStr === dateStr
    }
  })

  // If there's a full day block exception, return block info
  if (fullDayException) {
    return {
      slots: [],
      fullDayBlock: {
        reason: fullDayException.reason,
        isClinicWide: fullDayException.isClinicWide,
      },
    }
  }

  // If no availability rules but there are appointments, generate slots based on appointments
  if (dayRules.length === 0) {
    if (appointments.length === 0) {
      return { slots: [], fullDayBlock: null }
    }

    // Generate slots for hours that have appointments
    const appointmentHours = new Set<string>()
    for (const apt of appointments) {
      const aptTime = new Date(apt.scheduledAt)
      if (toDateString(aptTime) === dateStr) {
        const hour = aptTime.getHours()
        const min = aptTime.getMinutes()
        appointmentHours.add(`${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`)
      }
    }

    const slots: TimeSlot[] = []
    for (const timeStr of Array.from(appointmentHours).sort()) {
      const [hour, min] = timeStr.split(":").map(Number)
      const slotAppointments = appointments.filter((apt) => {
        const aptTime = new Date(apt.scheduledAt)
        const aptDateStr = toDateString(aptTime)
        return aptDateStr === dateStr && aptTime.getHours() === hour && aptTime.getMinutes() === min
      })
      slots.push({
        time: timeStr,
        isAvailable: false,
        appointments: slotAppointments,
        isBlocked: false,
      })
    }
    return { slots, fullDayBlock: null }
  }

  const slots: TimeSlot[] = []
  const slotDuration = appointmentDuration

  for (const rule of dayRules) {
    const [startHour, startMin] = rule.startTime.split(":").map(Number)
    const [endHour, endMin] = rule.endTime.split(":").map(Number)

    let currentMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    while (currentMinutes + slotDuration <= endMinutes) {
      const hour = Math.floor(currentMinutes / 60)
      const min = currentMinutes % 60
      const timeStr = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`

      const exception = availabilityExceptions.find((ex) => {
        if (ex.isAvailable) return false
        if (!ex.startTime || !ex.endTime) return false

        const inTimeRange = timeStr >= ex.startTime && timeStr < ex.endTime

        if (ex.isRecurring) {
          return ex.dayOfWeek === dayOfWeek && inTimeRange
        } else {
          const exDateStr = ex.date ? ex.date.split("T")[0] : null
          return exDateStr === dateStr && inTimeRange
        }
      })

      const slotAppointments = appointments.filter((apt) => {
        const aptTime = new Date(apt.scheduledAt)
        const aptDateStr = toDateString(aptTime)
        return aptDateStr === dateStr && aptTime.getHours() === hour && aptTime.getMinutes() === min
      })
      const blockingAppointments = slotAppointments.filter(isBlockingAppointment)
      const occupiedByGroup = isSlotOccupiedByGroupSession(gsRanges, currentMinutes)

      slots.push({
        time: timeStr,
        isAvailable: !exception && blockingAppointments.length === 0 && !occupiedByGroup,
        appointments: slotAppointments,
        isBlocked: !!exception,
        blockReason: exception?.reason || undefined,
      })

      currentMinutes += slotDuration
    }
  }

  // Also add slots for any appointments that don't match generated slot times
  const existingSlotTimes = new Set(slots.map(s => s.time))
  for (const apt of appointments) {
    const aptTime = new Date(apt.scheduledAt)
    const aptDateStr = toDateString(aptTime)
    if (aptDateStr !== dateStr) continue

    const hour = aptTime.getHours()
    const min = aptTime.getMinutes()
    const timeStr = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`

    if (!existingSlotTimes.has(timeStr)) {
      const exception = availabilityExceptions.find((ex) => {
        if (ex.isAvailable) return false
        if (!ex.startTime || !ex.endTime) return false

        const inTimeRange = timeStr >= ex.startTime && timeStr < ex.endTime

        if (ex.isRecurring) {
          return ex.dayOfWeek === dayOfWeek && inTimeRange
        } else {
          const exDateStr = ex.date ? ex.date.split("T")[0] : null
          return exDateStr === dateStr && inTimeRange
        }
      })

      const slotAppointments = appointments.filter((a) => {
        const aTime = new Date(a.scheduledAt)
        const aDateStr = toDateString(aTime)
        return aDateStr === dateStr && aTime.getHours() === hour && aTime.getMinutes() === min
      })

      slots.push({
        time: timeStr,
        isAvailable: false,
        appointments: slotAppointments,
        isBlocked: !!exception,
        blockReason: exception?.reason || undefined,
      })
      existingSlotTimes.add(timeStr)
    }
  }

  slots.sort((a, b) => a.time.localeCompare(b.time))

  // Attach biweekly hints to available empty slots
  if (biweeklyHints && biweeklyHints.length > 0) {
    for (const slot of slots) {
      if (slot.isAvailable && slot.appointments.length === 0) {
        const hint = biweeklyHints.find(h =>
          h.time === slot.time &&
          (!selectedProfessionalId || h.professionalProfileId === selectedProfessionalId)
        )
        if (hint) {
          slot.biweeklyHint = hint
        }
      }
    }
  }

  return { slots, fullDayBlock: null }
}
