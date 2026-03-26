"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { Plus, Pencil } from "lucide-react"
import { RecurrenceForm } from "./components/RecurrenceForm"
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

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (value: string | number) =>
    Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "\u2014"
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
                  <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">{rec.supplierName || "\u2014"}</td>
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
