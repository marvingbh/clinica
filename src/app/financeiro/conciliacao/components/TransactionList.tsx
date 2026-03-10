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

type Selections = Record<string, string[]>

export function TransactionList({ transactions, onReconciled, showReconciled, onToggleReconciled }: TransactionListProps) {
  const [selections, setSelections] = useState<Selections>(() => {
    const initial: Selections = {}
    for (const tx of transactions) {
      if (tx.reconciledInvoiceId) continue
      if (tx.groupCandidates && tx.groupCandidates.length > 0) {
        initial[tx.id] = tx.groupCandidates[0].invoices.map(i => i.invoiceId)
      } else if (tx.candidates.length > 0 && tx.candidates[0].confidence !== "LOW") {
        initial[tx.id] = [tx.candidates[0].invoiceId]
      }
    }
    return initial
  })
  const [reconciling, setReconciling] = useState(false)
  const [reconcilingTxId, setReconcilingTxId] = useState<string | null>(null)
  const [createSheetTxId, setCreateSheetTxId] = useState<string | null>(null)
  const [addedInvoices, setAddedInvoices] = useState<Record<string, CreatedInvoiceInfo[]>>({})
  const [undoingTxId, setUndoingTxId] = useState<string | null>(null)

  const unreconciledTx = transactions.filter(tx => !tx.reconciledInvoiceId)
  const reconciledTx = transactions.filter(tx => tx.reconciledInvoiceId)
  const withMatches = unreconciledTx.filter(tx =>
    tx.candidates.length > 0 || (tx.groupCandidates && tx.groupCandidates.length > 0)
  )
  const withoutMatches = unreconciledTx.filter(tx =>
    tx.candidates.length === 0 && (!tx.groupCandidates || tx.groupCandidates.length === 0)
  )
  const selectedCount = Object.keys(selections).length

  const toggleInvoice = (txId: string, invoiceId: string) => {
    setSelections(prev => {
      const current = prev[txId] || []
      const next = current.includes(invoiceId)
        ? current.filter(id => id !== invoiceId)
        : [...current, invoiceId]
      if (next.length === 0) {
        const { [txId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [txId]: next }
    })
  }

  const selectGroup = (txId: string, invoiceIds: string[]) => {
    setSelections(prev => {
      const current = prev[txId] || []
      const allSelected = invoiceIds.every(id => current.includes(id))
      if (allSelected) {
        const remaining = current.filter(id => !invoiceIds.includes(id))
        if (remaining.length === 0) {
          const { [txId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [txId]: remaining }
      }
      return { ...prev, [txId]: invoiceIds }
    })
  }

  const handleInvoiceCreated = (txId: string, invoice: CreatedInvoiceInfo) => {
    setSelections(prev => ({ ...prev, [txId]: [...(prev[txId] || []), invoice.id] }))
    setAddedInvoices(prev => ({ ...prev, [txId]: [...(prev[txId] || []), invoice] }))
    setCreateSheetTxId(null)
  }

  const reconcileMatches = async (matches: Array<{ transactionId: string; invoiceIds: string[] }>) => {
    const res = await fetch("/api/financeiro/conciliacao/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches }),
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
      const matches = Object.entries(selections).map(([transactionId, invoiceIds]) => ({ transactionId, invoiceIds }))
      const data = await reconcileMatches(matches)
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
    const invoiceIds = selections[txId]
    if (!invoiceIds || invoiceIds.length === 0) return
    setReconcilingTxId(txId)
    try {
      const data = await reconcileMatches([{ transactionId: txId, invoiceIds }])
      toast.success(data.message)
      setSelections(prev => { const { [txId]: _, ...rest } = prev; return rest })
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar")
    } finally {
      setReconcilingTxId(null)
    }
  }

  const handleUndo = async (txId: string) => {
    setUndoingTxId(txId)
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
      toast.error(err instanceof Error ? err.message : "Erro ao desfazer conciliação")
    } finally {
      setUndoingTxId(null)
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
              selectedIds={selections[tx.id] || []}
              addedInvoices={addedInvoices[tx.id] || []}
              onToggleInvoice={(invoiceId) => toggleInvoice(tx.id, invoiceId)}
              onSelectGroup={(invoiceIds) => selectGroup(tx.id, invoiceIds)}
              onConfirm={() => handleConfirmSingle(tx.id)}
              isConfirming={reconcilingTxId === tx.id}
              onCreateInvoice={() => setCreateSheetTxId(tx.id)}
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
              selectedIds={selections[tx.id] || []}
              addedInvoices={addedInvoices[tx.id] || []}
              onToggleInvoice={(invoiceId) => toggleInvoice(tx.id, invoiceId)}
              onConfirm={() => handleConfirmSingle(tx.id)}
              isConfirming={reconcilingTxId === tx.id}
              onCreateInvoice={() => setCreateSheetTxId(tx.id)}
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
              isUndoing={undoingTxId === tx.id}
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
      />
    </div>
  )
}
