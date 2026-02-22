import { useMemo } from "react"
import { toDateString } from "../lib/utils"
import { computeSlotsForDay, type FullDayBlock } from "../lib/computeAvailableSlots"
import type { Appointment, AvailabilityRule, AvailabilityException, TimeSlot, BiweeklyHint, AppointmentStatus, GroupSession } from "../lib/types"

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

export interface UseTimeSlotsParams {
  selectedDate: Date
  availabilityRules: AvailabilityRule[]
  availabilityExceptions: AvailabilityException[]
  appointments: Appointment[]
  groupSessions?: GroupSession[]
  biweeklyHints?: BiweeklyHint[]
  appointmentDuration: number
  isAdmin: boolean
  selectedProfessionalId: string
}

export type { FullDayBlock }

export interface UseTimeSlotsResult {
  slots: TimeSlot[]
  fullDayBlock: FullDayBlock | null
}

export function useTimeSlots({
  selectedDate,
  availabilityRules,
  availabilityExceptions,
  appointments,
  groupSessions,
  biweeklyHints,
  appointmentDuration,
  isAdmin,
  selectedProfessionalId,
}: UseTimeSlotsParams): UseTimeSlotsResult {
  return useMemo(() => {
    const dateStr = toDateString(selectedDate)
    const gsRanges = buildGroupSessionRanges(groupSessions || [])

    // When viewing all professionals (admin with no specific professional selected),
    // show a simplified grid of hours (7am-9pm) with appointments
    // Appointments are assigned to the 30-min slot window they fall within
    // (e.g., 8:45 goes into the 8:30 slot so overlapping professionals share a slot)
    if (isAdmin && !selectedProfessionalId) {
      const slots: TimeSlot[] = []
      for (let hour = 7; hour < 21; hour++) {
        for (const min of [0, 30]) {
          const slotStart = hour * 60 + min
          const slotEnd = slotStart + 30
          const timeStr = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`
          const slotAppointments = appointments.filter((apt) => {
            const aptTime = new Date(apt.scheduledAt)
            const aptDateStr = toDateString(aptTime)
            if (aptDateStr !== dateStr) return false
            const aptMinutes = aptTime.getHours() * 60 + aptTime.getMinutes()
            return aptMinutes >= slotStart && aptMinutes < slotEnd
          })
          // Only time-blocking, non-cancelled appointments affect slot availability
          const blockingAppointments = slotAppointments.filter(isBlockingAppointment)
          const occupiedByGroup = isSlotOccupiedByGroupSession(gsRanges, slotStart)
          slots.push({
            time: timeStr,
            isAvailable: blockingAppointments.length === 0 && !occupiedByGroup,
            appointments: slotAppointments,
            isBlocked: false,
          })
        }
      }
      return { slots, fullDayBlock: null }
    }

    // Single professional view - delegate to pure function
    return computeSlotsForDay({
      date: selectedDate,
      availabilityRules,
      availabilityExceptions,
      appointments,
      groupSessions,
      biweeklyHints,
      appointmentDuration,
      selectedProfessionalId,
    })
  }, [selectedDate, availabilityRules, availabilityExceptions, appointments, groupSessions, biweeklyHints, appointmentDuration, isAdmin, selectedProfessionalId])
}
