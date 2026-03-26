"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import type { ExpenseFrequency } from "@prisma/client"

interface Recurrence {
  id: string
  description: string
  supplierName: string | null
  amount: string
  frequency: ExpenseFrequency
  dayOfMonth: number
  active: boolean
  startDate: string
  endDate: string | null
}

export default function RecorrenciasPage() {
  const router = useRouter()
  const [recurrences, setRecurrences] = useState<Recurrence[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [description, setDescription] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [amount, setAmount] = useState("")
  const [frequency, setFrequency] = useState<ExpenseFrequency>("MONTHLY")
  const [dayOfMonth, setDayOfMonth] = useState("1")
  const [startDate, setStartDate] = useState("")
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    const res = await fetch("/api/financeiro/despesas/recorrencias")
    if (res.ok) setRecurrences(await res.json())
    setLoaded(true)
  }, [])

  useState(() => { loadData() })

  const formatCurrency = (value: string | number) =>
    Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/financeiro/despesas/recorrencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          supplierName: supplierName || null,
          amount: parseFloat(amount),
          frequency,
          dayOfMonth: parseInt(dayOfMonth),
          startDate,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Recorrência criada")
      setShowForm(false)
      setDescription(""); setSupplierName(""); setAmount(""); setStartDate("")
      loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(id: string, active: boolean) {
    const res = await fetch(`/api/financeiro/despesas/recorrencias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    })
    if (res.ok) {
      toast.success(active ? "Recorrência desativada" : "Recorrência ativada")
      loadData()
    }
  }

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Despesas Recorrentes</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nova Recorrência
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Descrição *</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required className="w-full rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fornecedor</label>
              <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Frequência</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)} className="w-full rounded-md border border-input px-3 py-2 text-sm">
                <option value="MONTHLY">Mensal</option>
                <option value="YEARLY">Anual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Dia do mês</label>
              <input type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Início *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full rounded-md border border-input px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-md border border-input">Cancelar</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              {saving ? "Salvando..." : "Criar"}
            </button>
          </div>
        </form>
      )}

      {recurrences.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhuma recorrência cadastrada</p>
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
                <th className="text-center px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recurrences.map((rec) => (
                <tr key={rec.id} className={`hover:bg-muted/30 ${!rec.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2">{rec.description}</td>
                  <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">{rec.supplierName || "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(rec.amount)}</td>
                  <td className="px-4 py-2 text-center">{rec.frequency === "MONTHLY" ? "Mensal" : "Anual"}</td>
                  <td className="px-4 py-2 text-center">{rec.dayOfMonth}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rec.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {rec.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleToggle(rec.id, rec.active)}
                      className={`text-xs px-2 py-1 rounded ${rec.active ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                    >
                      {rec.active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
