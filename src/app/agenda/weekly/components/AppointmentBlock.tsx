"use client"

import { Appointment } from "../../lib/types"

const PIXELS_PER_MINUTE = 1.6 // 48px per 30 minutes = 96px per hour
const START_HOUR = 7

// Professional color palette - distinct colors for different professionals
const PROFESSIONAL_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-l-blue-500", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-green-100 dark:bg-green-900/40", border: "border-l-green-500", text: "text-green-700 dark:text-green-300" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-l-purple-500", text: "text-purple-700 dark:text-purple-300" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-l-orange-500", text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", border: "border-l-pink-500", text: "text-pink-700 dark:text-pink-300" },
  { bg: "bg-teal-100 dark:bg-teal-900/40", border: "border-l-teal-500", text: "text-teal-700 dark:text-teal-300" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", border: "border-l-indigo-500", text: "text-indigo-700 dark:text-indigo-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-l-amber-500", text: "text-amber-700 dark:text-amber-300" },
]

// Simple hash function to get consistent color index for a professional
function getProfessionalColorIndex(professionalId: string): number {
  let hash = 0
  for (let i = 0; i < professionalId.length; i++) {
    hash = ((hash << 5) - hash) + professionalId.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash) % PROFESSIONAL_COLORS.length
}

interface AppointmentBlockProps {
  appointment: Appointment
  onClick: (appointment: Appointment) => void
  showProfessional?: boolean
  columnIndex?: number
  totalColumns?: number
}

export function AppointmentBlock({
  appointment,
  onClick,
  showProfessional = false,
  columnIndex = 0,
  totalColumns = 1,
}: AppointmentBlockProps) {
  const scheduledAt = new Date(appointment.scheduledAt)
  const endAt = new Date(appointment.endAt)

  const hour = scheduledAt.getHours()
  const minutes = scheduledAt.getMinutes()
  const durationMinutes = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)

  // Calculate position and height
  const top = ((hour - START_HOUR) * 60 + minutes) * PIXELS_PER_MINUTE
  const height = Math.max(durationMinutes * PIXELS_PER_MINUTE, 32) // Min height of 32px for readability

  const isCancelled = ["CANCELADO_PROFISSIONAL", "CANCELADO_PACIENTE"].includes(appointment.status)

  const startTimeStr = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  const endHour = endAt.getHours()
  const endMinutes = endAt.getMinutes()
  const endTimeStr = `${endHour.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`

  // Get professional color
  const colorIndex = getProfessionalColorIndex(appointment.professionalProfile.id)
  const colors = PROFESSIONAL_COLORS[colorIndex]

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
        ${showProfessional ? colors.bg : "bg-card"}
        ${showProfessional ? colors.border : "border-l-primary"}
        ${isCancelled ? "opacity-50" : ""}
      `}
    >
      <div className="h-full flex flex-col overflow-hidden gap-0.5 relative">
        {/* Recurrence indicator icon */}
        {appointment.recurrence && (
          <div className="absolute top-0 right-0" title="Agendamento recorrente">
            <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        )}
        {showProfessional && (
          <p className={`text-[10px] font-semibold truncate leading-tight ${colors.text} ${appointment.recurrence ? "pr-3" : ""}`}>
            {appointment.professionalProfile.user.name}
          </p>
        )}
        <p className={`text-[11px] font-medium text-foreground truncate leading-tight ${appointment.recurrence && !showProfessional ? "pr-3" : ""}`}>
          {appointment.patient.name}
        </p>
        {height >= 48 && (
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {startTimeStr} - {endTimeStr}
          </p>
        )}
      </div>
    </button>
  )
}
