"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { CheckIcon, Loader2Icon, EyeIcon, EyeOffIcon } from "lucide-react"
import { TransactionCard } from "./TransactionCard"
import { UnmatchedTransactionCard } from "./UnmatchedTransactionCard"
import { ReconciledTransactionCard } from "./ReconciledTransactionCard"
import { CreateInvoiceSheet } from "./CreateInvoiceSheet"
import type { Transaction, CreatedInvoiceInfo } from "./types"

interface TransactionListProps {
  transactions: Transaction[]
  onReconciled: () => void
  showReconciled: boolean
  onToggleReconciled: () => void
}

type SelectionEntry = { invoiceId: string; amount: number }
type Selections = Record<string, SelectionEntry[]>

export function TransactionList({ transactions, onReconciled, showReconciled, onToggleReconciled }: TransactionListProps) {
  const [selections, setSelections] = useState<Selections>(() => {
    const initial: Selections = {}
    for (const tx of transactions) {
      if (tx.isFullyReconciled) continue
      if (tx.groupCandidates && tx.groupCandidates.length > 0) {
        const group = tx.groupCandidates[0]
        initial[tx.id] = group.invoices.map(i => ({
          invoiceId: i.invoiceId,
          amount: Math.min(tx.remainingAmount, i.remainingAmount ?? i.totalAmount),
        }))
      } else if (tx.candidates.length > 0 && tx.candidates[0].confidence !== "LOW") {
        const c = tx.candidates[0]
        initial[tx.id] = [{
          invoiceId: c.invoiceId,
          amount: Math.min(tx.remainingAmount, c.remainingAmount ?? c.totalAmount),
        }]
      }
    }
    return initial
  })
  const [reconciling, setReconciling] = useState(false)
  const [reconcilingTxId, setReconcilingTxId] = useState<string | null>(null)
  const [createSheetTxId, setCreateSheetTxId] = useState<string | null>(null)
  const [addedInvoices, setAddedInvoices] = useState<Record<string, CreatedInvoiceInfo[]>>({})

  const unreconciledTx = transactions.filter(tx => !tx.isFullyReconciled)
  const reconciledTx = transactions.filter(tx => tx.isFullyReconciled)
  const withMatches = unreconciledTx.filter(tx =>
    tx.candidates.length > 0 || (tx.groupCandidates && tx.groupCandidates.length > 0)
  )
  const withoutMatches = unreconciledTx.filter(tx =>
    tx.candidates.length === 0 && (!tx.groupCandidates || tx.groupCandidates.length === 0)
  )
  const selectedCount = Object.values(selections).reduce((sum, entries) => sum + entries.length, 0)

  const toggleInvoice = (txId: string, invoiceId: string, amount?: number) => {
    setSelections(prev => {
      const current = prev[txId] || []
      const existing = current.find(e => e.invoiceId === invoiceId)
      if (existing) {
        const next = current.filter(e => e.invoiceId !== invoiceId)
        if (next.length === 0) {
          const { [txId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [txId]: next }
      }
      const tx = transactions.find(t => t.id === txId)
      const txRemaining = tx?.remainingAmount ?? 0
      // Look up invoice amount from candidates if not explicitly provided
      const invoiceAmount = amount
        ?? tx?.candidates.find(c => c.invoiceId === invoiceId)?.remainingAmount
        ?? tx?.groupCandidates?.flatMap(g => g.invoices).find(i => i.invoiceId === invoiceId)?.totalAmount
      const defaultAmount = invoiceAmount ? Math.min(txRemaining, invoiceAmount) : txRemaining
      return { ...prev, [txId]: [...current, { invoiceId, amount: defaultAmount }] }
    })
  }

  const updateAmount = (txId: string, invoiceId: string, amount: number) => {
    setSelections(prev => {
      const current = prev[txId] || []
      return {
        ...prev,
        [txId]: current.map(e => e.invoiceId === invoiceId ? { ...e, amount } : e),
      }
    })
  }

  const selectGroup = (txId: string, invoiceIds: string[]) => {
    setSelections(prev => {
      const current = prev[txId] || []
      const allSelected = invoiceIds.every(id => current.some(e => e.invoiceId === id))
      if (allSelected) {
        const remaining = current.filter(e => !invoiceIds.includes(e.invoiceId))
        if (remaining.length === 0) {
          const { [txId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [txId]: remaining }
      }
      const tx = transactions.find(t => t.id === txId)
      return {
        ...prev,
        [txId]: invoiceIds.map(invoiceId => ({
          invoiceId,
          amount: tx?.candidates.find(c => c.invoiceId === invoiceId)?.remainingAmount
            ?? tx?.groupCandidates?.flatMap(g => g.invoices).find(i => i.invoiceId === invoiceId)?.remainingAmount
            ?? tx?.remainingAmount ?? 0,
        })),
      }
    })
  }

  const handleInvoiceCreated = (txId: string, invoice: CreatedInvoiceInfo) => {
    const tx = transactions.find(t => t.id === txId)
    const amount = tx?.remainingAmount ?? invoice.totalAmount
    setSelections(prev => ({
      ...prev,
      [txId]: [...(prev[txId] || []), { invoiceId: invoice.id, amount }],
    }))
    setAddedInvoices(prev => ({ ...prev, [txId]: [...(prev[txId] || []), invoice] }))
    setCreateSheetTxId(null)
  }

  const reconcileMatches = async (links: Array<{ transactionId: string; invoiceId: string; amount: number }>) => {
    const res = await fetch("/api/financeiro/conciliacao/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Erro ao conciliar")
    }
    return res.json()
  }

  const handleReconcile = async () => {
    if (selectedCount === 0) return
    setReconciling(true)
    try {
      const links = Object.entries(selections).flatMap(([transactionId, entries]) =>
        entries.map(({ invoiceId, amount }) => ({ transactionId, invoiceId, amount }))
      )
      const data = await reconcileMatches(links)
      toast.success(data.message)
      setSelections({})
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar")
    } finally {
      setReconciling(false)
    }
  }

  const handleConfirmSingle = async (txId: string) => {
    const entries = selections[txId]
    if (!entries || entries.length === 0) return
    setReconcilingTxId(txId)
    try {
      const links = entries.map(({ invoiceId, amount }) => ({ transactionId: txId, invoiceId, amount }))
      const data = await reconcileMatches(links)
      toast.success(data.message)
      setSelections(prev => { const { [txId]: _, ...rest } = prev; return rest })
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar")
    } finally {
      setReconcilingTxId(null)
    }
  }

  const handleUndoLink = async (linkId: string) => {
    try {
      const res = await fetch("/api/financeiro/conciliacao/reconcile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao desfazer")
      }
      toast.success("Link desfeito")
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desfazer")
    }
  }

  const handleUndo = async (txId: string) => {
    try {
      const res = await fetch("/api/financeiro/conciliacao/reconcile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao desfazer")
      }
      toast.success("Conciliação desfeita")
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desfazer")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {unreconciledTx.length > 0 ? (
          <>
            <span>{unreconciledTx.length} pendente(s)</span>
            <span className="text-green-600 dark:text-green-400">{withMatches.length} com correspondência</span>
            {withoutMatches.length > 0 && (
              <span className="text-red-500">{withoutMatches.length} sem correspondência</span>
            )}
          </>
        ) : (
          <span>Nenhuma transação pendente</span>
        )}
        <button
          onClick={onToggleReconciled}
          className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all ${
            showReconciled
              ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
          }`}
        >
          {showReconciled ? <EyeOffIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
          {reconciledTx.length} conciliada(s)
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between p-3 rounded-lg border border-primary/30 bg-primary/5 backdrop-blur-sm">
          <span className="text-sm font-medium">{selectedCount} conciliação(ões) selecionada(s)</span>
          <Button onClick={handleReconcile} disabled={reconciling} size="sm">
            {reconciling ? <Loader2Icon className="w-4 h-4 animate-spin mr-1" /> : <CheckIcon className="w-4 h-4 mr-1" />}
            Confirmar Selecionados
          </Button>
        </div>
      )}

      {withMatches.length > 0 && (
        <div className="space-y-3">
          {withMatches.map(tx => (
            <TransactionCard
              key={tx.id}
              tx={tx}
              selectedIds={(selections[tx.id] || []).map(e => e.invoiceId)}
              addedInvoices={addedInvoices[tx.id] || []}
              onToggleInvoice={(invoiceId, amount) => toggleInvoice(tx.id, invoiceId, amount)}
              onSelectGroup={(invoiceIds) => selectGroup(tx.id, invoiceIds)}
              onConfirm={() => handleConfirmSingle(tx.id)}
              isConfirming={reconcilingTxId === tx.id}
              onCreateInvoice={() => setCreateSheetTxId(tx.id)}
              onUpdateAmount={(invoiceId, amount) => updateAmount(tx.id, invoiceId, amount)}
            />
          ))}
        </div>
      )}

      {withoutMatches.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4">Sem correspondência</h4>
          {withoutMatches.map(tx => (
            <UnmatchedTransactionCard
              key={tx.id}
              tx={tx}
              selectedIds={(selections[tx.id] || []).map(e => e.invoiceId)}
              addedInvoices={addedInvoices[tx.id] || []}
              onToggleInvoice={(invoiceId, amount) => toggleInvoice(tx.id, invoiceId, amount)}
              onConfirm={() => handleConfirmSingle(tx.id)}
              isConfirming={reconcilingTxId === tx.id}
              onCreateInvoice={() => setCreateSheetTxId(tx.id)}
              onUpdateAmount={(invoiceId, amount) => updateAmount(tx.id, invoiceId, amount)}
            />
          ))}
        </div>
      )}

      {showReconciled && reconciledTx.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4">Conciliadas</h4>
          {reconciledTx.map(tx => (
            <ReconciledTransactionCard
              key={tx.id}
              tx={tx}
              onUndo={() => handleUndo(tx.id)}
              onUndoLink={handleUndoLink}
            />
          ))}
        </div>
      )}

      <CreateInvoiceSheet
        isOpen={createSheetTxId !== null}
        onClose={() => setCreateSheetTxId(null)}
        onCreated={(invoice) => { if (createSheetTxId) handleInvoiceCreated(createSheetTxId, invoice) }}
        defaultAmount={createSheetTxId ? transactions.find(t => t.id === createSheetTxId)?.amount : undefined}
        defaultDate={createSheetTxId ? transactions.find(t => t.id === createSheetTxId)?.date : undefined}
        defaultSearch={createSheetTxId ? transactions.find(t => t.id === createSheetTxId)?.payerName ?? undefined : undefined}
      />
    </div>
  )
}
