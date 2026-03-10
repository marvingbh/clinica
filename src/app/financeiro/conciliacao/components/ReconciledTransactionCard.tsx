"use client"

import { CheckIcon, Loader2Icon, Undo2Icon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR, getMonthName } from "@/lib/financeiro/format"
import type { Transaction } from "./types"

interface ReconciledTransactionCardProps {
  tx: Transaction
  onUndo: () => void
  isUndoing: boolean
}

export function ReconciledTransactionCard({ tx, onUndo, isUndoing }: ReconciledTransactionCardProps) {
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
                {getMonthName(inv.referenceMonth)}/{inv.referenceYear} — {formatCurrencyBRL(inv.totalAmount)}
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
