"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { Plus, Pencil, X } from "lucide-react"
import type { ExpenseFrequency } from "@prisma/client"

interface Recurrence {
  id: string
  description: string
  supplierName: string | null
  categoryId: string | null
  amount: string
  frequency: ExpenseFrequency
  dayOfMonth: number
  active: boolean
  startDate: string
  endDate: string | null
}

interface Category {
  id: string
  name: string
  color: string
}

export default function RecorrenciasPage() {
  const [recurrences, setRecurrences] = useState<Recurrence[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadData = useCallback(async () => {
    const [recRes, catRes] = await Promise.all([
      fetch("/api/financeiro/despesas/recorrencias"),
      fetch("/api/financeiro/despesas/categorias"),
    ])
    if (recRes.ok) setRecurrences(await recRes.json())
    if (catRes.ok) {
      const cats = await catRes.json()
      setCategories(cats.map((c: Category & { _count?: unknown }) => ({ id: c.id, name: c.name, color: c.color })))
    }
    setLoaded(true)
  }, [])

  useState(() => { loadData() })

  const formatCurrency = (value: string | number) =>
    Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    const [y, m, d] = dateStr.split("T")[0].split("-")
    return `${d}/${m}/${y}`
  }

  const activeRecurrences = recurrences.filter((r) => r.active)
  const inactiveRecurrences = recurrences.filter((r) => !r.active)

  const totalMonthly = activeRecurrences
    .filter((r) => r.frequency === "MONTHLY")
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const totalYearly = activeRecurrences
    .filter((r) => r.frequency === "YEARLY")
    .reduce((sum, r) => sum + Number(r.amount), 0)

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Despesas Recorrentes</h2>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nova Recorrência
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total mensal fixo</p>
          <p className="text-lg font-semibold text-red-600">{formatCurrency(totalMonthly)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total anual fixo</p>
          <p className="text-lg font-semibold text-red-600">{formatCurrency(totalYearly)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Recorrências ativas</p>
          <p className="text-lg font-semibold">{activeRecurrences.length}</p>
        </div>
      </div>

      {/* Create/Edit Form */}
      {(showCreate || editingId) && (
        <RecurrenceForm
          categories={categories}
          recurrence={editingId ? recurrences.find((r) => r.id === editingId) ?? null : null}
          onSave={() => { setShowCreate(false); setEditingId(null); loadData() }}
          onCancel={() => { setShowCreate(false); setEditingId(null) }}
        />
      )}

      {/* Active recurrences */}
      {activeRecurrences.length === 0 && !showCreate ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">Nenhuma recorrência cadastrada</p>
          <p className="text-sm">Despesas recorrentes como aluguel, energia e internet são geradas automaticamente todo mês</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Descrição</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Fornecedor</th>
                <th className="text-right px-4 py-2 font-medium">Valor</th>
                <th className="text-center px-4 py-2 font-medium">Frequência</th>
                <th className="text-center px-4 py-2 font-medium">Dia</th>
                <th className="text-center px-4 py-2 font-medium hidden md:table-cell">Fim</th>
                <th className="text-right px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activeRecurrences.map((rec) => (
                <tr key={rec.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2">{rec.description}</td>
                  <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">{rec.supplierName || "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(rec.amount)}</td>
                  <td className="px-4 py-2 text-center">{rec.frequency === "MONTHLY" ? "Mensal" : "Anual"}</td>
                  <td className="px-4 py-2 text-center">{rec.dayOfMonth}</td>
                  <td className="px-4 py-2 text-center hidden md:table-cell text-muted-foreground">{formatDate(rec.endDate)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditingId(rec.id); setShowCreate(false) }}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={async () => {
                          await fetch(`/api/financeiro/despesas/recorrencias/${rec.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ active: false }),
                          })
                          toast.success("Recorrência desativada")
                          loadData()
                        }}
                        className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                      >
                        Desativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inactive recurrences */}
      {inactiveRecurrences.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Inativas</h3>
          <div className="border rounded-lg overflow-hidden opacity-60">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {inactiveRecurrences.map((rec) => (
                  <tr key={rec.id}>
                    <td className="px-4 py-2">{rec.description}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(rec.amount)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={async () => {
                          await fetch(`/api/financeiro/despesas/recorrencias/${rec.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ active: true }),
                          })
                          toast.success("Recorrência reativada")
                          loadData()
                        }}
                        className="text-xs px-2 py-1 rounded bg-green-100 text-green-700"
                      >
                        Reativar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function RecurrenceForm({
  categories,
  recurrence,
  onSave,
  onCancel,
}: {
  categories: Category[]
  recurrence: Recurrence | null
  onSave: () => void
  onCancel: () => void
}) {
  const isEdit = !!recurrence
  const [description, setDescription] = useState(recurrence?.description ?? "")
  const [supplierName, setSupplierName] = useState(recurrence?.supplierName ?? "")
  const [categoryId, setCategoryId] = useState(recurrence?.categoryId ?? "")
  const [amount, setAmount] = useState(recurrence ? String(Number(recurrence.amount)) : "")
  const [frequency, setFrequency] = useState<ExpenseFrequency>(recurrence?.frequency ?? "MONTHLY")
  const [dayOfMonth, setDayOfMonth] = useState(String(recurrence?.dayOfMonth ?? 1))
  const [startDate, setStartDate] = useState(recurrence?.startDate?.split("T")[0] ?? "")
  const [endDate, setEndDate] = useState(recurrence?.endDate?.split("T")[0] ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        description,
        supplierName: supplierName || null,
        categoryId: categoryId || null,
        amount: parseFloat(amount),
        frequency,
        dayOfMonth: parseInt(dayOfMonth),
      }
      if (!isEdit) body.startDate = startDate
      if (endDate) body.endDate = endDate
      else if (isEdit) body.endDate = null

      const url = isEdit
        ? `/api/financeiro/despesas/recorrencias/${recurrence!.id}`
        : "/api/financeiro/despesas/recorrencias"

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(isEdit ? "Recorrência atualizada" : "Recorrência criada")
      onSave()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">{isEdit ? "Editar Recorrência" : "Nova Recorrência"}</h3>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Descrição *</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required className="w-full rounded-md border border-input px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fornecedor</label>
          <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Valor (R$) *</label>
          <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full rounded-md border border-input px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Categoria</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm">
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Frequência</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)} className="w-full rounded-md border border-input px-3 py-2 text-sm">
            <option value="MONTHLY">Mensal</option>
            <option value="YEARLY">Anual</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Dia do mês</label>
          <input type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm" />
        </div>
        {!isEdit && (
          <div>
            <label className="block text-xs font-medium mb-1">Início *</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full rounded-md border border-input px-3 py-2 text-sm" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Data de fim (opcional)</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm" placeholder="Sem data de fim" />
          <p className="text-xs text-muted-foreground mt-1">Deixe vazio para recorrência indefinida</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm rounded-md border border-input">Cancelar</button>
        <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          {saving ? "Salvando..." : isEdit ? "Atualizar" : "Criar"}
        </button>
      </div>
    </form>
  )
}
