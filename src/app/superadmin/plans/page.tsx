"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, X } from "lucide-react"
import { formatCurrency } from "@/app/superadmin/components/StatusBadge"

interface Plan {
  id: string
  name: string
  slug: string
  stripePriceId: string
  maxProfessionals: number
  priceInCents: number
  isActive: boolean
  createdAt: string
  _count: { clinics: number }
}

interface PlanFormData {
  name: string
  slug: string
  stripePriceId: string
  maxProfessionals: number
  priceInCents: number
}

const emptyForm: PlanFormData = {
  name: "",
  slug: "",
  stripePriceId: "",
  maxProfessionals: -1,
  priceInCents: 0,
}

export default function SuperAdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [form, setForm] = useState<PlanFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/plans")
      if (!res.ok) throw new Error("Erro ao carregar planos")
      const data = await res.json()
      setPlans(data.plans)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  function openCreateModal() {
    setEditingPlan(null)
    setForm(emptyForm)
    setFormError("")
    setShowModal(true)
  }

  function openEditModal(plan: Plan) {
    setEditingPlan(plan)
    setForm({
      name: plan.name,
      slug: plan.slug,
      stripePriceId: plan.stripePriceId,
      maxProfessionals: plan.maxProfessionals,
      priceInCents: plan.priceInCents,
    })
    setFormError("")
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingPlan(null)
    setForm(emptyForm)
    setFormError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError("")

    try {
      const url = editingPlan
        ? `/api/superadmin/plans/${editingPlan.id}`
        : "/api/superadmin/plans"
      const method = editingPlan ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao salvar plano")
      }

      closeModal()
      await fetchPlans()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Planos</h1>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Novo plano
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Nome
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Preco
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Max Profissionais
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Clinicas usando
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ativo
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum plano cadastrado
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {plan.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {plan.slug}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {formatCurrency(plan.priceInCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {plan.maxProfessionals === -1 ? "Ilimitado" : plan.maxProfessionals}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {plan._count.clinics}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          plan.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {plan.isActive ? "Sim" : "Nao"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEditModal(plan)}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={closeModal}
          />
          <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">
                {editingPlan ? "Editar plano" : "Novo plano"}
              </h2>
              <button
                onClick={closeModal}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3 mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Basic"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="basic"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Stripe Price ID
                </label>
                <input
                  type="text"
                  value={form.stripePriceId}
                  onChange={(e) => setForm({ ...form, stripePriceId: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="price_..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Max Profissionais
                </label>
                <input
                  type="number"
                  value={form.maxProfessionals}
                  onChange={(e) =>
                    setForm({ ...form, maxProfessionals: parseInt(e.target.value) || 0 })
                  }
                  required
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="-1 para ilimitado"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use -1 para ilimitado
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Preco (centavos)
                </label>
                <input
                  type="number"
                  value={form.priceInCents}
                  onChange={(e) =>
                    setForm({ ...form, priceInCents: parseInt(e.target.value) || 0 })
                  }
                  required
                  min={0}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="9900"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ex: 9900 = R$ 99,00
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-input bg-background text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {saving ? "Salvando..." : editingPlan ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
