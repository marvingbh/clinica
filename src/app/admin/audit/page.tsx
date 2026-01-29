"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"

interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
  } | null
}

interface Pagination {
  page: number
  limit: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

const ACTION_LABELS: Record<string, string> = {
  APPOINTMENT_CREATED: "Agendamento criado",
  APPOINTMENT_UPDATED: "Agendamento atualizado",
  APPOINTMENT_DELETED: "Agendamento excluído",
  APPOINTMENT_STATUS_CHANGED: "Status alterado",
  APPOINTMENT_CANCELLED: "Agendamento cancelado",
  PROFESSIONAL_CANCELLATION: "Cancelamento pelo profissional",
  PATIENT_CREATED: "Paciente criado",
  PATIENT_UPDATED: "Paciente atualizado",
  PATIENT_DELETED: "Paciente excluído",
  PROFESSIONAL_CREATED: "Profissional criado",
  PROFESSIONAL_UPDATED: "Profissional atualizado",
  PROFESSIONAL_DELETED: "Profissional excluído",
  USER_CREATED: "Usuário criado",
  USER_UPDATED: "Usuário atualizado",
  LOGIN_SUCCESS: "Login realizado",
  LOGIN_FAILED: "Falha no login",
  PERMISSION_DENIED: "Acesso negado",
}

const ENTITY_LABELS: Record<string, string> = {
  Appointment: "Agendamento",
  Patient: "Paciente",
  User: "Usuário",
  "professional-profile": "Profissional",
}

const ACTION_COLORS: Record<string, string> = {
  APPOINTMENT_CREATED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  APPOINTMENT_UPDATED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  APPOINTMENT_DELETED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  APPOINTMENT_STATUS_CHANGED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  APPOINTMENT_CANCELLED: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  PROFESSIONAL_CANCELLATION: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  PATIENT_CREATED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PATIENT_UPDATED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PATIENT_DELETED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  LOGIN_SUCCESS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  LOGIN_FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  PERMISSION_DENIED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

export default function AdminAuditPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)

  // Filters
  const [filterAction, setFilterAction] = useState<string>("")
  const [filterEntityType, setFilterEntityType] = useState<string>("")
  const [filterStartDate, setFilterStartDate] = useState<string>("")
  const [filterEndDate, setFilterEndDate] = useState<string>("")
  const [page, setPage] = useState(1)

