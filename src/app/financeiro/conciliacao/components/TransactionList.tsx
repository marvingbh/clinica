"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import {
  CheckIcon,
  Loader2Icon,
  UserIcon,
  BanknoteIcon,
  CircleAlertIcon,
  UsersIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  EyeIcon,
  EyeOffIcon,
  Undo2Icon,
} from "lucide-react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { InvoiceSearch } from "./InvoiceSearch"
import { CreateInvoiceSheet, CreatedInvoiceInfo } from "./CreateInvoiceSheet"

interface CandidateInvoice {
  invoiceId: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  status?: string
}

interface Candidate extends CandidateInvoice {
  confidence: "HIGH" | "MEDIUM" | "LOW"
  nameScore: number
  matchedField: string | null
}

interface GroupCandidate {
  invoices: CandidateInvoice[]
  sharedParent: string | null
}

interface ReconciledInvoiceInfo {
  invoiceId: string
  patientName: string
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  status: string
}

interface Transaction {
  id: string
  externalId: string
  date: string
  amount: number
  description: string
  payerName: string | null
  reconciledInvoiceId: string | null
  reconciledAt: string | null
  reconciledInvoice?: ReconciledInvoiceInfo | null
  candidates: Candidate[]
  groupCandidates?: GroupCandidate[]
}

interface TransactionListProps {
  transactions: Transaction[]
  onReconciled: () => void
  showReconciled: boolean
  onToggleReconciled: () => void
}

const FULL_MONTHS = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function hasWordOverlap(name: string | null, payerName: string | null): boolean {
  if (!name || !payerName) return false
  const nameWords = name.toLowerCase().replace(/\([^)]*\)/g, "").split(/\s+/).filter(w => w.length > 2)
  const payerWords = payerName.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  return nameWords.some(w => payerWords.includes(w))
}

