import { useCallback } from "react"
import type { Appointment } from "../lib/types"
import { fetchAppointmentById } from "../services/appointmentService"

export interface UseBiweeklyHandlersReturn {
  handleAlternateWeekClick: (appointment: Appointment) => Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenCreateSheetFn = (time?: string, opts?: any) => void

export function useBiweeklyHandlers(
  openCreateSheet: OpenCreateSheetFn,
  openEditSheet: (appointment: Appointment) => void,
): UseBiweeklyHandlersReturn {
  const handleAlternateWeekClick = useCallback(async (appointment: Appointment) => {
    const scheduledAt = new Date(appointment.scheduledAt)
    const startTime = `${scheduledAt.getHours().toString().padStart(2, "0")}:${scheduledAt.getMinutes().toString().padStart(2, "0")}`

    if (appointment.alternateWeekInfo?.isAvailable) {
      const alternateDate = new Date(scheduledAt)
      alternateDate.setDate(alternateDate.getDate() + 7)
      openCreateSheet(startTime, { date: alternateDate, appointmentType: "BIWEEKLY" })
    } else if (appointment.alternateWeekInfo?.pairedAppointmentId) {
      const paired = await fetchAppointmentById(appointment.alternateWeekInfo.pairedAppointmentId)
      if (paired) openEditSheet(paired)
    }
  }, [openCreateSheet, openEditSheet])

  return { handleAlternateWeekClick }
}
