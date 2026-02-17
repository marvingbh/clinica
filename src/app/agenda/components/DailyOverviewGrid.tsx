"use client"

import { useMemo, useCallback, useState, useEffect } from "react"
import { UsersIcon, RefreshCwIcon, PhoneIcon, VideoIcon, BuildingIcon } from "@/shared/components/ui/icons"
import type { Appointment, GroupSession, AppointmentStatus } from "../lib/types"
import { STATUS_LABELS, STATUS_COLORS, STATUS_BORDER_COLORS } from "../lib/constants"
import { formatPhone } from "../lib/utils"
import { getProfessionalColor, ProfessionalColorMap, PROFESSIONAL_COLORS } from "../lib/professional-colors"

const PIXELS_PER_MINUTE = 2.4
const HOUR_HEIGHT = 60 * PIXELS_PER_MINUTE // 144px
const TIME_COL_WIDTH = 64 // w-16 = 4rem = 64px to match slot-based TimeLabel
const CONNECTOR_WIDTH = 1
const SLOT_LEFT_MARGIN = 12 // px gap between timeline connector and appointment blocks
const BLOCK_VERTICAL_GAP = 3 // px gap between stacked blocks

// Generic layout item — anything with a time range and unique id
interface LayoutItem {
  id: string
  scheduledAt: string
  endAt: string
}

interface LayoutResult {
  columnIndex: number
  totalColumns: number
}

function itemsOverlap(a: LayoutItem, b: LayoutItem): boolean {
  const aStart = new Date(a.scheduledAt).getTime()
  const aEnd = new Date(a.endAt).getTime()
  const bStart = new Date(b.scheduledAt).getTime()
  const bEnd = new Date(b.endAt).getTime()
  return aStart < bEnd && bStart < aEnd
}

/** Assign column positions to all items, treating overlapping ones as side-by-side columns */
function calculateLayout(items: LayoutItem[]): Map<string, LayoutResult> {
  const result = new Map<string, LayoutResult>()
  if (items.length === 0) return result

  const sorted = [...items].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )

  const columns: LayoutItem[][] = []

  for (const item of sorted) {
    let placed = false
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const lastInColumn = columns[colIndex][columns[colIndex].length - 1]
      if (!itemsOverlap(lastInColumn, item)) {
        columns[colIndex].push(item)
        placed = true
        break
      }
    }
    if (!placed) {
      columns.push([item])
    }
  }

  const columnMap = new Map<string, number>()
  columns.forEach((column, colIndex) => {
    column.forEach(item => {
      columnMap.set(item.id, colIndex)
    })
  })

  for (const item of sorted) {
    const colIndex = columnMap.get(item.id) || 0
    const overlapping = sorted.filter(other => itemsOverlap(item, other))
    const maxColumnInOverlap = Math.max(
      ...overlapping.map(o => columnMap.get(o.id) || 0)
    )
    const totalColumns = maxColumnInOverlap + 1
    result.set(item.id, { columnIndex: colIndex, totalColumns })
  }

  return result
}

/** Compute visible hour range from content, with padding */
function computeHourRange(
  appointments: Appointment[],
  groupSessions: GroupSession[],
): { startHour: number; endHour: number } {
  const DEFAULT_START = 8
  const DEFAULT_END = 18

  if (appointments.length === 0 && groupSessions.length === 0) {
    return { startHour: DEFAULT_START, endHour: DEFAULT_END }
  }

  let minHour = 24
  let maxHour = 0

  for (const apt of appointments) {
    const start = new Date(apt.scheduledAt)
    const end = new Date(apt.endAt)
    minHour = Math.min(minHour, start.getHours())
    maxHour = Math.max(maxHour, end.getHours() + (end.getMinutes() > 0 ? 1 : 0))
  }
  for (const gs of groupSessions) {
    const start = new Date(gs.scheduledAt)
    const end = new Date(gs.endAt)
    minHour = Math.min(minHour, start.getHours())
    maxHour = Math.max(maxHour, end.getHours() + (end.getMinutes() > 0 ? 1 : 0))
  }

  const startHour = Math.max(0, Math.min(minHour - 1, DEFAULT_START))
  const endHour = Math.min(24, Math.max(maxHour + 1, DEFAULT_END))

  return { startHour, endHour }
}

export interface DailyOverviewGridProps {
  appointments: Appointment[]
  groupSessions: GroupSession[]
  selectedDate: string
  showProfessional?: boolean
  professionalColorMap?: ProfessionalColorMap
  onAppointmentClick: (appointment: Appointment) => void
  onGroupSessionClick: (session: GroupSession) => void
  onSlotClick: (time: string) => void
}

