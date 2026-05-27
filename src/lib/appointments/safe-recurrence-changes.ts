/**
 * Safe recurrence type changes that preserve appointments with invoice relationships
 */

import { RecurrenceType } from "@prisma/client"

interface FutureAppointment {
  id: string
  scheduledAt: Date
  endAt: Date
  status: string
}

export interface SafeRecurrenceChanges {
  appointmentsToUpdate: Array<{
    id: string
    newScheduledAt: Date
    newEndAt: Date
  }>
  appointmentsToDelete: string[]
  appointmentsToCreate: Array<{
    scheduledAt: Date
    endAt: Date
  }>
}

/**
 * Computes recurrence type changes that preserve existing appointments when possible.
 * Instead of deleting all non-matching appointments, tries to update them to fit the new pattern.
 */
export function computeSafeRecurrenceTypeChanges(params: {
  appointments: FutureAppointment[]
  newRecurrenceType: RecurrenceType
  linkedAppointmentIds: string[] // Appointments that cannot be deleted due to invoice links
}): SafeRecurrenceChanges {
  const { appointments, newRecurrenceType, linkedAppointmentIds } = params
  const appointmentsToUpdate: Array<{ id: string; newScheduledAt: Date; newEndAt: Date }> = []
  const appointmentsToDelete: string[] = []
  const appointmentsToCreate: Array<{ scheduledAt: Date; endAt: Date }> = []

  if (appointments.length === 0) {
    return { appointmentsToUpdate, appointmentsToDelete, appointmentsToCreate }
  }

  const sorted = [...appointments].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  const anchorApt = sorted[0]
  const lastApt = sorted[sorted.length - 1]

  // Calculate interval based on recurrence type
  const intervalDays = newRecurrenceType === RecurrenceType.WEEKLY ? 7
    : newRecurrenceType === RecurrenceType.BIWEEKLY ? 14
    : 0 // MONTHLY

  // Generate the ideal schedule for the new recurrence type
  const idealDates: Date[] = []

  if (newRecurrenceType === RecurrenceType.MONTHLY) {
    // For monthly, keep appointments on the same day of month
    const anchorDay = anchorApt.scheduledAt.getDate()
    const startYear = anchorApt.scheduledAt.getFullYear()
    const startMonth = anchorApt.scheduledAt.getMonth()
    const endYear = lastApt.scheduledAt.getFullYear()
    const endMonth = lastApt.scheduledAt.getMonth()

    for (let year = startYear; year <= endYear; year++) {
      const monthStart = year === startYear ? startMonth : 0
      const monthEnd = year === endYear ? endMonth : 11

      for (let month = monthStart; month <= monthEnd; month++) {
        const candidate = new Date(year, month, anchorDay)
        candidate.setHours(anchorApt.scheduledAt.getHours())
        candidate.setMinutes(anchorApt.scheduledAt.getMinutes())
        candidate.setSeconds(0, 0)

        if (candidate >= anchorApt.scheduledAt && candidate <= lastApt.scheduledAt) {
          idealDates.push(candidate)
        }
      }
    }
  } else if (intervalDays > 0) {
    // For weekly/biweekly, use fixed intervals
    let current = new Date(anchorApt.scheduledAt)
    const msPerDay = 24 * 60 * 60 * 1000

    while (current <= lastApt.scheduledAt) {
      idealDates.push(new Date(current))
      current = new Date(current.getTime() + intervalDays * msPerDay)
    }
  }

  const duration = anchorApt.endAt.getTime() - anchorApt.scheduledAt.getTime()

  // Create a map of ideal dates for easy lookup
  const idealDateMap = new Map<string, Date>()
  idealDates.forEach(date => {
    const dateStr = date.toISOString().split("T")[0]
    idealDateMap.set(dateStr, date)
  })

  // Track which ideal dates are already covered
  const coveredIdealDates = new Set<string>()

  // Process existing appointments
  sorted.forEach(apt => {
    const currentDateStr = apt.scheduledAt.toISOString().split("T")[0]
    const isLinked = linkedAppointmentIds.includes(apt.id)

    // Check if this appointment's date matches an ideal date
    if (idealDateMap.has(currentDateStr)) {
      // Perfect match - keep as is
      coveredIdealDates.add(currentDateStr)
    } else {
      // Appointment doesn't match new pattern
      if (isLinked) {
        // Can't delete linked appointments - try to find the nearest ideal date to move it to
        let nearestDate: Date | null = null
        let nearestDistance = Infinity

        for (const [dateStr, idealDate] of idealDateMap.entries()) {
          if (!coveredIdealDates.has(dateStr)) {
            const distance = Math.abs(idealDate.getTime() - apt.scheduledAt.getTime())
            if (distance < nearestDistance) {
              nearestDistance = distance
              nearestDate = idealDate
            }
          }
        }

        if (nearestDate) {
          // Move the linked appointment to the nearest available ideal date
          const nearestDateStr = nearestDate.toISOString().split("T")[0]
          appointmentsToUpdate.push({
            id: apt.id,
            newScheduledAt: nearestDate,
            newEndAt: new Date(nearestDate.getTime() + duration)
          })
          coveredIdealDates.add(nearestDateStr)
        } else {
          // No available ideal dates - we'll need to create a new slot or keep the appointment as is
          // For now, keep it as is (this preserves the invoice relationship)
          console.warn(`Cannot reschedule linked appointment ${apt.id} - keeping original date`)
        }
      } else {
        // Not linked to invoice - safe to delete
        appointmentsToDelete.push(apt.id)
      }
    }
  })

  // Create new appointments for uncovered ideal dates
  idealDates.forEach(idealDate => {
    const dateStr = idealDate.toISOString().split("T")[0]
    if (!coveredIdealDates.has(dateStr)) {
      // Only create if the date is in the future
      if (idealDate > new Date()) {
        appointmentsToCreate.push({
          scheduledAt: idealDate,
          endAt: new Date(idealDate.getTime() + duration)
        })
      }
    }
  })

  return { appointmentsToUpdate, appointmentsToDelete, appointmentsToCreate }
}

/**
 * Check if an appointment can be safely deleted (not linked to active invoices)
 */
export async function findSafelyDeletableAppointments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  appointmentIds: string[]
): Promise<{
  safeToDelete: string[]
  linkedToInvoices: string[]
}> {
  if (appointmentIds.length === 0) {
    return { safeToDelete: [], linkedToInvoices: [] }
  }

  const linkedItems = await prisma.invoiceItem.findMany({
    where: {
      appointmentId: { in: appointmentIds },
      invoice: { status: { not: "CANCELADO" } }
    },
    select: { appointmentId: true }
  })

  const linkedToInvoices = linkedItems.map((item: { appointmentId: string }) => item.appointmentId)
  const safeToDelete = appointmentIds.filter(id => !linkedToInvoices.includes(id))

  return { safeToDelete, linkedToInvoices }
}