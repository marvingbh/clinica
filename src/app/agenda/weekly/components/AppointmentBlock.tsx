"use client"

import { RefreshCwIcon, ArrowLeftRightIcon } from "@/shared/components/ui/icons"
import { Appointment } from "../../lib/types"
import { isBirthdayOnDate } from "../../lib/utils"
import { getProfessionalColor, ProfessionalColorMap, PROFESSIONAL_COLORS } from "../../lib/professional-colors"
import { STATUS_LABELS, ENTRY_TYPE_COLORS } from "../../lib/constants"
import type { AppointmentStatus, CalendarEntryType } from "../../lib/types"

const PIXELS_PER_MINUTE = 1.6 // 48px per 30 minutes = 96px per hour
const START_HOUR = 7

interface AppointmentBlockProps {
  appointment: Appointment
  onClick: (appointment: Appointment) => void
  onAlternateWeekClick?: (appointment: Appointment) => void
  showProfessional?: boolean
  columnIndex?: number
  totalColumns?: number
  professionalColorMap?: ProfessionalColorMap
}

export function AppointmentBlock({
  appointment,
  onClick,
  onAlternateWeekClick,
  showProfessional = false,
  columnIndex = 0,
  totalColumns = 1,
  professionalColorMap,
}: AppointmentBlockProps) {
  const scheduledAt = new Date(appointment.scheduledAt)
  const endAt = new Date(appointment.endAt)

  const hour = scheduledAt.getHours()
  const minutes = scheduledAt.getMinutes()
  const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

  // Calculate position and height
  const top = ((hour - START_HOUR) * 60 + minutes) * PIXELS_PER_MINUTE
  const height = Math.max(durationMinutes * PIXELS_PER_MINUTE, 32) // Min height of 32px for readability

  const isCancelled = ["CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO", "CANCELADO_FALTA"].includes(appointment.status)

  const startTimeStr = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  const endHour = endAt.getHours()
  const endMinutes = endAt.getMinutes()
  const endTimeStr = `${endHour.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`

  // Get professional color from map, fallback to first color
  const profColors = professionalColorMap
    ? getProfessionalColor(appointment.professionalProfile.id, professionalColorMap)
    : PROFESSIONAL_COLORS[0]

  // Entry type colors for single-professional view
  const entryColors = ENTRY_TYPE_COLORS[appointment.type as CalendarEntryType] || ENTRY_TYPE_COLORS.CONSULTA

  // Calculate width and left position for overlapping appointments
  const columnWidth = 100 / totalColumns
  const leftPercent = columnIndex * columnWidth
  const widthPercent = columnWidth

  return (
    <button
      type="button"
      onClick={() => onClick(appointment)}
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPercent}% + 1px)`,
        width: `calc(${widthPercent}% - 2px)`,
      }}
      className={`
        border border-border rounded px-1 py-0.5 text-left
        border-l-[3px] overflow-hidden cursor-pointer
        hover:shadow-md hover:z-10 transition-all
        ${showProfessional ? profColors.bg : entryColors.bg}
        ${showProfessional ? profColors.border : entryColors.borderLeft}
        ${isCancelled ? "opacity-50" : ""}
      `}
    >
      <div className="h-full flex flex-col overflow-hidden gap-0.5 relative">
        {/* Recurrence indicator icon */}
        {appointment.recurrence && (
          <div
            className="absolute top-0 right-0"
            title={
              appointment.recurrence.recurrenceType === "BIWEEKLY" && appointment.alternateWeekInfo
                ? `Quinzenal - Alterna com: ${appointment.alternateWeekInfo.pairedPatientName || "Disponivel"}`
                : appointment.recurrence.recurrenceType === "WEEKLY" ? "Semanal"
                : appointment.recurrence.recurrenceType === "BIWEEKLY" ? "Quinzenal" : "Mensal"
            }
          >
            <RefreshCwIcon className="w-3 h-3 text-blue-500" />
          </div>
        )}
        {showProfessional && (
          <p className={`text-[10px] font-semibold truncate leading-tight ${profColors.text} ${appointment.recurrence ? "pr-3" : ""}`}>
            {appointment.professionalProfile.user.name}
            {(appointment.additionalProfessionals?.length ?? 0) > 0 && (
              <span className="font-normal opacity-70"> +{appointment.additionalProfessionals!.length}</span>
            )}
          </p>
        )}
        <p className={`text-[11px] font-medium text-foreground truncate leading-tight ${appointment.recurrence && !showProfessional ? "pr-3" : ""}`}>
          {appointment.patient?.name || appointment.title || "Sem titulo"}
          {appointment.patient?.birthDate && isBirthdayOnDate(appointment.patient.birthDate, scheduledAt) && (
            <span className="ml-0.5 text-[10px]" title="Aniversario!">🎂</span>
          )}
        </p>
        {isCancelled && (
          <p className="text-[9px] text-red-600 dark:text-red-400 font-medium truncate leading-tight">
            {STATUS_LABELS[appointment.status as AppointmentStatus]}
          </p>
        )}
        {height >= 48 && (
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {startTimeStr} - {endTimeStr}
          </p>
        )}
        {/* Alternate week info for biweekly - show if there's enough height */}
        {height >= 64 && appointment.recurrence?.recurrenceType === "BIWEEKLY" && appointment.alternateWeekInfo && (
          <p
            role="button"
            onClick={(e) => {
              e.stopPropagation()
              onAlternateWeekClick?.(appointment)
            }}
            className="text-[9px] text-purple-600 dark:text-purple-400 truncate leading-tight flex items-center gap-0.5 hover:text-purple-800 dark:hover:text-purple-200 cursor-pointer underline"
          >
            <ArrowLeftRightIcon className="w-2.5 h-2.5 flex-shrink-0" />
            {appointment.alternateWeekInfo.pairedPatientName || (appointment.alternateWeekInfo.isAvailable ? "Disponivel - Agendar" : "Bloqueado")}
          </p>
        )}
      </div>
    </button>
  )
}
