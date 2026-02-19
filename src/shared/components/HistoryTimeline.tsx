"use client"

import { useState, useEffect, useCallback } from "react"

interface AuditChange {
  field: string
  label: string
  oldValue: string
  newValue: string
}

interface AuditEntry {
  id: string
  action: string
  userName: string
  createdAt: string
  changes: AuditChange[]
  isCreate: boolean
}

interface Pagination {
  page: number
  limit: number
  total: number
}

const ACTION_LABELS: Record<string, string> = {
  APPOINTMENT_CREATED: "criou o agendamento",
  APPOINTMENT_UPDATED: "editou o agendamento",
  APPOINTMENT_DELETED: "excluiu o agendamento",
  APPOINTMENT_STATUS_CHANGED: "alterou o status",
  APPOINTMENT_CANCELLED: "cancelou o agendamento",
  PROFESSIONAL_CANCELLATION: "cancelou o agendamento",
  CONFIRMATION_RESENT: "reenviou confirmacao",
  PATIENT_CREATED: "cadastrou o paciente",
  PATIENT_UPDATED: "editou o paciente",
  PATIENT_DELETED: "excluiu o paciente",
  RECURRENCE_UPDATED: "editou a recorrencia",
  SERIES_CANCELLATION: "cancelou a serie",
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.toLowerCase().replace(/_/g, " ")
}

interface HistoryTimelineProps {
  entityType: string
  entityId: string
}

export function HistoryTimeline({ entityType, entityId }: HistoryTimelineProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(
    async (page: number, append: boolean) => {
      try {
        if (append) setIsLoadingMore(true)
        else setIsLoading(true)

        const res = await fetch(
          `/api/audit-logs?entityType=${entityType}&entityId=${entityId}&page=${page}&limit=20`
        )
        if (!res.ok) throw new Error("Erro ao carregar historico")

        const data = await res.json()
        setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries))
        setPagination(data.pagination)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [entityType, entityId]
  )

  useEffect(() => {
    fetchEntries(1, false)
  }, [fetchEntries])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
        Nenhum historico encontrado.
      </div>
    )
  }

  const hasMore = pagination ? pagination.page * pagination.limit < pagination.total : false

  return (
    <div className="space-y-0">
      {entries.map((entry, idx) => (
        <div key={entry.id} className="relative pl-6 pb-6">
          {/* Timeline line */}
          {idx < entries.length - 1 && (
            <div className="absolute left-[9px] top-5 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
          )}
          {/* Timeline dot */}
          <div className="absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-blue-500 bg-white dark:bg-gray-900 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          </div>

          {/* Entry content */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatTimestamp(entry.createdAt)}
            </p>
            <p className="text-sm mt-0.5">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {entry.userName}
              </span>{" "}
              <span className="text-gray-600 dark:text-gray-300">
                {getActionLabel(entry.action)}
              </span>
            </p>

            {/* Changes */}
            {entry.changes.length > 0 && (
              <div className="mt-2 space-y-1">
                {entry.changes.map((change, cIdx) => (
                  <div
                    key={cIdx}
                    className="text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5"
                  >
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {change.label}:
                    </span>{" "}
                    {entry.isCreate ? (
                      <span className="text-gray-600 dark:text-gray-400">
                        {change.newValue}
                      </span>
                    ) : (
                      <>
                        <span className="text-red-600 dark:text-red-400 line-through">
                          {change.oldValue}
                        </span>
                        <span className="mx-1 text-gray-400">&rarr;</span>
                        <span className="text-green-700 dark:text-green-400">
                          {change.newValue}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => fetchEntries((pagination?.page || 1) + 1, true)}
          disabled={isLoadingMore}
          className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
        >
          {isLoadingMore ? "Carregando..." : "Carregar mais"}
        </button>
      )}
    </div>
  )
}
