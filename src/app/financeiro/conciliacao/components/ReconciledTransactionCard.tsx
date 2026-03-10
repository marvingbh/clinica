"use client"

import { CheckIcon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR, getMonthName } from "@/lib/financeiro/format"
import { StatusBadge } from "./shared-ui"
import type { Transaction } from "./types"

interface ReconciledTransactionCardProps {
  tx: Transaction
  onUndo: () => void
  onUndoLink: (linkId: string) => void
}

export function ReconciledTransactionCard({ tx, onUndo, onUndoLink }: ReconciledTransactionCardProps) {
  return (
    <div className="rounded-lg border border-border border-l-4 border-l-green-500 overflow-hidden opacity-60 hover:opacity-100 transition-opacity">
      <div className="px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-3">
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
          {tx.links.length > 1 && (
            <button
              onClick={onUndo}
              className="text-xs text-red-600 hover:text-red-700 hover:underline shrink-0"
            >
              Desfazer tudo
            </button>
          )}
        </div>

        {tx.links.length > 0 && (
          <div className="mt-2 ml-7 border-t border-border/50 pt-2 space-y-0.5">
            {tx.links.map(link => (
              <div key={link.linkId} className="flex items-center justify-between gap-2 py-1">
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className="font-medium truncate">{link.patientName}</span>
                  <StatusBadge status={link.status} />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {getMonthName(link.referenceMonth)}/{link.referenceYear}
                  </span>
                  <span className="text-xs font-medium tabular-nums shrink-0">
                    {formatCurrencyBRL(link.amount)}
                  </span>
                  {link.amount < link.totalAmount && (
                    <span className="text-xs text-orange-600 shrink-0">
                      de {formatCurrencyBRL(link.totalAmount)}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onUndoLink(link.linkId) }}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline shrink-0"
                >
                  Desfazer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
