"use client"

import { RefreshCwIcon } from "@/shared/components/ui/icons"
import type { Appointment } from "../lib/types"
import { STATUS_LABELS } from "../lib/constants"
import type { AppointmentStatus } from "../lib/types"
import { formatTimeFromMinutes } from "../lib/grid-geometry"

interface DragGhostCardProps {
  appointment: Appointment
  projectedMinutes: number | null
}

export function DragGhostCard({ appointment, projectedMinutes }: DragGhostCardProps) {
  const scheduledAt = new Date(appointment.scheduledAt)
  const endAt = new Date(appointment.endAt)
  const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

  const displayName = appointment.patient?.name || appointment.title || "Agendamento"
  const timeStr = projectedMinutes != null
    ? formatTimeFromMinutes(projectedMinutes)
    : formatTimeFromMinutes(scheduledAt.getHours() * 60 + scheduledAt.getMinutes())

  const endMinutes = projectedMinutes != null
    ? projectedMinutes + durationMinutes
    : endAt.getHours() * 60 + endAt.getMinutes()
  const endTimeStr = formatTimeFromMinutes(endMinutes)

  return (
    <div
      className="w-[140px] bg-card border border-border border-l-[3px] border-l-primary rounded shadow-lg ring-2 ring-primary/20 pointer-events-none opacity-90 overflow-hidden"
      style={{ minHeight: "36px" }}
    >
      {/* Time badge */}
      <div className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 text-center">
        {timeStr} – {endTimeStr}
      </div>

      {/* Content */}
      <div className="px-2 py-1 space-y-0.5">
        <p className="text-[11px] font-medium text-foreground truncate">
          {displayName}
        </p>
        <p className="text-[9px] text-muted-foreground">
          {STATUS_LABELS[appointment.status as AppointmentStatus]} · {durationMinutes}min
        </p>
        {appointment.recurrence && (
          <div className="flex items-center gap-0.5 text-[9px] text-blue-600">
            <RefreshCwIcon className="w-2.5 h-2.5" />
            {appointment.recurrence.recurrenceType === "WEEKLY" ? "Semanal" :
             appointment.recurrence.recurrenceType === "BIWEEKLY" ? "Quinzenal" : "Mensal"}
          </div>
        )}
      </div>
    </div>
  )
}
