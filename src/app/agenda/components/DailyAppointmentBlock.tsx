"use client"

import { memo, useMemo } from "react"
import { useDraggable } from "@dnd-kit/core"
import { RefreshCwIcon, PhoneIcon, VideoIcon, BuildingIcon } from "@/shared/components/ui/icons"
import type { Appointment, AppointmentStatus } from "../lib/types"
import { STATUS_LABELS, STATUS_COLORS, STATUS_BORDER_COLORS, CANCELLED_STATUSES, ENTRY_TYPE_LABELS } from "../lib/constants"
import { formatPhone, isBirthdayToday, isRecurrenceModified } from "../lib/utils"
import { getProfessionalColor, ProfessionalColorMap, PROFESSIONAL_COLORS } from "../lib/professional-colors"
import { DAILY_GRID_BASE } from "../lib/grid-config"
import { isDraggable } from "@/lib/appointments/drag-constraints"

const { pixelsPerMinute: PIXELS_PER_MINUTE } = DAILY_GRID_BASE
const SLOT_LEFT_MARGIN = 12
const BLOCK_VERTICAL_GAP = 3

interface LayoutResult {
  columnIndex: number
  totalColumns: number
}

export interface DailyAppointmentBlockProps {
  appointment: Appointment
  layout: LayoutResult
  startHour: number
  showProfessional: boolean
  professionalColorMap?: ProfessionalColorMap
  onClick: (appointment: Appointment) => void
  canWriteAgenda?: boolean
  /** Override the auto-computed horizontal positioning (used by split slot/cancelled pairs). */
  horizontalStyle?: { left: string; width: string }
}

