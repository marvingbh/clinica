"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Users, Calendar } from "lucide-react"

interface ClinicUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

interface ClinicDetail {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  isActive: boolean
  subscriptionStatus: string
  trialEndsAt: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  createdAt: string
  plan: { id: string; name: string } | null
  users: ClinicUser[]
  _count: { patients: number; appointments: number }
}

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

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "ADMIN"
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isAdmin ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"
      }`}
    >
      {role}
    </span>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

export default function SuperAdminClinicDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clinicId = params.id as string

  const [clinic, setClinic] = useState<ClinicDetail | null>(null)
  const [error, setError] = useState("")
  const [actionLoading, setActionLoading] = useState(false)

  const fetchClinic = useCallback(async () => {
    try {
      const res = await fetch(`/api/superadmin/clinics/${clinicId}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError("Clinica nao encontrada")
          return
        }
        throw new Error("Erro ao carregar clinica")
      }
      const data = await res.json()
      setClinic(data.clinic)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    }
  }, [clinicId])

  useEffect(() => {
    fetchClinic()
  }, [fetchClinic])

  async function handleAction(action: string, extraData?: Record<string, unknown>) {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/superadmin/clinics/${clinicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extraData }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao executar acao")
      }
      await fetchClinic()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setActionLoading(false)
    }
  }

  if (error && !clinic) {
    return (
      <div className="p-8">
        <Link
          href="/superadmin/clinics"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para clinicas
        </Link>
        <div className="bg-destructive/10 text-destructive rounded-lg p-4">
          {error}
        </div>
      </div>
    )
  }

  if (!clinic) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <Link
        href="/superadmin/clinics"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para clinicas
      </Link>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {/* Clinic info */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{clinic.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{clinic.slug}</p>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              clinic.isActive
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {clinic.isActive ? "Ativo" : "Inativo"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Email:</span>{" "}
            <span className="text-foreground">{clinic.email || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Telefone:</span>{" "}
            <span className="text-foreground">{clinic.phone || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Criado em:</span>{" "}
            <span className="text-foreground">{formatDate(clinic.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Subscription section */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Assinatura</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Plano:</span>{" "}
            <span className="text-foreground">{clinic.plan?.name || "Nenhum"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Status:</span>{" "}
            <StatusBadge status={clinic.subscriptionStatus} />
          </div>
          <div>
            <span className="text-muted-foreground">Trial ate:</span>{" "}
            <span className="text-foreground">
              {clinic.trialEndsAt ? formatDate(clinic.trialEndsAt) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Acoes</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleAction("extend_trial", { days: 14 })}
            disabled={actionLoading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Estender trial
          </button>
          {clinic.isActive ? (
            <button
              onClick={() => handleAction("deactivate")}
              disabled={actionLoading}
              className="px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Desativar
            </button>
          ) : (
            <button
              onClick={() => handleAction("reactivate")}
              disabled={actionLoading}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Reativar
            </button>
          )}
        </div>
      </div>

      {/* Usage stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6 flex items-center gap-4">
          <Users className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-2xl font-bold text-foreground">{clinic._count.patients}</p>
            <p className="text-sm text-muted-foreground">Pacientes</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl shadow-sm p-6 flex items-center gap-4">
          <Calendar className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-2xl font-bold text-foreground">{clinic._count.appointments}</p>
            <p className="text-sm text-muted-foreground">Agendamentos</p>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Usuarios</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Nome
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Papel
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Criado em
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clinic.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum usuario
                  </td>
                </tr>
              ) : (
                clinic.users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-sm text-foreground">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {user.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
