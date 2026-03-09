"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { CheckIcon, Loader2Icon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"

interface Candidate {
  invoiceId: string
  patientName: string
  motherName: string | null
  fatherName: string | null
  totalAmount: number
  referenceMonth: number
  referenceYear: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
  nameScore: number
  matchedField: string | null
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
  candidates: Candidate[]
}

interface TransactionListProps {
  transactions: Transaction[]
  onReconciled: () => void
}

const MONTH_NAMES = [
  "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

const confidenceColors: Record<string, string> = {
  HIGH: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
}

const confidenceLabels: Record<string, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
}

const fieldLabels: Record<string, string> = {
  motherName: "Mãe",
  fatherName: "Pai",
  patientName: "Paciente",
}

export function TransactionList({ transactions, onReconciled }: TransactionListProps) {
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const tx of transactions) {
      if (!tx.reconciledInvoiceId && tx.candidates.length > 0 && tx.candidates[0].confidence !== "LOW") {
        initial[tx.id] = tx.candidates[0].invoiceId
      }
    }
    return initial
  })
  const [reconciling, setReconciling] = useState(false)

  const unreconciledTx = transactions.filter(tx => !tx.reconciledInvoiceId)
  const selectedCount = Object.keys(selections).length

  const toggleSelection = (txId: string, invoiceId: string) => {
    setSelections(prev => {
      const next = { ...prev }
      if (next[txId] === invoiceId) {
        delete next[txId]
      } else {
        next[txId] = invoiceId
      }
      return next
    })
  }

  const handleReconcile = async () => {
    if (selectedCount === 0) return
    setReconciling(true)
    try {
      const matches = Object.entries(selections).map(([transactionId, invoiceId]) => ({
        transactionId,
        invoiceId,
      }))
      const res = await fetch("/api/financeiro/conciliacao/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao conciliar")
      }
      const data = await res.json()
      toast.success(data.message)
      setSelections({})
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar")
    } finally {
      setReconciling(false)
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        Nenhuma transação encontrada. Clique em &quot;Buscar Transações&quot; para importar.
      </div>
    )
  }

  return (
    <div>
      {selectedCount > 0 && (
        <div className="flex items-center justify-between mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
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

      <div className="space-y-3">
        {unreconciledTx.map(tx => (
          <div key={tx.id} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium">
                  {formatCurrencyBRL(tx.amount)}
                  <span className="text-muted-foreground ml-2 font-normal">
                    {formatDateBR(tx.date)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {tx.payerName && <span className="font-medium text-foreground">{tx.payerName}</span>}
                  {tx.payerName && " — "}
                  {tx.description}
                </div>
              </div>
            </div>

            {tx.candidates.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">
                Nenhuma fatura pendente com este valor
              </div>
            ) : (
              <div className="space-y-1.5 mt-2">
                {tx.candidates.map(c => {
                  const isSelected = selections[tx.id] === c.invoiceId
                  return (
                    <button
                      key={c.invoiceId}
                      onClick={() => toggleSelection(tx.id, c.invoiceId)}
                      className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{c.patientName}</span>
                          <span className="text-muted-foreground ml-2">
                            {MONTH_NAMES[c.referenceMonth]}/{c.referenceYear}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {formatCurrencyBRL(c.totalAmount)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.matchedField && (
                            <span className="text-xs text-muted-foreground">
                              {fieldLabels[c.matchedField] || c.matchedField}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${confidenceColors[c.confidence]}`}>
                            {confidenceLabels[c.confidence]}
                          </span>
                          {isSelected && <CheckIcon className="w-4 h-4 text-primary" />}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
