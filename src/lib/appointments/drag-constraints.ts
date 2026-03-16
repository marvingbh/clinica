import type { Appointment } from "@/app/agenda/lib/types"

type DragCandidate = Pick<Appointment, "status" | "groupId" | "sessionGroupId">

const DRAGGABLE_STATUSES = new Set(["AGENDADO", "CONFIRMADO"])

/** Whether an appointment can be dragged to reschedule */
export function isDraggable(
  appointment: DragCandidate,
  canWriteAgenda: boolean
): boolean {
  if (!canWriteAgenda) return false
  if (!DRAGGABLE_STATUSES.has(appointment.status)) return false
  if (appointment.groupId || appointment.sessionGroupId) return false
  return true
}

/**
 * Calculate new scheduledAt/endAt preserving the original duration.
 * Returns ISO strings ready for the PATCH endpoint.
 */
export function computeNewTimeRange(
  original: { scheduledAt: string; endAt: string },
  target: { hours: number; minutes: number; date?: string }
): { scheduledAt: string; endAt: string } {
  const originalStart = new Date(original.scheduledAt)
  const originalEnd = new Date(original.endAt)
  const durationMs = originalEnd.getTime() - originalStart.getTime()

  const newStart = new Date(originalStart)
  if (target.date) {
    const [year, month, day] = target.date.split("-").map(Number)
    newStart.setFullYear(year, month - 1, day)
  }
  newStart.setHours(target.hours, target.minutes, 0, 0)

  const newEnd = new Date(newStart.getTime() + durationMs)

  return {
    scheduledAt: newStart.toISOString(),
    endAt: newEnd.toISOString(),
  }
}