export const DailyAppointmentBlock = memo(function DailyAppointmentBlock({
  appointment,
  layout,
  startHour,
  showProfessional,
  professionalColorMap,
  onClick,
  canWriteAgenda = false,
  horizontalStyle,
}: DailyAppointmentBlockProps) {
  const canDrag = isDraggable(appointment, canWriteAgenda)
  const draggableData = useMemo(() => ({ appointment }), [appointment])
  const { attributes, listeners, setNodeRef, isDragging: isDraggingThis } = useDraggable({
    id: appointment.id,
    data: draggableData,
    disabled: !canDrag,
  })
  const scheduledAt = new Date(appointment.scheduledAt)
  const endAt = new Date(appointment.endAt)
  const hour = scheduledAt.getHours()
  const minutes = scheduledAt.getMinutes()
  const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

  const startTimeStr = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  const endTimeStr = `${endAt.getHours().toString().padStart(2, "0")}:${endAt.getMinutes().toString().padStart(2, "0")}`

  const rawTop = ((hour - startHour) * 60 + minutes) * PIXELS_PER_MINUTE
  const rawHeight = Math.max(durationMinutes * PIXELS_PER_MINUTE, 96)
  const top = rawTop + BLOCK_VERTICAL_GAP
  const height = rawHeight - BLOCK_VERTICAL_GAP * 2
  const isCompact = height < 72
  const isTall = height >= 110

  const isCancelled = CANCELLED_STATUSES.includes(appointment.status)
  const isFinalized = appointment.status === "FINALIZADO"

  const profColors = professionalColorMap
    ? getProfessionalColor(appointment.professionalProfile.id, professionalColorMap)
    : PROFESSIONAL_COLORS[0]

  const bgClass = showProfessional ? profColors.bg : "bg-card"
  const borderClass = showProfessional
    ? profColors.border
    : STATUS_BORDER_COLORS[appointment.status as AppointmentStatus] || "border-l-primary"

  const columnWidth = 100 / layout.totalColumns
  const leftPercent = layout.columnIndex * columnWidth

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-appointment-id={appointment.id}
      onClick={(e) => {
        e.stopPropagation()
        onClick(appointment)
      }}
      {...attributes}
      {...listeners}
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: horizontalStyle?.left ?? `calc(${leftPercent}% + ${SLOT_LEFT_MARGIN}px + 2px)`,
        width: horizontalStyle?.width ?? `calc(${columnWidth}% - ${SLOT_LEFT_MARGIN}px - 4px)`,
        maxWidth: horizontalStyle ? undefined : (layout.totalColumns === 1 ? "400px" : undefined),
        opacity: isDraggingThis ? 0.3 : undefined,
      }}
      className={`
        group rounded-xl text-left overflow-hidden
        border border-border border-l-[3px] shadow-sm
        hover:shadow-md hover:z-30 active:scale-[0.98] transition-all
        ${canDrag ? "cursor-grab" : "cursor-pointer"}
        ${isDraggingThis ? "border-dashed" : ""}
        border-t-[3px] ${showProfessional ? profColors.accent.replace("bg-", "border-t-") : getStatusBorderTop(appointment.status as AppointmentStatus)}
        ${bgClass} ${borderClass}
        ${isCancelled ? "opacity-40" : isFinalized ? "opacity-50" : ""}
      `}
    >
      <div className={`flex flex-col overflow-hidden h-full ${isCompact ? "px-2 py-1 gap-0" : "px-3 py-2 gap-0.5"}`}>
        {/* Professional name */}
        {showProfessional && (
          <p className={`text-xs font-semibold truncate ${profColors.text}`}>
            {appointment.professionalProfile.user.name}
            {(appointment.additionalProfessionals?.length ?? 0) > 0 && (
              <span className="font-normal opacity-70"> +{appointment.additionalProfessionals!.length}</span>
            )}
          </p>
        )}

        {/* Header row: patient name + status badge */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            {appointment.type !== "CONSULTA" ? (
              <>
                <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {appointment.title || ENTRY_TYPE_LABELS[appointment.type] || "Sem titulo"}
                  {isCompact && appointment.recurrence && (
                    <RecurrenceIcon appointment={appointment} />
                  )}
                </h4>
                {appointment.patient && (
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="text-green-600 font-semibold">$</span> {appointment.patient.name}
                  </p>
                )}
              </>
            ) : (
              <>
                <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {appointment.patient?.name || appointment.title || "Sem titulo"}
                  {appointment.patient?.birthDate && isBirthdayToday(appointment.patient.birthDate) && (
                    <span className="ml-1 text-xs" title="Aniversario hoje!">🎂</span>
                  )}
                  {isCompact && appointment.recurrence && (
                    <RecurrenceIcon appointment={appointment} />
                  )}
                </h4>
                {appointment.patient?.motherName && (
                  <p className="text-xs text-muted-foreground truncate">
                    Mãe: {appointment.patient.motherName}
                  </p>
                )}
              </>
            )}
            {!isCompact && appointment.patient?.phone && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <PhoneIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">
                  {formatPhone(appointment.patient.phone)}
                </p>
              </div>
            )}
          </div>
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-tight ${
            STATUS_COLORS[appointment.status as AppointmentStatus] || "bg-gray-100 text-gray-800"
          }`}>
            {STATUS_LABELS[appointment.status as AppointmentStatus] || appointment.status}
          </span>
        </div>

        {/* Notes */}
        {isTall && appointment.notes && (
          <p className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-1 rounded-md line-clamp-2 mt-0.5">
            {appointment.notes.length > 60 ? `${appointment.notes.slice(0, 60)}...` : appointment.notes}
          </p>
        )}

        {/* Meta info row: time + modality + recurrence */}
        {!isCompact && (
          <div className="flex items-center gap-2 mt-auto pt-1">
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {startTimeStr} - {endTimeStr}
            </span>
            {appointment.modality && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                appointment.modality === "ONLINE"
                  ? "bg-info/10 text-info"
                  : "bg-muted text-muted-foreground"
              }`}>
                {appointment.modality === "ONLINE" ? (
                  <VideoIcon className="w-3 h-3" />
                ) : (
                  <BuildingIcon className="w-3 h-3" />
                )}
                {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
              </span>
            )}
            {appointment.recurrence && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                isRecurrenceModified(appointment)
                  ? "text-amber-600"
                  : "text-blue-600"
              }`}>
                <RefreshCwIcon className="w-3 h-3" />
                {appointment.recurrence.recurrenceType === "WEEKLY" ? "Semanal" :
                 appointment.recurrence.recurrenceType === "BIWEEKLY" ? "Quinzenal" : "Mensal"}
                {isRecurrenceModified(appointment) && " · alterado"}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
})

function RecurrenceIcon({ appointment }: { appointment: Appointment }) {
  return (
    <span title={isRecurrenceModified(appointment) ? "Recorrência alterada neste dia" : "Recorrente"}>
      <RefreshCwIcon className={`inline w-3 h-3 ml-1 ${
        isRecurrenceModified(appointment)
          ? "text-amber-600"
          : "text-blue-600"
      }`} />
    </span>
  )
}

function getStatusBorderTop(status: AppointmentStatus): string {
  const colors: Record<AppointmentStatus, string> = {
    AGENDADO: "border-t-blue-500",
    CONFIRMADO: "border-t-green-500",
    CANCELADO_ACORDADO: "border-t-red-500",
    CANCELADO_FALTA: "border-t-yellow-500",
    CANCELADO_PROFISSIONAL: "border-t-red-500",
    FINALIZADO: "border-t-gray-400",
  }
  return colors[status] || "border-t-gray-400"
}
