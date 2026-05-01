"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { useFinanceiroContext } from "../context/FinanceiroContext"
import { ExpenseForm } from "./components/ExpenseForm"
import { ExpenseTable } from "./components/ExpenseTable"
import { ExpenseSummaryCards } from "./components/ExpenseSummaryCards"
import { ExpenseToolbar } from "./components/ExpenseToolbar"
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
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")

  const loadData = useCallback(async () => {
    const params = new URLSearchParams()
    params.set("year", year.toString())
    if (month) params.set("month", month.toString())
    if (statusFilter) params.set("status", statusFilter)
    if (categoryFilter) params.set("categoryId", categoryFilter)

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
  }, [year, month, statusFilter, categoryFilter])

  useEffect(() => { loadData() }, [loadData])

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

  // Inline patch (used by the table for fornecedor/categoria auto-save).
  // Optimistically updates local state so the row reflects the change
  // immediately; rolls back if the API rejects the patch.
  async function handleInlinePatch(
    id: string,
    patch: { supplierName?: string | null; categoryId?: string | null }
  ) {
    const previous = expenses.find((e) => e.id === id)
    if (!previous) return

    const nextCategory =
      patch.categoryId === undefined
        ? previous.category
        : patch.categoryId === null
          ? null
          : categories.find((c) => c.id === patch.categoryId) ?? previous.category

    setExpenses((list) =>
      list.map((e) =>
        e.id === id
          ? {
              ...e,
              supplierName: patch.supplierName === undefined ? e.supplierName : patch.supplierName,
              category: nextCategory,
            }
          : e
      )
    )

    try {
      const res = await fetch(`/api/financeiro/despesas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erro ao salvar")
      }
      toast.success("Salvo")
    } catch (error) {
      // revert
      setExpenses((list) => list.map((e) => (e.id === id ? previous : e)))
      toast.error(error instanceof Error ? error.message : "Erro ao salvar")
      throw error
    }
  }

  // Client-side description search filter
  const filteredExpenses = searchQuery
    ? expenses.filter((e) => {
        const q = searchQuery.toLowerCase()
        return (
          e.description.toLowerCase().includes(q) ||
          (e.supplierName?.toLowerCase().includes(q) ?? false) ||
          (e.category?.name.toLowerCase().includes(q) ?? false)
        )
      })
    : expenses

  const totals = filteredExpenses.reduce(
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
      <ExpenseToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        categories={categories}
        onNewExpense={() => { setEditingExpense(null); setShowForm(true) }}
      />

      {/* Summary Cards */}
      <ExpenseSummaryCards totals={totals} formatCurrency={formatCurrency} />

      {/* Expense Table */}
      <ExpenseTable
        expenses={filteredExpenses}
        categories={categories}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        onPay={handlePay}
        onEdit={(expense) => { setEditingExpense(expense); setShowForm(true) }}
        onDelete={handleDelete}
        onPatch={handleInlinePatch}
      />

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
