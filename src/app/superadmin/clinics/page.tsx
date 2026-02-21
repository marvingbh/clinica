"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, ChevronLeft, ChevronRight } from "lucide-react"

interface ClinicRow {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  isActive: boolean
  subscriptionStatus: string
  trialEndsAt: string | null
  createdAt: string
  plan: { id: string; name: string; slug: string } | null
  _count: { users: number; patients: number }
}

interface ClinicsResponse {
  clinics: ClinicRow[]
  total: number
  page: number
  totalPages: number
}

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "trialing", label: "Em teste" },
  { value: "active", label: "Ativo" },
  { value: "past_due", label: "Inadimplente" },
  { value: "canceled", label: "Cancelado" },
  { value: "unpaid", label: "Nao pago" },
]

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    trialing: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    past_due: "bg-yellow-100 text-yellow-700",
    canceled: "bg-red-100 text-red-700",
    unpaid: "bg-red-100 text-red-700",
  }

  const labels: Record<string, string> = {
    trialing: "Em teste",
    active: "Ativo",
    past_due: "Inadimplente",
    canceled: "Cancelado",
    unpaid: "Nao pago",
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[status] || "bg-gray-100 text-gray-700"
      }`}
    >
      {labels[status] || status}
    </span>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

export default function SuperAdminClinicsPage() {
  const router = useRouter()
  const [data, setData] = useState<ClinicsResponse | null>(null)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)

  const fetchClinics = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (status) params.set("status", status)
      params.set("page", String(page))

      const res = await fetch(`/api/superadmin/clinics?${params.toString()}`)
      if (!res.ok) throw new Error("Erro ao carregar clinicas")
      const json = await res.json()
      setData(json)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    }
  }, [search, status, page])

  useEffect(() => {
    fetchClinics()
  }, [fetchClinics])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchClinics()
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Clinicas</h1>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form onSubmit={handleSearchSubmit} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome, slug ou email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
        </form>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {!data ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Plano
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Usuarios
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Pacientes
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Criado em
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.clinics.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhuma clinica encontrada
                      </td>
                    </tr>
                  ) : (
                    data.clinics.map((clinic) => (
                      <tr
                        key={clinic.id}
                        onClick={() => router.push(`/superadmin/clinics/${clinic.id}`)}
                        className="hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {clinic.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {clinic.slug}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {clinic.plan?.name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={clinic.subscriptionStatus} />
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground text-right">
                          {clinic._count.users}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground text-right">
                          {clinic._count.patients}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(clinic.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-input bg-background text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>

              <span className="text-sm text-muted-foreground">
                Pagina {data.page} de {data.totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-input bg-background text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Proximo
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
