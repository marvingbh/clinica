"use client"

import { GroupSessionItem } from "./types"

interface SessionCardProps {
  session: GroupSessionItem
}

export function SessionCard({ session }: SessionCardProps) {
  const sessionDate = new Date(session.scheduledAt)
  const endDate = new Date(session.endAt)
  const isPast = sessionDate < new Date()
  const dateStr = sessionDate.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
  const startTime = sessionDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
  const endTime = endDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })

  return (
    <div
      className={`bg-muted/50 rounded-lg p-4 ${isPast ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground capitalize">{dateStr}</p>
          <p className="text-sm text-muted-foreground">
            {startTime} - {endTime}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${
            isPast
              ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
              : "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
          }`}>
            {session.participants.length} participante{session.participants.length !== 1 ? "s" : ""}
          </span>
          {isPast && (
            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
              Realizada
            </span>
          )}
        </div>
      </div>
      {session.participants.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {session.participants.map((p) => (
            <span
              key={p.appointmentId}
              className="text-xs px-2 py-0.5 rounded-full bg-background border border-border text-muted-foreground"
            >
              {p.patientName}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
