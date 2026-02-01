"use client"

import { Card, CardContent } from "@/shared/components/ui/card"
import { UsersIcon, ClockIcon } from "@/shared/components/ui/icons"
import type { GroupSession } from "../lib/types"

interface GroupSessionCardProps {
  session: GroupSession
  onClick: () => void
  showProfessional?: boolean
  compact?: boolean
}

function getParticipantStatusSummary(participants: GroupSession["participants"]): {
  confirmed: number
  pending: number
  total: number
} {
  const confirmed = participants.filter(
    p => p.status === "CONFIRMADO" || p.status === "FINALIZADO"
  ).length
  const pending = participants.filter(p => p.status === "AGENDADO").length
  return { confirmed, pending, total: participants.length }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function GroupSessionCard({
  session,
  onClick,
  showProfessional = false,
  compact = false,
}: GroupSessionCardProps) {
  const statusSummary = getParticipantStatusSummary(session.participants)
  const startTime = formatTime(session.scheduledAt)
  const endTime = formatTime(session.endAt)

  return (
    <Card
      elevation="sm"
      hoverable
      className="group cursor-pointer overflow-hidden transition-all duration-normal active:scale-[0.98] bg-purple-50 dark:bg-purple-950/30"
      onClick={onClick}
    >
      {/* Purple accent bar for group sessions */}
      <div className="h-1 bg-purple-500" />

      <CardContent className={compact ? "py-3" : "py-4"}>
        {/* Professional name - shown when viewing all */}
        {showProfessional && (
          <p className="text-xs font-semibold mb-2 truncate text-purple-700 dark:text-purple-300">
            {session.professionalName}
          </p>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <UsersIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              <h4 className="font-semibold text-foreground truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                {session.groupName}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <ClockIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                {startTime} - {endTime}
              </p>
            </div>
          </div>

          {/* Participant count badge */}
          <span className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">
            {session.participants.length} participante{session.participants.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Status summary row */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-purple-200/50 dark:border-purple-800/50">
          {/* Group session badge */}
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
            <UsersIcon className="w-3.5 h-3.5" />
            Sessão em Grupo
          </span>

          {/* Confirmation status */}
          {statusSummary.confirmed > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              {statusSummary.confirmed} confirmado{statusSummary.confirmed !== 1 ? "s" : ""}
            </span>
          )}

          {statusSummary.pending > 0 && (
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {statusSummary.pending} pendente{statusSummary.pending !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function GroupSessionCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card elevation="sm" className="overflow-hidden bg-purple-50/50 dark:bg-purple-950/20">
      {/* Purple accent bar skeleton */}
      <div className="h-1 bg-purple-300 dark:bg-purple-700 animate-pulse" />

      <CardContent className={compact ? "py-3" : "py-4"}>
        <div className="animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-3/4 bg-purple-200 dark:bg-purple-800 rounded" />
              <div className="h-4 w-1/2 bg-purple-200 dark:bg-purple-800 rounded" />
            </div>
            <div className="h-6 w-24 bg-purple-200 dark:bg-purple-800 rounded-full" />
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-purple-200/50 dark:border-purple-800/50">
            <div className="h-6 w-28 bg-purple-200 dark:bg-purple-800 rounded-lg" />
            <div className="h-4 w-20 bg-purple-200 dark:bg-purple-800 rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
