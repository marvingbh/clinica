"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Users, Calendar, Pencil, X } from "lucide-react"
import { StatusBadge, formatDate } from "@/app/superadmin/components/StatusBadge"

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

interface PlanOption {
  id: string
  name: string
  priceInCents: number
}

const SUBSCRIPTION_STATUSES = ["trialing", "active", "canceled", "past_due"] as const

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

export default function SuperAdminClinicDetailPage() {
  const params = useParams()
  const clinicId = params.id as string

  const [clinic, setClinic] = useState<ClinicDetail | null>(null)
  const [error, setError] = useState("")
  const [actionLoading, setActionLoading] = useState(false)
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [editingSubscription, setEditingSubscription] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("")
  const [selectedTrialEndsAt, setSelectedTrialEndsAt] = useState("")

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

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/plans")
      if (res.ok) {
        const data = await res.json()
        setPlans(data.plans)
      }
    } catch {
      // Plans fetch is non-critical
    }
  }, [])

  useEffect(() => {
    fetchClinic()
    fetchPlans()
  }, [fetchClinic, fetchPlans])

  function startEditSubscription() {
    if (!clinic) return
    setSelectedPlanId(clinic.plan?.id || "")
    setSelectedStatus(clinic.subscriptionStatus)
    setSelectedTrialEndsAt(clinic.trialEndsAt ? clinic.trialEndsAt.slice(0, 10) : "")
    setEditingSubscription(true)
  }

  async function saveSubscription() {
    await handleAction("update_subscription", {
      planId: selectedPlanId || null,
      subscriptionStatus: selectedStatus,
      trialEndsAt: selectedTrialEndsAt || null,
    })
    setEditingSubscription(false)
  }

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Assinatura</h2>
          {!editingSubscription && (
            <button
              onClick={startEditSubscription}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          )}
        </div>

        {editingSubscription ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Plano</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Nenhum</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} (R$ {(plan.priceInCents / 100).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Status</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {SUBSCRIPTION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Trial ate</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={selectedTrialEndsAt}
                    onChange={(e) => setSelectedTrialEndsAt(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                  {selectedTrialEndsAt && (
                    <button
                      onClick={() => setSelectedTrialEndsAt("")}
                      className="p-2 text-muted-foreground hover:text-foreground"
                      title="Limpar data"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveSubscription}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Salvar
              </button>
              <button
                onClick={() => setEditingSubscription(false)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
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
        )}
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
            Estender trial (+14 dias)
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
