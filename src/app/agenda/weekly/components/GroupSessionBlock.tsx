"use client"

import { UsersIcon } from "@/shared/components/ui/icons"
import { GroupSession } from "../../lib/types"
import { CANCELLED_STATUSES, TERMINAL_STATUSES } from "../../lib/constants"
import { WEEKLY_GRID } from "../../lib/grid-config"
import { useAgendaColors } from "../../components/AgendaColorsProvider"
import { paletteFor } from "@/lib/clinic/colors/resolvers"

const { pixelsPerMinute: PIXELS_PER_MINUTE } = WEEKLY_GRID

interface GroupSessionBlockProps {
  session: GroupSession
  onClick?: (session: GroupSession) => void
  showProfessional?: boolean
  columnIndex?: number
  totalColumns?: number
  startHour: number
}

export function GroupSessionBlock({
  session,
  onClick,
  showProfessional = false,
  columnIndex = 0,
  totalColumns = 1,
  startHour,
}: GroupSessionBlockProps) {
  const scheduledAt = new Date(session.scheduledAt)
  const endAt = new Date(session.endAt)

  const hour = scheduledAt.getHours()
  const minutes = scheduledAt.getMinutes()
  const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

  // Calculate position and height
  const top = ((hour - startHour) * 60 + minutes) * PIXELS_PER_MINUTE
  const height = Math.max(durationMinutes * PIXELS_PER_MINUTE, 32) // Min height of 32px for readability

  // Calculate width and left position for overlapping blocks
  const columnWidth = 100 / totalColumns
  const leftPercent = columnIndex * columnWidth

  const startTimeStr = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  const endHour = endAt.getHours()
  const endMinutes = endAt.getMinutes()
  const endTimeStr = `${endHour.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`

  const participantCount = session.participants.length
  const allTerminal = participantCount > 0 && session.participants.every(
    p => TERMINAL_STATUSES.includes(p.status)
  )
  const allCancelled = participantCount > 0 && session.participants.every(
    p => CANCELLED_STATUSES.includes(p.status)
  )

  const agendaColors = useAgendaColors()
  const colors = paletteFor("groupSession", agendaColors)

  return (
    <button
      type="button"
      onClick={() => onClick?.(session)}
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPercent}% + 1px)`,
        width: `calc(${columnWidth}% - 2px)`,
      }}
      className={`
        border ${colors.border} rounded px-1 py-0.5 text-left
        border-l-[3px] ${colors.borderLeft} overflow-hidden cursor-pointer
        ${colors.bg}
        hover:shadow-md hover:z-10 transition-all
        ${allCancelled ? "opacity-40" : allTerminal ? "opacity-60" : ""}
      `}
    >
      <div className="h-full flex flex-col overflow-hidden gap-0.5">
        {showProfessional && (
          <p className={`text-[10px] font-semibold truncate leading-tight ${colors.text}`}>
            {session.professionalName}
          </p>
        )}
        <div className="flex items-center gap-1">
          <UsersIcon className={`w-3 h-3 ${colors.text} flex-shrink-0`} />
          <p className="text-[11px] font-medium text-foreground truncate leading-tight">
            {session.groupName}
          </p>
        </div>
        {height >= 48 && (
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {startTimeStr} - {endTimeStr} ({participantCount})
          </p>
        )}
      </div>
    </button>
  )
}
