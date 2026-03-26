"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { Building2, RefreshCw, Check, X, Repeat, CheckCircle2, Calendar, Clock } from "lucide-react"

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

interface AutoReconciledItem {
  transactionId: string
  expenseId: string
  amount: number
  reason: string
}

interface Suggestion {
  transactionId: string
  expenseId: string
  amount: number
  reason: string
  transaction: { id: string; date: string; amount: string; description: string } | null
  expense: { id: string; description: string; dueDate: string; amount: string } | null
}

interface ScheduledPayment {
  codigoTransacao: string
  dataVencimento: string
  valor: number
  descricao: string
  alreadyImported: boolean
  suggestion: { categoryId: string | null; categoryName: string | null; supplierName: string | null; confidence: string } | null
}

export default function InterImportPage() {
  const [transactions, setTransactions] = useState<DebitTransaction[]>([])
  const [autoReconciled, setAutoReconciled] = useState<AutoReconciledItem[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [importingScheduled, setImportingScheduled] = useState(false)

  const loadTransactions = useCallback(async () => {
    const res = await fetch("/api/financeiro/conciliacao/debit-transactions")
    if (res.ok) setTransactions(await res.json())
    setLoaded(true)
  }, [])

  useState(() => { loadTransactions() })

  async function handleFetchFromInter() {
    setFetching(true)
    try {
      // 1. Fetch transactions from Inter
      const fetchRes = await fetch("/api/financeiro/conciliacao/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!fetchRes.ok) throw new Error((await fetchRes.json()).error || "Erro ao buscar transações")
      const fetchData = await fetchRes.json()

      // 2. Run auto-reconciliation
      const reconcileRes = await fetch("/api/financeiro/despesas/auto-reconcile", { method: "POST" })
      const reconcileData = reconcileRes.ok ? await reconcileRes.json() : { autoReconciled: 0, suggestions: [] }

      setAutoReconciled(reconcileData.autoReconciled > 0 ? Array(reconcileData.autoReconciled).fill(null) : [])
      setSuggestions(reconcileData.suggestions || [])

      const parts = []
      if (fetchData.debitsFetched > 0) parts.push(`${fetchData.debitsFetched} débitos importados`)
      if (reconcileData.autoReconciled > 0) parts.push(`${reconcileData.autoReconciled} reconciliados automaticamente`)
      if (reconcileData.suggestions?.length > 0) parts.push(`${reconcileData.suggestions.length} sugestões`)
      toast.success(parts.join(", ") || "Nenhum débito encontrado")

      // 3. Reload unmatched transactions
      loadTransactions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar do Inter")
    } finally {
      setFetching(false)
    }
  }

  async function handleFetchScheduled() {
    try {
      const res = await fetch("/api/financeiro/despesas/scheduled")
      if (!res.ok) {
        toast.error("Erro ao buscar agendamentos")
        return
      }
      const data = await res.json()
      if (data.unavailable) {
        toast.info("Pagamentos agendados não disponível para sua conta Inter")
        return
      }
      setScheduledPayments(data.payments?.filter((p: ScheduledPayment) => !p.alreadyImported) ?? [])
      toast.success(`${data.pending ?? 0} pagamento(s) agendado(s) encontrado(s)`)
    } catch {
      toast.error("Erro ao buscar pagamentos agendados")
    }
  }

  async function handleImportScheduled(payment: ScheduledPayment) {
    setCreating(payment.codigoTransacao)
    try {
      const res = await fetch("/api/financeiro/despesas/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payments: [{
            codigoTransacao: payment.codigoTransacao,
            dataVencimento: payment.dataVencimento,
            valor: payment.valor,
            descricao: payment.descricao,
            categoryId: payment.suggestion?.categoryId ?? null,
            supplierName: payment.suggestion?.supplierName ?? null,
          }],
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Despesa criada a partir do agendamento")
      setScheduledPayments((prev) => prev.filter((p) => p.codigoTransacao !== payment.codigoTransacao))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar agendamento")
    } finally {
      setCreating(null)
    }
  }

  async function handleImportAllScheduled() {
    setImportingScheduled(true)
    try {
      const res = await fetch("/api/financeiro/despesas/scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payments: scheduledPayments.map((p) => ({
            codigoTransacao: p.codigoTransacao,
            dataVencimento: p.dataVencimento,
            valor: p.valor,
            descricao: p.descricao,
            categoryId: p.suggestion?.categoryId ?? null,
            supplierName: p.suggestion?.supplierName ?? null,
          })),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      toast.success(`${data.created} despesas criadas a partir de agendamentos`)
      setScheduledPayments([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar agendamentos")
    } finally {
      setImportingScheduled(false)
    }
  }

  async function handleCreateExpense(tx: DebitTransaction) {
    setCreating(tx.id)
    try {
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

      await fetch(`/api/financeiro/despesas/${expense.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: tx.date }),
      })

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

  async function handleCreateWithRecurrence(tx: DebitTransaction) {
    setCreating(tx.id)
    try {
      const txDate = new Date(tx.date)
      const res = await fetch("/api/financeiro/despesas/create-with-recurrence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: tx.id,
          description: tx.description,
          supplierName: tx.suggestion?.supplierName ?? null,
          categoryId: tx.suggestion?.categoryId ?? null,
          amount: tx.amount,
          dueDate: tx.date.split("T")[0],
          frequency: "MONTHLY",
          dayOfMonth: txDate.getUTCDate(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      toast.success("Despesa recorrente criada — próximos meses serão gerados automaticamente")
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar recorrência")
    } finally {
      setCreating(null)
    }
  }

  async function handleConfirmSuggestion(s: Suggestion) {
    try {
      await fetch("/api/financeiro/conciliacao/match-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: s.transactionId, expenseId: s.expenseId }),
      })
      toast.success("Despesa vinculada")
      setSuggestions((prev) => prev.filter((x) => x.transactionId !== s.transactionId))
      loadTransactions()
    } catch {
      toast.error("Erro ao vincular")
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

  const formatCurrency = (value: number | string) =>
    Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

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
        <button
          onClick={handleFetchScheduled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          <Clock className="h-4 w-4" /> Agendamentos
        </button>
      </div>

      {/* Auto-reconciled notification */}
      {autoReconciled.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{autoReconciled.length} despesa(s) recorrente(s) reconciliada(s) automaticamente</span>
        </div>
      )}

      {/* Suggestions from auto-reconcile */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Sugestões de vínculo</h3>
          {suggestions.map((s) => (
            <div key={s.transactionId} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{s.transaction?.description}</span>
                  {" → "}
                  <span className="text-muted-foreground">{s.expense?.description}</span>
                </p>
                <p className="text-xs text-muted-foreground">{s.reason}</p>
              </div>
              <button
                onClick={() => handleConfirmSuggestion(s)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200 shrink-0"
              >
                <Check className="h-3.5 w-3.5" /> Confirmar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Scheduled payments from Inter */}
      {scheduledPayments.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-600" />
              Pagamentos Agendados ({scheduledPayments.length})
            </h3>
            <button
              onClick={handleImportAllScheduled}
              disabled={importingScheduled}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
            >
              <Calendar className="h-3.5 w-3.5" />
              {importingScheduled ? "Importando..." : "Importar Todos"}
            </button>
          </div>
          {scheduledPayments.map((p) => (
            <div key={p.codigoTransacao} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{formatDate(p.dataVencimento)}</span>
                  <span className="text-lg font-semibold text-amber-700">{formatCurrency(p.valor)}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{p.descricao}</p>
                {p.suggestion && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceLabel(p.suggestion.confidence).className}`}>
                    {p.suggestion.categoryName ?? "Sem categoria"}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleImportScheduled(p)}
                disabled={creating === p.codigoTransacao}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 shrink-0"
              >
                <Check className="h-3.5 w-3.5" />
                {creating === p.codigoTransacao ? "Importando..." : "Criar Despesa"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Unmatched DEBIT transactions */}
      <p className="text-sm text-muted-foreground">
        Transações de débito não vinculadas. Crie uma despesa avulsa ou recorrente.
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
                  onClick={() => handleCreateWithRecurrence(tx)}
                  disabled={creating === tx.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                >
                  <Repeat className="h-3.5 w-3.5" /> Recorrente
                </button>
                <button
                  onClick={() => handleCreateExpense(tx)}
                  disabled={creating === tx.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Avulsa
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
