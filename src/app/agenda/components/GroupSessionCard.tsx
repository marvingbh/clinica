"use client"

import { Card, CardContent } from "@/shared/components/ui/card"
import { UsersIcon, ClockIcon } from "@/shared/components/ui/icons"
import type { GroupSession } from "../lib/types"
import { CANCELLED_STATUSES } from "../lib/constants"
import { getProfessionalColor, ProfessionalColorMap } from "../lib/professional-colors"
import { useAgendaColors } from "./AgendaColorsProvider"
import { paletteFor } from "@/lib/clinic/colors/resolvers"

interface GroupSessionCardProps {
  session: GroupSession
  onClick: () => void
  showProfessional?: boolean
  compact?: boolean
  professionalColorMap?: ProfessionalColorMap
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
  professionalColorMap,
}: GroupSessionCardProps) {
  const statusSummary = getParticipantStatusSummary(session.participants)
  const startTime = formatTime(session.scheduledAt)
  const endTime = formatTime(session.endAt)

  const allCancelled = session.participants.length > 0 && session.participants.every(
    p => CANCELLED_STATUSES.includes(p.status)
  )

  // Professional color when showing all professionals, otherwise the clinic's
  // configured group-session palette (default violet).
  const profColors = showProfessional && professionalColorMap
    ? getProfessionalColor(session.professionalProfileId, professionalColorMap)
    : null
  const groupColors = paletteFor("groupSession", useAgendaColors())

  return (
    <Card
      elevation="sm"
      hoverable
      className={`group cursor-pointer overflow-hidden transition-all duration-normal active:scale-[0.98] ${
        profColors ? `${profColors.bg} border-l-[3px] ${profColors.border}` : groupColors.bg
      } ${allCancelled ? "opacity-50 grayscale" : ""}`}
      onClick={onClick}
    >
      {/* Accent bar */}
      <div className={`h-1 ${profColors ? profColors.accent : groupColors.accent}`} />

      <CardContent className={compact ? "py-3" : "py-4"}>
        {/* Professional name - shown when viewing all */}
        {showProfessional && (
          <p className={`text-xs font-semibold mb-2 truncate ${profColors ? profColors.text : groupColors.text}`}>
            {session.professionalName}
          </p>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <UsersIcon className={`w-4 h-4 ${groupColors.text} flex-shrink-0`} />
              <h4 className={`font-semibold text-foreground truncate group-hover:${groupColors.text} transition-colors`}>
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
          <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${groupColors.bg} ${groupColors.text}`}>
            {session.participants.length} participante{session.participants.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Status summary row */}
        <div className={`flex items-center gap-3 mt-3 pt-3 border-t ${groupColors.border}`}>
          {/* Group session badge */}
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${groupColors.bg} ${groupColors.text}`}>
            <UsersIcon className="w-3.5 h-3.5" />
            Sessão em Grupo
          </span>

          {allCancelled ? (
            <span className="text-xs text-red-600 font-medium">
              Cancelado
            </span>
          ) : (
            <>
              {statusSummary.confirmed > 0 && (
                <span className="text-xs text-green-600 font-medium">
                  {statusSummary.confirmed} confirmado{statusSummary.confirmed !== 1 ? "s" : ""}
                </span>
              )}

              {statusSummary.pending > 0 && (
                <span className="text-xs text-blue-600 font-medium">
                  {statusSummary.pending} pendente{statusSummary.pending !== 1 ? "s" : ""}
                </span>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function GroupSessionCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card elevation="sm" className="overflow-hidden bg-muted/30">
      <div className="h-1 bg-muted-foreground/30 animate-pulse" />

      <CardContent className={compact ? "py-3" : "py-4"}>
        <div className="animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-3/4 bg-muted rounded" />
              <div className="h-4 w-1/2 bg-muted rounded" />
            </div>
            <div className="h-6 w-24 bg-muted rounded-full" />
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
            <div className="h-6 w-28 bg-muted rounded-lg" />
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