export function DailyOverviewGrid({
  appointments,
  groupSessions,
  selectedDate,
  showProfessional = false,
  professionalColorMap,
  onAppointmentClick,
  onGroupSessionClick,
  onSlotClick,
}: DailyOverviewGridProps) {
  const individualAppointments = useMemo(() => {
    return appointments.filter(apt => !apt.groupId)
  }, [appointments])

  // Build unified layout items from both appointments and group sessions
  const layoutMap = useMemo(() => {
    const items: LayoutItem[] = [
      ...individualAppointments.map(apt => ({
        id: apt.id,
        scheduledAt: apt.scheduledAt,
        endAt: apt.endAt,
      })),
      ...groupSessions.map(gs => ({
        id: `group-${gs.groupId}-${gs.scheduledAt}`,
        scheduledAt: gs.scheduledAt,
        endAt: gs.endAt,
      })),
    ]
    return calculateLayout(items)
  }, [individualAppointments, groupSessions])

  const { startHour, endHour } = useMemo(() => {
    return computeHourRange(individualAppointments, groupSessions)
  }, [individualAppointments, groupSessions])

  const hours = useMemo(() => {
    return Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  }, [startHour, endHour])

  const gridHeight = hours.length * HOUR_HEIGHT

  // "Now" indicator — update every minute
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const isToday = selectedDate === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showNowLine = isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60

  const handleGridClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMinutes = startHour * 60 + y / PIXELS_PER_MINUTE
    const roundedMinutes = Math.round(totalMinutes / 15) * 15
    const h = Math.floor(roundedMinutes / 60)
    const m = roundedMinutes % 60
    if (h >= startHour && h < endHour) {
      onSlotClick(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`)
    }
  }, [onSlotClick, startHour, endHour])

  return (
    <div className="relative flex" style={{ height: `${gridHeight}px` }}>
      {/* Time column — matches slot-based TimeLabel: w-16, text-sm font-medium, right-aligned */}
      <div className="w-16 shrink-0 relative">
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute right-0 pr-3"
            style={{ top: `${(hour - startHour) * HOUR_HEIGHT}px` }}
          >
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              {hour.toString().padStart(2, "0")}:00
            </span>
          </div>
        ))}
      </div>

      {/* Timeline connector — matches slot-based: vertical line with dots at each hour */}
      <div className="w-px shrink-0 relative">
        <div className="absolute top-0 bottom-0 w-px bg-border" />
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute -left-1 w-2.5 h-2.5 rounded-full border-2 bg-background border-border"
            style={{ top: `${(hour - startHour) * HOUR_HEIGHT + 4}px` }}
          />
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 relative pl-6">
        {/* Subtle hour separator lines */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 border-b border-border/30"
            style={{ top: `${(hour - startHour) * HOUR_HEIGHT}px` }}
          />
        ))}

        {/* "Now" indicator line */}
        {showNowLine && (
          <div
            className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
            style={{ top: `${(nowMinutes - startHour * 60) * PIXELS_PER_MINUTE}px` }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
            <div className="flex-1 h-[2px] bg-red-500/60" />
          </div>
        )}

        {/* Clickable area for creating appointments */}
        <div
          className="absolute inset-0 z-10"
          onClick={handleGridClick}
        >
          {/* Appointment blocks */}
          {individualAppointments.map((appointment) => {
            const layout = layoutMap.get(appointment.id)
            if (!layout) return null

            const scheduledAt = new Date(appointment.scheduledAt)
            const endAt = new Date(appointment.endAt)
            const hour = scheduledAt.getHours()
            const minutes = scheduledAt.getMinutes()
            const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

            const rawTop = ((hour - startHour) * 60 + minutes) * PIXELS_PER_MINUTE
            const rawHeight = Math.max(durationMinutes * PIXELS_PER_MINUTE, 96)
            const top = rawTop + BLOCK_VERTICAL_GAP
            const height = rawHeight - BLOCK_VERTICAL_GAP * 2
            const isCompact = height < 72
            const isTall = height >= 110

            const isCancelled = ["CANCELADO_PROFISSIONAL", "CANCELADO_PACIENTE"].includes(appointment.status)

            const startTimeStr = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
            const endTimeStr = `${endAt.getHours().toString().padStart(2, "0")}:${endAt.getMinutes().toString().padStart(2, "0")}`

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
                key={appointment.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onAppointmentClick(appointment)
                }}
                style={{
                  position: "absolute",
                  top: `${top}px`,
                  height: `${height}px`,
                  left: `calc(${leftPercent}% + ${SLOT_LEFT_MARGIN}px + 2px)`,
                  width: `calc(${columnWidth}% - ${SLOT_LEFT_MARGIN}px - 4px)`,
                  maxWidth: layout.totalColumns === 1 ? "400px" : undefined,
                }}
                className={`
                  group rounded-xl text-left overflow-hidden cursor-pointer
                  border border-border border-l-[3px] shadow-sm
                  hover:shadow-md hover:z-30 active:scale-[0.98] transition-all
                  border-t-[3px] ${showProfessional ? profColors.accent.replace("bg-", "border-t-") : getStatusBorderTop(appointment.status as AppointmentStatus)}
                  ${bgClass} ${borderClass}
                  ${isCancelled ? "opacity-40" : ""}
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
                      <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {appointment.patient?.name || appointment.title || "Sem titulo"}
                      </h4>
                      {/* Phone */}
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

                  {/* Meta info row: modality + recurrence */}
                  {!isCompact && (
                    <div className="flex items-center gap-2 mt-auto pt-1">
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
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          <RefreshCwIcon className="w-3 h-3" />
                          {appointment.recurrence.recurrenceType === "WEEKLY" ? "Semanal" :
                           appointment.recurrence.recurrenceType === "BIWEEKLY" ? "Quinzenal" : "Mensal"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            )
          })}

          {/* Group session blocks */}
          {groupSessions.map((session) => {
            const gsKey = `group-${session.groupId}-${session.scheduledAt}`
            const layout = layoutMap.get(gsKey)
            if (!layout) return null

            const scheduledAt = new Date(session.scheduledAt)
            const endAt = new Date(session.endAt)
            const hour = scheduledAt.getHours()
            const minutes = scheduledAt.getMinutes()
            const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

            const rawTop = ((hour - startHour) * 60 + minutes) * PIXELS_PER_MINUTE
            const rawHeight = Math.max(durationMinutes * PIXELS_PER_MINUTE, 96)
            const top = rawTop + BLOCK_VERTICAL_GAP
            const height = rawHeight - BLOCK_VERTICAL_GAP * 2
            const isCompact = height < 72

            const startTimeStr = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
            const endTimeStr = `${endAt.getHours().toString().padStart(2, "0")}:${endAt.getMinutes().toString().padStart(2, "0")}`

            const colors = showProfessional && professionalColorMap
              ? getProfessionalColor(session.professionalProfileId, professionalColorMap)
              : null

            const columnWidth = 100 / layout.totalColumns
            const leftPercent = layout.columnIndex * columnWidth

            return (
              <button
                key={gsKey}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onGroupSessionClick(session)
                }}
                style={{
                  position: "absolute",
                  top: `${top}px`,
                  height: `${height}px`,
                  left: `calc(${leftPercent}% + ${SLOT_LEFT_MARGIN}px + 2px)`,
                  width: `calc(${columnWidth}% - ${SLOT_LEFT_MARGIN}px - 4px)`,
                  maxWidth: layout.totalColumns === 1 ? "400px" : undefined,
                }}
                className={`
                  group rounded-xl text-left overflow-hidden cursor-pointer
                  border border-border border-l-[3px] shadow-sm
                  hover:shadow-md hover:z-30 active:scale-[0.98] transition-all
                  border-t-[3px] ${colors ? colors.accent.replace("bg-", "border-t-") : "border-t-purple-500"}
                  ${colors
                    ? `${colors.bg} ${colors.border}`
                    : "bg-purple-50 dark:bg-purple-950/30 border-l-purple-500"
                  }
                `}
              >
                <div className={`flex flex-col overflow-hidden h-full ${isCompact ? "px-2 py-1 gap-0" : "px-3 py-2 gap-0.5"}`}>
                  {showProfessional && (
                    <p className={`text-xs font-semibold truncate ${
                      colors ? colors.text : "text-purple-700 dark:text-purple-300"
                    }`}>
                      {session.professionalName}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <UsersIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {session.groupName}
                    </p>
                  </div>
                  {!isCompact && (
                    <p className="text-xs text-muted-foreground truncate">
                      {startTimeStr} – {endTimeStr} ({session.participants.length})
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function getStatusBorderTop(status: AppointmentStatus): string {
  const colors: Record<AppointmentStatus, string> = {
    AGENDADO: "border-t-blue-500",
    CONFIRMADO: "border-t-green-500",
    CANCELADO_PACIENTE: "border-t-red-500",
    CANCELADO_PROFISSIONAL: "border-t-red-500",
    NAO_COMPARECEU: "border-t-yellow-500",
    FINALIZADO: "border-t-gray-400",
  }
  return colors[status] || "border-t-gray-400"
}
