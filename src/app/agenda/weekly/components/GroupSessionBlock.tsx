"use client"

import { UsersIcon } from "@/shared/components/ui/icons"
import { GroupSession } from "../../lib/types"

const PIXELS_PER_MINUTE = 1.6 // 48px per 30 minutes = 96px per hour
const START_HOUR = 7

interface GroupSessionBlockProps {
  session: GroupSession
  onClick?: (session: GroupSession) => void
  showProfessional?: boolean
}

export function GroupSessionBlock({
  session,
  onClick,
  showProfessional = false,
}: GroupSessionBlockProps) {
  const scheduledAt = new Date(session.scheduledAt)
  const endAt = new Date(session.endAt)

  const hour = scheduledAt.getHours()
  const minutes = scheduledAt.getMinutes()
  const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

  // Calculate position and height
  const top = ((hour - START_HOUR) * 60 + minutes) * PIXELS_PER_MINUTE
  const height = Math.max(durationMinutes * PIXELS_PER_MINUTE, 32) // Min height of 32px for readability

  const startTimeStr = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  const endHour = endAt.getHours()
  const endMinutes = endAt.getMinutes()
  const endTimeStr = `${endHour.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`

  const participantCount = session.participants.length

  return (
    <button
      type="button"
      onClick={() => onClick?.(session)}
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: "1px",
        width: "calc(100% - 2px)",
      }}
      className={`
        border border-purple-300 dark:border-purple-700 rounded px-1 py-0.5 text-left
        border-l-[3px] border-l-purple-500 overflow-hidden cursor-pointer
        bg-purple-50 dark:bg-purple-950/30
        hover:shadow-md hover:z-10 transition-all
      `}
    >
      <div className="h-full flex flex-col overflow-hidden gap-0.5">
        {showProfessional && (
          <p className="text-[10px] font-semibold truncate leading-tight text-purple-700 dark:text-purple-300">
            {session.professionalName}
          </p>
        )}
        <div className="flex items-center gap-1">
          <UsersIcon className="w-3 h-3 text-purple-600 dark:text-purple-400 flex-shrink-0" />
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
