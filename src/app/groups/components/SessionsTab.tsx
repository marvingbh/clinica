"use client"

import { EmptyState } from "@/shared/components/ui"
import { CalendarIcon } from "@/shared/components/ui/icons"
import { GroupSessionItem } from "./types"
import { SessionCard } from "./SessionCard"

interface SessionsTabProps {
  groupId: string
  isActive: boolean
  canWrite: boolean
  sessionFilter: "upcoming" | "past"
  groupSessions: GroupSessionItem[]
  isLoadingSessions: boolean
  sessionPage: number
  sessionTotal: number
  sessionPageSize: number
  sessionGoToDate: string
  onFilterChange: (filter: "upcoming" | "past") => void
  onPageChange: (page: number) => void
  onGoToDateChange: (date: string) => void
  onClearGoToDate: () => void
  onFetchSessions: (groupId: string, filter: string, page: number, referenceDate?: string) => void
}

export function SessionsTab({
  groupId,
  isActive,
  canWrite,
  sessionFilter,
  groupSessions,
  isLoadingSessions,
  sessionPage,
  sessionTotal,
  sessionPageSize,
  sessionGoToDate,
  onFilterChange,
  onPageChange,
  onGoToDateChange,
  onClearGoToDate,
  onFetchSessions,
}: SessionsTabProps) {
  return (
    <div>
      {/* Filter Toggle */}
      <div className="flex rounded-lg border border-input overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => {
            if (sessionFilter !== "upcoming") {
              onFilterChange("upcoming")
              onPageChange(1)
              onFetchSessions(groupId, "upcoming", 1, sessionGoToDate || undefined)
            }
          }}
          className={`flex-1 h-9 text-sm font-medium transition-colors ${
            sessionFilter === "upcoming"
              ? "bg-purple-600 text-white"
              : "bg-background text-foreground hover:bg-muted"
          }`}
        >
          Proximas
        </button>
        <button
          type="button"
          onClick={() => {
            if (sessionFilter !== "past") {
              onFilterChange("past")
              onPageChange(1)
              onFetchSessions(groupId, "past", 1, sessionGoToDate || undefined)
            }
          }}
          className={`flex-1 h-9 text-sm font-medium transition-colors ${
            sessionFilter === "past"
              ? "bg-purple-600 text-white"
              : "bg-background text-foreground hover:bg-muted"
          }`}
        >
          Passadas
        </button>
      </div>

      {/* Go to date */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-muted-foreground whitespace-nowrap">Ir para data:</label>
        <input
          type="date"
          value={sessionGoToDate}
          onChange={(e) => {
            const val = e.target.value
            onGoToDateChange(val)
            onPageChange(1)
            onFetchSessions(groupId, sessionFilter, 1, val || undefined)
          }}
          className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm"
        />
        {sessionGoToDate && (
          <button
            type="button"
            onClick={() => {
              onClearGoToDate()
              onPageChange(1)
              onFetchSessions(groupId, sessionFilter, 1)
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar
          </button>
        )}
      </div>

      {isLoadingSessions ? (
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
        </div>
      ) : groupSessions.length > 0 ? (
        <div className="space-y-2">
          {groupSessions.map((session) => (
            <SessionCard
              key={`${session.groupId}-${session.scheduledAt}`}
              session={session}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={sessionFilter === "upcoming" ? "Nenhuma sessão próxima" : "Nenhuma sessão passada"}
          message={canWrite && isActive && sessionFilter === "upcoming" ? "Use \"Gerar / Atualizar Sessões\" para criar sessões" : sessionFilter === "past" ? "Nenhuma sessão passada encontrada" : "Ainda não há sessões para este grupo"}
          icon={<CalendarIcon className="w-8 h-8 text-muted-foreground" />}
        />
      )}

      {/* Pagination */}
      {sessionTotal > sessionPageSize && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              const prev = sessionPage - 1
              onPageChange(prev)
              onFetchSessions(groupId, sessionFilter, prev, sessionGoToDate || undefined)
            }}
            disabled={sessionPage <= 1}
            className="h-8 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            &larr; Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página {sessionPage} de {Math.ceil(sessionTotal / sessionPageSize)}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = sessionPage + 1
              onPageChange(next)
              onFetchSessions(groupId, sessionFilter, next, sessionGoToDate || undefined)
            }}
            disabled={sessionPage >= Math.ceil(sessionTotal / sessionPageSize)}
            className="h-8 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Próxima &rarr;
          </button>
        </div>
      )}
    </div>
  )
}
