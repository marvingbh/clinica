import { useMemo } from "react"
import { toDateString } from "../lib/utils"
import type { Appointment, AvailabilityRule, AvailabilityException, TimeSlot, AppointmentStatus } from "../lib/types"

// Cancelled statuses - these appointments don't block the slot
const CANCELLED_STATUSES: AppointmentStatus[] = [
  "CANCELADO_PACIENTE",
  "CANCELADO_PROFISSIONAL",
]

function isActivAppointment(apt: Appointment): boolean {
  return !CANCELLED_STATUSES.includes(apt.status)
}

/** Only time-blocking, non-cancelled appointments affect slot availability */
function isBlockingAppointment(apt: Appointment): boolean {
  return apt.blocksTime && !CANCELLED_STATUSES.includes(apt.status)
}

export interface UseTimeSlotsParams {
  selectedDate: Date
  availabilityRules: AvailabilityRule[]
  availabilityExceptions: AvailabilityException[]
  appointments: Appointment[]
  appointmentDuration: number
  isAdmin: boolean
  selectedProfessionalId: string
}

export interface FullDayBlock {
  reason: string | null
  isClinicWide: boolean
}

export interface UseTimeSlotsResult {
  slots: TimeSlot[]
  fullDayBlock: FullDayBlock | null
}

export function useTimeSlots({
  selectedDate,
  availabilityRules,
  availabilityExceptions,
  appointments,
  appointmentDuration,
  isAdmin,
  selectedProfessionalId,
}: UseTimeSlotsParams): UseTimeSlotsResult {
  return useMemo(() => {
    const dateStr = toDateString(selectedDate)

    // When viewing all professionals (admin with no specific professional selected),
    // show a simplified grid of hours (7am-9pm) with appointments
    if (isAdmin && !selectedProfessionalId) {
      const slots: TimeSlot[] = []
      for (let hour = 7; hour < 21; hour++) {
        for (const min of [0, 30]) {
          const timeStr = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`
          const slotAppointments = appointments.filter((apt) => {
            const aptTime = new Date(apt.scheduledAt)
            const aptDateStr = toDateString(aptTime)
            return aptDateStr === dateStr && aptTime.getHours() === hour && aptTime.getMinutes() === min
          })
          // Only time-blocking, non-cancelled appointments affect slot availability
          const blockingAppointments = slotAppointments.filter(isBlockingAppointment)
          slots.push({
            time: timeStr,
            isAvailable: blockingAppointments.length === 0,
            appointments: slotAppointments,
            isBlocked: false,
          })
        }
      }
      return { slots, fullDayBlock: null }
    }

    // Single professional view - use availability rules
    const dayOfWeek = selectedDate.getDay()

    const dayRules = availabilityRules.filter(
      (rule) => rule.dayOfWeek === dayOfWeek && rule.isActive
    )

    // Check for full day block exceptions (specific date or recurring)
    const fullDayException = availabilityExceptions.find((ex) => {
      if (ex.isAvailable || ex.startTime) return false

      if (ex.isRecurring) {
        return ex.dayOfWeek === dayOfWeek
      } else {
        // Extract date part from ISO string to avoid timezone issues
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
    // This ensures appointments are still displayed even without configured availability
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

          // Check if time falls within exception range
          const inTimeRange = timeStr >= ex.startTime && timeStr < ex.endTime

          if (ex.isRecurring) {
            return ex.dayOfWeek === dayOfWeek && inTimeRange
          } else {
            // Extract date part from ISO string to avoid timezone issues
            const exDateStr = ex.date ? ex.date.split("T")[0] : null
            return exDateStr === dateStr && inTimeRange
          }
        })

        const slotAppointments = appointments.filter((apt) => {
          const aptTime = new Date(apt.scheduledAt)
          const aptDateStr = toDateString(aptTime)
          return aptDateStr === dateStr && aptTime.getHours() === hour && aptTime.getMinutes() === min
        })
        // Only time-blocking, non-cancelled appointments affect slot availability
        const blockingAppointments = slotAppointments.filter(isBlockingAppointment)

        slots.push({
          time: timeStr,
          isAvailable: !exception && blockingAppointments.length === 0,
          appointments: slotAppointments,
          isBlocked: !!exception,
          blockReason: exception?.reason || undefined,
        })

        currentMinutes += slotDuration
      }
    }

    // Also add slots for any appointments that don't match generated slot times
    // This ensures appointments are always visible even if they were booked at non-standard times
    const existingSlotTimes = new Set(slots.map(s => s.time))
    for (const apt of appointments) {
      const aptTime = new Date(apt.scheduledAt)
      const aptDateStr = toDateString(aptTime)
      if (aptDateStr !== dateStr) continue

      const hour = aptTime.getHours()
      const min = aptTime.getMinutes()
      const timeStr = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`

      if (!existingSlotTimes.has(timeStr)) {
        // Check if this time has an exception (specific date or recurring)
        const exception = availabilityExceptions.find((ex) => {
          if (ex.isAvailable) return false
          if (!ex.startTime || !ex.endTime) return false

          const inTimeRange = timeStr >= ex.startTime && timeStr < ex.endTime

          if (ex.isRecurring) {
            return ex.dayOfWeek === dayOfWeek && inTimeRange
          } else {
            // Extract date part from ISO string to avoid timezone issues
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

    return { slots, fullDayBlock: null }
  }, [selectedDate, availabilityRules, availabilityExceptions, appointments, appointmentDuration, isAdmin, selectedProfessionalId])
}
