import { useMemo } from "react"
import { computeSlotsForDay } from "../../lib/computeAvailableSlots"
import { getWeekDays, toDateString } from "../../lib/utils"
import type { Appointment, AvailabilityRule, AvailabilityException, TimeSlot, BiweeklyHint, GroupSession } from "../../lib/types"

export interface UseWeeklyAvailabilityParams {
  weekStart: Date
  availabilityRules: AvailabilityRule[]
  availabilityExceptions: AvailabilityException[]
  appointments: Appointment[]
  groupSessions: GroupSession[]
  biweeklyHints: BiweeklyHint[]
  appointmentDuration: number
  selectedProfessionalId: string
}

/**
 * Computes available time slots for each day of the week.
 * Only returns data when a specific professional is selected.
 * Returns a Map<dateString, TimeSlot[]> keyed by YYYY-MM-DD date strings.
 */
export function useWeeklyAvailability({
  weekStart,
  availabilityRules,
  availabilityExceptions,
  appointments,
  groupSessions,
  biweeklyHints,
  appointmentDuration,
  selectedProfessionalId,
}: UseWeeklyAvailabilityParams): Map<string, TimeSlot[]> {
  return useMemo(() => {
    const slotsByDay = new Map<string, TimeSlot[]>()

    // Only compute when a specific professional is selected
    if (!selectedProfessionalId) return slotsByDay

    const weekDays = getWeekDays(weekStart)

    for (const day of weekDays) {
      const dateStr = toDateString(day)

      // Filter appointments for this day
      const dayAppointments = appointments.filter(apt => {
        const aptDate = toDateString(new Date(apt.scheduledAt))
        return aptDate === dateStr
      })

      // Filter group sessions for this day
      const dayGroupSessions = groupSessions.filter(gs => {
        const gsDate = toDateString(new Date(gs.scheduledAt))
        return gsDate === dateStr
      })

      // Filter biweekly hints for this day
      const dayHints = biweeklyHints.filter(h => h.date === dateStr)

      const result = computeSlotsForDay({
        date: day,
        availabilityRules,
        availabilityExceptions,
        appointments: dayAppointments,
        groupSessions: dayGroupSessions,
        biweeklyHints: dayHints,
        appointmentDuration,
        selectedProfessionalId,
      })

      // Only keep available (empty) slots and biweekly hint slots
      const availableSlots = result.slots.filter(
        slot => (slot.isAvailable && slot.appointments.length === 0) || slot.biweeklyHint
      )

      if (availableSlots.length > 0) {
        slotsByDay.set(dateStr, availableSlots)
      }
    }

    return slotsByDay
  }, [weekStart, availabilityRules, availabilityExceptions, appointments, groupSessions, biweeklyHints, appointmentDuration, selectedProfessionalId])
}
