"use client"

import { useCallback, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useDebouncedValue } from "@/shared/hooks"
import { toast } from "sonner"
import { IntakeSubmissionDetail } from "./IntakeSubmissionDetail"

interface IntakeSubmission {
  id: string
  childName: string
  guardianName: string
  phone: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  submittedAt: string
  reviewedAt: string | null
  patientId: string | null
}

interface IntakeSubmissionsTabProps {
  canWrite: boolean
}

export function IntakeSubmissionsTab({ canWrite }: IntakeSubmissionsTabProps) {
  const [submissions, setSubmissions] = useState<IntakeSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const searchDebounced = useDebouncedValue(search, 300)
  const [statusFilter, setStatusFilter] = useState<string>("PENDING")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fetchSubmissions = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        page: page.toString(),
        limit: "20",
      })
      if (searchDebounced) params.set("search", searchDebounced)

      const response = await fetch(`/api/intake-submissions?${params}`)
      if (!response.ok) throw new Error()

      const data = await response.json()
      setSubmissions(data.submissions)
      setTotalPages(data.pagination.totalPages)
    } catch {
      toast.error("Erro ao carregar fichas de cadastro")
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, searchDebounced, page])

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    })
  }

  function formatPhone(phone: string) {
    if (phone.length === 11) {
      return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
    }
    if (phone.length === 10) {
      return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`
    }
    return phone
  }

  const statusLabel: Record<string, string> = {
    PENDING: "Pendente",
    APPROVED: "Aprovada",
    REJECTED: "Rejeitada",
  }

  const statusColor: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  }

  if (selectedId) {
    return (
      <IntakeSubmissionDetail
        id={selectedId}
        canWrite={canWrite}
        onBack={() => {
          setSelectedId(null)
          fetchSubmissions()
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm"
        >
          <option value="PENDING">Pendentes</option>
          <option value="APPROVED">Aprovadas</option>
          <option value="REJECTED">Rejeitadas</option>
          <option value="ALL">Todas</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-md animate-pulse" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma ficha de cadastro encontrada
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className="w-full text-left p-4 rounded-md border border-border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{s.childName}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {s.guardianName} &middot; {formatPhone(s.phone)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(s.submittedAt)}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[s.status]}`}>
                    {statusLabel[s.status]}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="h-9 flex items-center text-sm text-muted-foreground">
            {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-50"
          >
            Proxima
          </button>
        </div>
      )}
    </div>
  )
}