const invoiceStatusConfig: Record<string, { bg: string; label: string }> = {
  PENDENTE: { bg: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pendente" },
  ENVIADO: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Enviado" },
  PAGO: { bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "Pago manual" },
}

const confidenceConfig: Record<string, { bg: string; dot: string; label: string }> = {
  HIGH: {
    bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
    dot: "bg-green-500",
    label: "Alta",
  },
  MEDIUM: {
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
    dot: "bg-amber-500",
    label: "Média",
  },
  LOW: {
    bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
    dot: "bg-red-400",
    label: "Baixa",
  },
}

// selections: txId → array of invoiceIds
type Selections = Record<string, string[]>

export function TransactionList({ transactions, onReconciled, showReconciled, onToggleReconciled }: TransactionListProps) {
  const [selections, setSelections] = useState<Selections>(() => {
    const initial: Selections = {}
    for (const tx of transactions) {
      if (tx.reconciledInvoiceId) continue
      // Auto-select group candidates first (priority)
      if (tx.groupCandidates && tx.groupCandidates.length > 0) {
        initial[tx.id] = tx.groupCandidates[0].invoices.map(i => i.invoiceId)
      } else if (tx.candidates.length > 0 && tx.candidates[0].confidence !== "LOW") {
        initial[tx.id] = [tx.candidates[0].invoiceId]
      }
    }
    return initial
  })
  const [reconciling, setReconciling] = useState(false)

  const unreconciledTx = transactions.filter(tx => !tx.reconciledInvoiceId)
  const reconciledTx = transactions.filter(tx => tx.reconciledInvoiceId)
  const withMatches = unreconciledTx.filter(tx =>
    tx.candidates.length > 0 || (tx.groupCandidates && tx.groupCandidates.length > 0)
  )
  const withoutMatches = unreconciledTx.filter(tx =>
    tx.candidates.length === 0 && (!tx.groupCandidates || tx.groupCandidates.length === 0)
  )
  const selectedCount = Object.keys(selections).length
  const [undoingTxId, setUndoingTxId] = useState<string | null>(null)

  const toggleInvoice = (txId: string, invoiceId: string) => {
    setSelections(prev => {
      const current = prev[txId] || []
      const has = current.includes(invoiceId)
      const next = has
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
      // If all group invoices are already selected, deselect them
      const allSelected = invoiceIds.every(id => current.includes(id))
      if (allSelected) {
        const remaining = current.filter(id => !invoiceIds.includes(id))
        if (remaining.length === 0) {
          const { [txId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [txId]: remaining }
      }
      // Select all group invoices (replace previous selection)
      return { ...prev, [txId]: invoiceIds }
    })
  }

  const [reconcilingTxId, setReconcilingTxId] = useState<string | null>(null)
  const [createSheetTxId, setCreateSheetTxId] = useState<string | null>(null)
  const [addedInvoices, setAddedInvoices] = useState<Record<string, CreatedInvoiceInfo[]>>({})

  const handleInvoiceCreated = (txId: string, invoice: CreatedInvoiceInfo) => {
    setSelections(prev => ({
      ...prev,
      [txId]: [...(prev[txId] || []), invoice.id],
    }))
    setAddedInvoices(prev => ({
      ...prev,
      [txId]: [...(prev[txId] || []), invoice],
    }))
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
      const matches = Object.entries(selections).map(([transactionId, invoiceIds]) => ({
        transactionId,
        invoiceIds,
      }))
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
      setSelections(prev => {
        const { [txId]: _, ...rest } = prev
        return rest
      })
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
            <span className="text-green-600 dark:text-green-400">
              {withMatches.length} com correspondência
            </span>
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
          <span className="text-sm font-medium">
            {selectedCount} conciliação(ões) selecionada(s)
          </span>
          <Button onClick={handleReconcile} disabled={reconciling} size="sm">
            {reconciling ? (
              <Loader2Icon className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <CheckIcon className="w-4 h-4 mr-1" />
            )}
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
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4">
            Sem correspondência
          </h4>
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
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4">
            Conciliadas
          </h4>
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
        onCreated={(invoice) => {
          if (createSheetTxId) handleInvoiceCreated(createSheetTxId, invoice)
        }}
        defaultAmount={createSheetTxId ? transactions.find(t => t.id === createSheetTxId)?.amount : undefined}
        defaultDate={createSheetTxId ? transactions.find(t => t.id === createSheetTxId)?.date : undefined}
      />
    </div>
  )
}

function TransactionCard({
  tx,
  selectedIds,
  addedInvoices,
  onToggleInvoice,
  onSelectGroup,
  onConfirm,
  isConfirming,
  onCreateInvoice,
}: {
  tx: Transaction
  selectedIds: string[]
  addedInvoices: CreatedInvoiceInfo[]
  onToggleInvoice: (invoiceId: string) => void
  onSelectGroup: (invoiceIds: string[]) => void
  onConfirm: () => void
  isConfirming: boolean
  onCreateInvoice: () => void
}) {
  const [showSearch, setShowSearch] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const groups = tx.groupCandidates || []
  const candidateCount = groups.reduce((n, g) => n + g.invoices.length, 0) + tx.candidates.length

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 group"
          >
            {expanded
              ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            }
            <span className="text-base font-semibold tabular-nums">
              {formatCurrencyBRL(tx.amount)}
            </span>
            <span className="text-sm text-muted-foreground">{formatDateBR(tx.date)}</span>
            {!expanded && selectedIds.length > 0 && (
              <span className="text-xs text-primary font-medium">{selectedIds.length} fatura(s)</span>
            )}
            {!expanded && selectedIds.length === 0 && (
              <span className="text-xs text-muted-foreground">{candidateCount} sugestão(ões)</span>
            )}
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            {selectedIds.length > 0 && (
              <button
                onClick={onConfirm}
                disabled={isConfirming}
                className="inline-flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 px-2.5 py-1.5 rounded-md transition-colors"
              >
                {isConfirming
                  ? <Loader2Icon className="w-3 h-3 animate-spin" />
                  : <CheckIcon className="w-3 h-3" />
                }
                Confirmar
              </button>
            )}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                showSearch
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-muted/60"
              }`}
            >
              <SearchIcon className="w-3 h-3" />
              {showSearch ? "Fechar" : "Buscar"}
            </button>
            <button
              onClick={onCreateInvoice}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary/60 transition-all"
            >
              <PlusIcon className="w-3 h-3" />
              Criar
            </button>
          </div>
        </div>
        <div className="mt-1 ml-6 text-xs text-muted-foreground truncate">
          {tx.description}
        </div>
        {tx.payerName && (
          <div className="flex items-center gap-1.5 mt-0.5 ml-6 text-sm">
            <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium">{tx.payerName}</span>
          </div>
        )}
      </div>

      {expanded && <div className="divide-y divide-border">
        {/* Group candidates (siblings) — shown first */}
        {groups.map((g, gi) => {
          const groupIds = g.invoices.map(i => i.invoiceId)
          const allSelected = groupIds.every(id => selectedIds.includes(id))

          return (
            <button
              key={`group-${gi}`}
              onClick={() => onSelectGroup(groupIds)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                allSelected ? "bg-primary/8 ring-2 ring-inset ring-primary/30" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                  allSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                }`}>
                  {allSelected && <CheckIcon className="w-3.5 h-3.5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <UsersIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      {g.invoices.length} faturas — {g.sharedParent && `mesmo responsável: ${g.sharedParent}`}
                    </span>
                  </div>
                  {g.invoices.map(inv => (
                    <div key={inv.invoiceId} className="mt-1.5">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-medium">{inv.patientName}</span>
                        {inv.status && invoiceStatusConfig[inv.status] && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${invoiceStatusConfig[inv.status].bg}`}>
                            {invoiceStatusConfig[inv.status].label}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {FULL_MONTHS[inv.referenceMonth]}/{inv.referenceYear}
                        </span>
                        <span className="text-xs font-medium tabular-nums">
                          {formatCurrencyBRL(inv.totalAmount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs">
                        {inv.motherName && (
                          <span className={hasWordOverlap(inv.motherName, tx.payerName)
                            ? "text-green-700 dark:text-green-400 font-medium inline-flex items-center gap-1"
                            : "text-muted-foreground"
                          }>
                            {hasWordOverlap(inv.motherName, tx.payerName) && <CheckIcon className="w-3 h-3" />}
                            Mãe: {inv.motherName}
                          </span>
                        )}
                        {inv.fatherName && (
                          <span className={hasWordOverlap(inv.fatherName, tx.payerName)
                            ? "text-green-700 dark:text-green-400 font-medium inline-flex items-center gap-1"
                            : "text-muted-foreground"
                          }>
                            {hasWordOverlap(inv.fatherName, tx.payerName) && <CheckIcon className="w-3 h-3" />}
                            Pai: {inv.fatherName}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="shrink-0 flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Alta
                </div>
              </div>
            </button>
          )
        })}

        {/* Individual candidates */}
        {tx.candidates.map(c => {
          const isSelected = selectedIds.includes(c.invoiceId)
          const conf = confidenceConfig[c.confidence]

          return (
            <button
              key={c.invoiceId}
              onClick={() => onToggleInvoice(c.invoiceId)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                isSelected ? "bg-primary/8 ring-2 ring-inset ring-primary/30" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                  isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                }`}>
                  {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.patientName}</span>
                    {c.status && invoiceStatusConfig[c.status] && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${invoiceStatusConfig[c.status].bg}`}>
                        {invoiceStatusConfig[c.status].label}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {FULL_MONTHS[c.referenceMonth]}/{c.referenceYear}
                    </span>
                    <span className="text-xs font-medium tabular-nums">
                      {formatCurrencyBRL(c.totalAmount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
                    {c.motherName && (() => {
                      const matches = hasWordOverlap(c.motherName, tx.payerName)
                      return (
                        <span className={`inline-flex items-center gap-1 ${
                          matches ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"
                        }`}>
                          {matches && <CheckIcon className="w-3 h-3" />}
                          Mãe: {c.motherName}
                        </span>
                      )
                    })()}
                    {c.fatherName && (() => {
                      const matches = hasWordOverlap(c.fatherName, tx.payerName)
                      return (
                        <span className={`inline-flex items-center gap-1 ${
                          matches ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"
                        }`}>
                          {matches && <CheckIcon className="w-3 h-3" />}
                          Pai: {c.fatherName}
                        </span>
                      )
                    })()}
                    {!c.motherName && !c.fatherName && (
                      <span className="text-muted-foreground/60 italic">Sem nome dos pais cadastrado</span>
                    )}
                  </div>

                  {c.matchedField === "patientSurname" && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 inline-flex items-center gap-1">
                      <CheckIcon className="w-3 h-3" />
                      Sobrenome do paciente coincide com o pagador
                    </div>
                  )}

                  {!hasWordOverlap(c.motherName, tx.payerName) &&
                   !hasWordOverlap(c.fatherName, tx.payerName) &&
                   c.matchedField !== "patientSurname" &&
                   (c.motherName || c.fatherName) && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Nenhum nome coincide com o pagador
                    </div>
                  )}
                </div>

                <div className={`shrink-0 flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${conf.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                  {conf.label}
                </div>
              </div>
            </button>
          )
        })}
      </div>}

      {/* Manually added invoices (from "Criar fatura") */}
      {expanded && addedInvoices.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {addedInvoices.map(inv => {
            const isSelected = selectedIds.includes(inv.id)
            return (
              <button
                key={inv.id}
                onClick={() => onToggleInvoice(inv.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  isSelected ? "bg-primary/8 ring-2 ring-inset ring-primary/30" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                  }`}>
                    {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{inv.patientName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Nova
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {FULL_MONTHS[inv.referenceMonth]}/{inv.referenceYear}
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {formatCurrencyBRL(inv.totalAmount)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{inv.description}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showSearch && (
        <div className="px-4 py-3 border-t border-border bg-muted/10">
          <InvoiceSearch
            selectedIds={selectedIds}
            onSelect={onToggleInvoice}
          />
        </div>
      )}
    </div>
  )
}

function UnmatchedTransactionCard({
  tx,
  selectedIds,
  addedInvoices,
  onToggleInvoice,
  onConfirm,
  isConfirming,
  onCreateInvoice,
}: {
  tx: Transaction
  selectedIds: string[]
  addedInvoices: CreatedInvoiceInfo[]
  onToggleInvoice: (invoiceId: string) => void
  onConfirm: () => void
  isConfirming: boolean
  onCreateInvoice: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/20 flex items-center gap-3">
        <CircleAlertIcon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold tabular-nums">{formatCurrencyBRL(tx.amount)}</span>
            <span className="text-muted-foreground">{formatDateBR(tx.date)}</span>
            {selectedIds.length > 0 && (
              <span className="text-xs text-primary font-medium">{selectedIds.length} fatura(s)</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground/70 truncate">{tx.description}</div>
          {tx.payerName && (
            <div className="text-xs text-muted-foreground truncate">{tx.payerName}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.length > 0 && (
            <button
              onClick={onConfirm}
              disabled={isConfirming}
              className="inline-flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 px-2.5 py-1.5 rounded-md transition-colors"
            >
              {isConfirming
                ? <Loader2Icon className="w-3 h-3 animate-spin" />
                : <CheckIcon className="w-3 h-3" />
              }
              Confirmar
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all ${
              expanded
                ? "bg-primary/10 border-primary/30 text-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-muted/60"
            }`}
          >
            <SearchIcon className="w-3 h-3" />
            {expanded ? "Fechar" : "Buscar"}
          </button>
          <button
            onClick={onCreateInvoice}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary/60 transition-all"
          >
            <PlusIcon className="w-3 h-3" />
            Criar
          </button>
        </div>
      </div>
      {/* Manually added invoices */}
      {addedInvoices.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {addedInvoices.map(inv => {
            const isSelected = selectedIds.includes(inv.id)
            return (
              <button
                key={inv.id}
                onClick={() => onToggleInvoice(inv.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  isSelected ? "bg-primary/8 ring-2 ring-inset ring-primary/30" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                  }`}>
                    {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{inv.patientName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Nova
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {FULL_MONTHS[inv.referenceMonth]}/{inv.referenceYear}
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {formatCurrencyBRL(inv.totalAmount)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{inv.description}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {expanded && (
        <div className="px-4 py-3 border-t border-border">
          <InvoiceSearch
            selectedIds={selectedIds}
            onSelect={onToggleInvoice}
          />
        </div>
      )}
    </div>
  )
}

function ReconciledTransactionCard({
  tx,
  onUndo,
  isUndoing,
}: {
  tx: Transaction
  onUndo: () => void
  isUndoing: boolean
}) {
  const inv = tx.reconciledInvoice

  return (
    <div className="rounded-lg border border-border border-l-4 border-l-green-500 overflow-hidden opacity-60 hover:opacity-100 transition-opacity">
      <div className="px-4 py-3 bg-muted/20 flex items-center gap-3">
        <CheckIcon className="w-4 h-4 text-green-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold tabular-nums">{formatCurrencyBRL(tx.amount)}</span>
            <span className="text-muted-foreground">{formatDateBR(tx.date)}</span>
          </div>
          <div className="text-xs text-muted-foreground/70 truncate">{tx.description}</div>
          {tx.payerName && (
            <div className="text-xs text-muted-foreground truncate">{tx.payerName}</div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {inv && (
            <div className="text-right text-xs">
              <div className="font-medium">{inv.patientName}</div>
              <div className="text-muted-foreground">
                {FULL_MONTHS[inv.referenceMonth]}/{inv.referenceYear} — {formatCurrencyBRL(inv.totalAmount)}
              </div>
            </div>
          )}
          <button
            onClick={onUndo}
            disabled={isUndoing}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20 dark:hover:border-red-800 disabled:opacity-50 transition-all"
          >
            {isUndoing
              ? <Loader2Icon className="w-3 h-3 animate-spin" />
              : <Undo2Icon className="w-3 h-3" />
            }
            Desfazer
          </button>
        </div>
      </div>
    </div>
  )
}
