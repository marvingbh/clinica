"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, RefreshCw, Check, X } from "lucide-react"
import { ExpenseStatusBadge } from "../components/ExpenseStatusBadge"

interface DebitTransaction {
  id: string
  date: string
  amount: number
  description: string
  suggestion: {
    categoryId: string | null
    categoryName: string | null
    supplierName: string | null
    confidence: string
  } | null
}

interface Category {
  id: string
  name: string
  color: string
}

export default function InterImportPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<DebitTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loaded, setLoaded] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)

  const loadTransactions = useCallback(async () => {
    const [txRes, catRes] = await Promise.all([
      fetch("/api/financeiro/conciliacao/debit-transactions"),
      fetch("/api/financeiro/despesas/categorias"),
    ])
    if (txRes.ok) setTransactions(await txRes.json())
    if (catRes.ok) {
      const cats = await catRes.json()
      setCategories(cats.map((c: Category & { _count?: unknown }) => ({ id: c.id, name: c.name, color: c.color })))
    }
    setLoaded(true)
  }, [])

  useState(() => { loadTransactions() })

  async function handleFetchFromInter() {
    setFetching(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao buscar transações")
      }
      const data = await res.json()
      toast.success(`${data.debitsFetched} débitos e ${data.creditsFetched} créditos importados`)
      loadTransactions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar do Inter")
    } finally {
      setFetching(false)
    }
  }

  async function handleCreateExpense(tx: DebitTransaction) {
    setCreating(tx.id)
    try {
      // Create expense from this transaction
      const res = await fetch("/api/financeiro/despesas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: tx.description,
          supplierName: tx.suggestion?.supplierName ?? null,
          categoryId: tx.suggestion?.categoryId ?? null,
          amount: tx.amount,
          dueDate: tx.date.split("T")[0],
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const expense = await res.json()

      // Mark as paid and link to bank transaction
      await fetch(`/api/financeiro/despesas/${expense.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: tx.date }),
      })

      // Link transaction to expense
      await fetch("/api/financeiro/conciliacao/match-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: tx.id, expenseId: expense.id }),
      })

      toast.success("Despesa criada e vinculada")
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar despesa")
    } finally {
      setCreating(null)
    }
  }

  async function handleDismiss(txId: string) {
    const res = await fetch("/api/financeiro/conciliacao/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: txId, reason: "PERSONAL_EXPENSE" }),
    })
    if (res.ok) {
      toast.success("Transação ignorada")
      setTransactions((prev) => prev.filter((t) => t.id !== txId))
    }
  }

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR", { timeZone: "UTC" })

  const confidenceLabel = (c: string) => {
    if (c === "HIGH") return { text: "Alta", className: "bg-green-100 text-green-700" }
    if (c === "MEDIUM") return { text: "Média", className: "bg-yellow-100 text-yellow-700" }
    return { text: "Baixa", className: "bg-gray-100 text-gray-600" }
  }

  if (!loaded) return <div className="text-sm text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Importar Despesas do Inter</h2>
        <button
          onClick={handleFetchFromInter}
          disabled={fetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
          {fetching ? "Buscando..." : "Buscar Transações"}
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Transações de débito do Banco Inter que ainda não foram vinculadas a despesas.
        Clique em &quot;Criar Despesa&quot; para registrar ou &quot;Ignorar&quot; para descartar.
      </p>

      {transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p>Nenhuma transação de débito pendente</p>
          <p className="text-xs mt-1">Clique em &quot;Buscar Transações&quot; para importar do Inter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{formatDate(tx.date)}</span>
                  <span className="text-lg font-semibold text-red-600">{formatCurrency(tx.amount)}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate" title={tx.description}>
                  {tx.description}
                </p>
                {tx.suggestion && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceLabel(tx.suggestion.confidence).className}`}>
                      {tx.suggestion.categoryName ?? "Sem categoria"} — {confidenceLabel(tx.suggestion.confidence).text}
                    </span>
                    {tx.suggestion.supplierName && (
                      <span className="text-xs text-muted-foreground">
                        Fornecedor: {tx.suggestion.supplierName}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleCreateExpense(tx)}
                  disabled={creating === tx.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {creating === tx.id ? "Criando..." : "Criar Despesa"}
                </button>
                <button
                  onClick={() => handleDismiss(tx.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  <X className="h-3.5 w-3.5" /> Ignorar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