  // Details sheet
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const fetchAuditLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAction) params.set("action", filterAction)
      if (filterEntityType) params.set("entityType", filterEntityType)
      if (filterStartDate) params.set("startDate", filterStartDate)
      if (filterEndDate) params.set("endDate", filterEndDate)
      params.set("page", String(page))
      params.set("limit", "50")

      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch audit logs")
      }
      const data = await response.json()
      setAuditLogs(data.auditLogs)
      setPagination(data.pagination)
    } catch {
      toast.error("Erro ao carregar logs de auditoria")
    } finally {
      setIsLoading(false)
    }
  }, [filterAction, filterEntityType, filterStartDate, filterEndDate, page, router])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      if (session?.user?.role !== "ADMIN") {
        toast.error("Acesso restrito a administradores")
        router.push("/")
        return
      }
      fetchAuditLogs()
    }
  }, [status, session, router, fetchAuditLogs])

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function getActionLabel(action: string): string {
    return ACTION_LABELS[action] || action
  }

  function getEntityLabel(entityType: string): string {
    return ENTITY_LABELS[entityType] || entityType
  }

  function getActionColor(action: string): string {
    return ACTION_COLORS[action] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }

  function handleClearFilters() {
    setFilterAction("")
    setFilterEntityType("")
    setFilterStartDate("")
    setFilterEndDate("")
    setPage(1)
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="flex gap-4">
              <div className="h-12 flex-1 bg-muted rounded" />
              <div className="h-12 w-32 bg-muted rounded" />
            </div>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-muted rounded" />
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Voltar
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-6">Logs de Auditoria</h1>

        {/* Filters */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Ação</label>
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              >
                <option value="">Todas</option>
                <option value="APPOINTMENT_CREATED">Agendamento criado</option>
                <option value="APPOINTMENT_UPDATED">Agendamento atualizado</option>
                <option value="APPOINTMENT_DELETED">Agendamento excluído</option>
                <option value="APPOINTMENT_STATUS_CHANGED">Status alterado</option>
                <option value="PROFESSIONAL_CANCELLATION">Cancelamento</option>
                <option value="PATIENT_CREATED">Paciente criado</option>
                <option value="PATIENT_UPDATED">Paciente atualizado</option>
                <option value="PATIENT_DELETED">Paciente excluído</option>
                <option value="LOGIN_SUCCESS">Login realizado</option>
                <option value="LOGIN_FAILED">Falha no login</option>
                <option value="PERMISSION_DENIED">Acesso negado</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Tipo</label>
              <select
                value={filterEntityType}
                onChange={(e) => {
                  setFilterEntityType(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              >
                <option value="">Todos</option>
                <option value="Appointment">Agendamento</option>
                <option value="Patient">Paciente</option>
                <option value="User">Usuário</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Data inicial</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => {
                  setFilterStartDate(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Data final</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => {
                  setFilterEndDate(e.target.value)
                  setPage(1)
                }}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
          </div>

          {(filterAction || filterEntityType || filterStartDate || filterEndDate) && (
            <div className="mt-4 pt-4 border-t border-border">
              <button
                onClick={handleClearFilters}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {/* Results summary */}
        {pagination && (
          <div className="text-sm text-muted-foreground mb-4">
            Mostrando {auditLogs.length} de {pagination.totalCount} registros
          </div>
        )}

        {/* Audit Logs Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                    Data/Hora
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Ação</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Tipo</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                    Usuário
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                    Detalhes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum registro encontrado
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}
                        >
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {getEntityLabel(log.entityType)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {log.user?.name || "Sistema"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-sm text-primary hover:underline"
                        >
                          Ver detalhes
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.hasPrevPage}
              className="h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <span className="text-sm text-muted-foreground">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.hasNextPage}
              className="h-10 px-4 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* Details Sheet */}
      {selectedLog && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedLog(null)} />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="max-w-2xl mx-auto px-4 py-6">
              {/* Handle */}
              <div className="flex justify-center mb-4">
                <div className="w-12 h-1.5 rounded-full bg-muted" />
              </div>

              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Detalhes do Log</h2>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Data/Hora</dt>
                    <dd className="text-sm text-foreground">{formatDate(selectedLog.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Ação</dt>
                    <dd>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getActionColor(selectedLog.action)}`}
                      >
                        {getActionLabel(selectedLog.action)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Tipo</dt>
                    <dd className="text-sm text-foreground">
                      {getEntityLabel(selectedLog.entityType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">ID da Entidade</dt>
                    <dd className="text-sm text-foreground font-mono">{selectedLog.entityId}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Usuário</dt>
                    <dd className="text-sm text-foreground">
                      {selectedLog.user?.name || "Sistema"}
                      {selectedLog.user?.email && (
                        <span className="text-muted-foreground ml-1">
                          ({selectedLog.user.email})
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Endereço IP</dt>
                    <dd className="text-sm text-foreground font-mono">
                      {selectedLog.ipAddress || "-"}
                    </dd>
                  </div>
                </div>

                {/* Old Values */}
                {selectedLog.oldValues && Object.keys(selectedLog.oldValues).length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-2">
                      Valores anteriores
                    </dt>
                    <dd className="bg-muted/50 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-sm text-foreground font-mono whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.oldValues, null, 2)}
                      </pre>
                    </dd>
                  </div>
                )}

                {/* New Values */}
                {selectedLog.newValues && Object.keys(selectedLog.newValues).length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-2">Novos valores</dt>
                    <dd className="bg-muted/50 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-sm text-foreground font-mono whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.newValues, null, 2)}
                      </pre>
                    </dd>
                  </div>
                )}

                {/* User Agent */}
                {selectedLog.userAgent && (
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-2">User Agent</dt>
                    <dd className="text-sm text-muted-foreground break-all">
                      {selectedLog.userAgent}
                    </dd>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </main>
  )
}
