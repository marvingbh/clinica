"use client"

import { DismissedTransaction, DISMISS_REASON_CONFIG } from "./types"

interface DismissedTransactionCardProps {
  transaction: DismissedTransaction
  onUndismiss: (transactionId: string) => void
}

export function DismissedTransactionCard({ transaction, onUndismiss }: DismissedTransactionCardProps) {
  const config = DISMISS_REASON_CONFIG[transaction.dismissReason]

  return (
    <div className="p-4 border border-border rounded-lg opacity-60 hover:opacity-100 transition-opacity">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-foreground whitespace-nowrap">
            R$ {transaction.amount.toFixed(2)}
          </span>
          <span className="text-sm text-muted-foreground">
            {new Date(transaction.date).toLocaleDateString("pt-BR")}
          </span>
          {transaction.payerName && (
            <span className="text-sm text-muted-foreground truncate">
              {transaction.payerName}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${config.badgeClassName}`}>
            {config.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onUndismiss(transaction.id)}
          className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
        >
          Desfazer
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1 truncate">{transaction.description}</p>
    </div>
  )
}
