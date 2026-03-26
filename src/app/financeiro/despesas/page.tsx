"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Upload, Building2, Repeat } from "lucide-react"
import Link from "next/link"
import { useFinanceiroContext } from "../context/FinanceiroContext"
import { ExpenseStatusBadge } from "./components/ExpenseStatusBadge"
import { ExpenseForm } from "./components/ExpenseForm"
import type { ExpenseStatus } from "@prisma/client"

interface Expense {
  id: string
  description: string
  supplierName: string | null
  amount: string
  dueDate: string
  paidAt: string | null
  status: ExpenseStatus
  paymentMethod: string | null
  category: { id: string; name: string; color: string } | null
}

interface Category {
  id: string
  name: string
  color: string
}

export default function DespesasPage() {
  const { year, month } = useFinanceiroContext()
  const router = useRouter()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("")

  const loadData = useCallback(async () => {
    const params = new URLSearchParams()
    params.set("year", year.toString())
    if (month) params.set("month", month.toString())
    if (statusFilter) params.set("status", statusFilter)

    const [expRes, catRes] = await Promise.all([
      fetch(`/api/financeiro/despesas?${params}`),
      fetch("/api/financeiro/despesas/categorias"),
    ])

    if (expRes.ok) setExpenses(await expRes.json())
    if (catRes.ok) {
      const cats = await catRes.json()
      setCategories(cats.map((c: Category & { _count?: unknown }) => ({ id: c.id, name: c.name, color: c.color })))
    }
    setLoaded(true)
  }, [year, month, statusFilter])

  // Load data on mount and when filters change
  useState(() => { loadData() })

  const formatCurrency = (value: string | number) =>
    Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR", { timeZone: "UTC" })

  async function handlePay(id: string) {
    const res = await fetch(`/api/financeiro/despesas/${id}/pay`, { method: "POST" })
    if (res.ok) {
      toast.success("Despesa marcada como paga")
      loadData()
    } else {
      const err = await res.json()
      toast.error(err.error || "Erro ao marcar como paga")
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return
    const res = await fetch(`/api/financeiro/despesas/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Despesa excluída")
      loadData()
    }
  }

  const totals = expenses.reduce(
    (acc, e) => {
      const amt = Number(e.amount)
      if (e.status === "OPEN") acc.open += amt
      if (e.status === "OVERDUE") acc.overdue += amt
      if (e.status === "PAID") acc.paid += amt
      acc.total += amt
      return acc
    },
    { open: 0, overdue: 0, paid: 0, total: 0 }
  )

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setTimeout(loadData, 0) }}
            className="rounded-md border border-input px-3 py-1.5 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="OPEN">Em aberto</option>
            <option value="OVERDUE">Vencido</option>
            <option value="PAID">Pago</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Link
            href="/financeiro/despesas/recorrencias"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted"
          >
            <Repeat className="h-4 w-4" /> Recorrentes
          </Link>
          <Link
            href="/financeiro/despesas/import"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted"
          >
            <Upload className="h-4 w-4" /> Importar Extrato
          </Link>
          <Link
            href="/financeiro/despesas/inter"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input hover:bg-muted"
          >
            <Building2 className="h-4 w-4" /> Importar do Inter
          </Link>
          <button
            onClick={() => { setEditingExpense(null); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Nova Despesa
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Em aberto</p>
          <p className="text-lg font-semibold text-blue-600">{formatCurrency(totals.open)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Vencido</p>
          <p className="text-lg font-semibold text-red-600">{formatCurrency(totals.overdue)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Pago</p>
          <p className="text-lg font-semibold text-green-600">{formatCurrency(totals.paid)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.total)}</p>
        </div>
      </div>

      {/* Expense Table */}
      {expenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">Nenhuma despesa encontrada</p>
          <p className="text-sm">Cadastre sua primeira despesa clicando em &quot;Nova Despesa&quot;</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Vencimento</th>
                <th className="text-left px-4 py-2 font-medium">Descrição</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Fornecedor</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Categoria</th>
                <th className="text-right px-4 py-2 font-medium">Valor</th>
                <th className="text-center px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2">{formatDate(expense.dueDate)}</td>
                  <td className="px-4 py-2">{expense.description}</td>
                  <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">{expense.supplierName || "—"}</td>
                  <td className="px-4 py-2 hidden md:table-cell">
                    {expense.category ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: expense.category.color }} />
                        {expense.category.name}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-2 text-center"><ExpenseStatusBadge status={expense.status} /></td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {(expense.status === "OPEN" || expense.status === "OVERDUE") && (
                        <button
                          onClick={() => handlePay(expense.id)}
                          className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                        >
                          Pagar
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingExpense(expense)
                          setShowForm(true)
                        }}
                        className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingExpense ? "Editar Despesa" : "Nova Despesa"}
            </h2>
            <ExpenseForm
              categories={categories}
              expense={editingExpense ? {
                id: editingExpense.id,
                description: editingExpense.description,
                supplierName: editingExpense.supplierName,
                categoryId: editingExpense.category?.id ?? null,
                amount: Number(editingExpense.amount),
                dueDate: editingExpense.dueDate.split("T")[0],
                paymentMethod: editingExpense.paymentMethod,
                notes: null,
              } : undefined}
              onClose={() => { setShowForm(false); loadData() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
