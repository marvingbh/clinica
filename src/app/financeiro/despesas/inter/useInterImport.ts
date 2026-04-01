import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"

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

export type { DebitTransaction, Suggestion, ScheduledPayment }

export function useInterImport() {
  const [transactions, setTransactions] = useState<DebitTransaction[]>([])
  const [autoReconciled, setAutoReconciled] = useState<{ transactionId: string }[]>([])
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

  useEffect(() => { loadTransactions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function runAutoReconcile() {
    const reconcileRes = await fetch("/api/financeiro/despesas/auto-reconcile", { method: "POST" })
    if (!reconcileRes.ok) return { autoReconciled: 0, suggestions: [] }
    return reconcileRes.json()
  }

  async function handleFetchFromInter() {
    setFetching(true)
    try {
      const fetchRes = await fetch("/api/financeiro/conciliacao/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      if (!fetchRes.ok) throw new Error((await fetchRes.json()).error || "Erro ao buscar transações")
      const fetchData = await fetchRes.json()

      const reconcileData = await runAutoReconcile()

      setAutoReconciled(reconcileData.autoReconciled > 0 ? Array(reconcileData.autoReconciled).fill(null) : [])
      setSuggestions(reconcileData.suggestions || [])

      const parts = []
      if (fetchData.debitsFetched > 0) parts.push(`${fetchData.debitsFetched} débitos importados`)
      if (reconcileData.autoReconciled > 0) parts.push(`${reconcileData.autoReconciled} reconciliados automaticamente`)
      if (reconcileData.suggestions?.length > 0) parts.push(`${reconcileData.suggestions.length} sugestões`)
      toast.success(parts.join(", ") || "Nenhum débito encontrado")
      loadTransactions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar do Inter")
    } finally {
      setFetching(false)
    }
  }

  const [reconciling, setReconciling] = useState(false)

  async function handleReconcile() {
    setReconciling(true)
    try {
      const data = await runAutoReconcile()
      setAutoReconciled(data.autoReconciled > 0 ? Array(data.autoReconciled).fill(null) : [])
      setSuggestions(data.suggestions || [])

      const parts = []
      if (data.autoReconciled > 0) parts.push(`${data.autoReconciled} reconciliados automaticamente`)
      if (data.suggestions?.length > 0) parts.push(`${data.suggestions.length} sugestões`)
      toast.success(parts.join(", ") || "Nenhuma reconciliação encontrada")
      loadTransactions()
    } catch {
      toast.error("Erro ao reconciliar")
    } finally {
      setReconciling(false)
    }
  }

  async function handleFetchScheduled() {
    try {
      const res = await fetch("/api/financeiro/despesas/scheduled")
      if (!res.ok) { toast.error("Erro ao buscar agendamentos"); return }
      const data = await res.json()
      if (data.unavailable) { toast.info("Pagamentos agendados não disponível para sua conta Inter"); return }
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments: [{ codigoTransacao: payment.codigoTransacao, dataVencimento: payment.dataVencimento, valor: payment.valor, descricao: payment.descricao, categoryId: payment.suggestion?.categoryId ?? null, supplierName: payment.suggestion?.supplierName ?? null }] }),
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments: scheduledPayments.map((p) => ({ codigoTransacao: p.codigoTransacao, dataVencimento: p.dataVencimento, valor: p.valor, descricao: p.descricao, categoryId: p.suggestion?.categoryId ?? null, supplierName: p.suggestion?.supplierName ?? null })) }),
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: tx.description, supplierName: tx.suggestion?.supplierName ?? null, categoryId: tx.suggestion?.categoryId ?? null, amount: tx.amount, dueDate: tx.date.split("T")[0] }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const expense = await res.json()
      await fetch(`/api/financeiro/despesas/${expense.id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paidAt: tx.date }) })
      await fetch("/api/financeiro/conciliacao/match-expense", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: tx.id, expenseId: expense.id }) })
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: tx.id, description: tx.description, supplierName: tx.suggestion?.supplierName ?? null, categoryId: tx.suggestion?.categoryId ?? null, amount: tx.amount, dueDate: tx.date.split("T")[0], frequency: "MONTHLY", dayOfMonth: txDate.getUTCDate() }),
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
      await fetch("/api/financeiro/conciliacao/match-expense", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: s.transactionId, expenseId: s.expenseId }) })
      toast.success("Despesa vinculada")
      setSuggestions((prev) => prev.filter((x) => x.transactionId !== s.transactionId))
      loadTransactions()
    } catch {
      toast.error("Erro ao vincular")
    }
  }

  async function handleDismiss(txId: string) {
    const res = await fetch("/api/financeiro/conciliacao/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: txId, reason: "PERSONAL_EXPENSE" }) })
    if (res.ok) {
      toast.success("Transação ignorada")
      setTransactions((prev) => prev.filter((t) => t.id !== txId))
    }
  }

  return {
    transactions, autoReconciled, suggestions, scheduledPayments,
    loaded, fetching, creating, importingScheduled, reconciling,
    handleFetchFromInter, handleFetchScheduled,
    handleImportScheduled, handleImportAllScheduled,
    handleCreateExpense, handleCreateWithRecurrence,
    handleConfirmSuggestion, handleDismiss, handleReconcile,
  }
}
