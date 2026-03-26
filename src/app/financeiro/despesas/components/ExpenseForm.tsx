"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface Category {
  id: string
  name: string
  color: string
}

interface ExpenseFormProps {
  categories: Category[]
  expense?: {
    id: string
    description: string
    supplierName: string | null
    categoryId: string | null
    amount: number
    dueDate: string
    paymentMethod: string | null
    notes: string | null
  }
  onClose: () => void
}

export function ExpenseForm({ categories, expense, onClose }: ExpenseFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState(expense?.description ?? "")
  const [supplierName, setSupplierName] = useState(expense?.supplierName ?? "")
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "")
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "")
  const [dueDate, setDueDate] = useState(expense?.dueDate ?? "")
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? "")
  const [notes, setNotes] = useState(expense?.notes ?? "")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const body = {
        description,
        supplierName: supplierName || null,
        categoryId: categoryId || null,
        amount: parseFloat(amount),
        dueDate,
        paymentMethod: paymentMethod || null,
        notes: notes || null,
      }

      const url = expense
        ? `/api/financeiro/despesas/${expense.id}`
        : "/api/financeiro/despesas"

      const res = await fetch(url, {
        method: expense ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao salvar despesa")
      }

      toast.success(expense ? "Despesa atualizada" : "Despesa criada")
      router.refresh()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Descrição *</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          className="w-full rounded-md border border-input px-3 py-2 text-sm"
          placeholder="Ex: Aluguel escritório"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Fornecedor</label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="Ex: Imobiliária ABC"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Categoria</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-md border border-input px-3 py-2 text-sm"
          >
            <option value="">Sem categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full rounded-md border border-input px-3 py-2 text-sm"
            placeholder="0,00"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Vencimento *</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className="w-full rounded-md border border-input px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Forma de pagamento</label>
        <input
          type="text"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full rounded-md border border-input px-3 py-2 text-sm"
          placeholder="Ex: PIX, Boleto, Cartão"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Observações</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Salvando..." : expense ? "Atualizar" : "Criar"}
        </button>
      </div>
    </form>
  )
}
