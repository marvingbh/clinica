"use client"

import { useState } from "react"
import { toast } from "sonner"
import { X } from "lucide-react"
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

export function RecurrenceForm({
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
