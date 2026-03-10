"use client"

import { useState } from "react"
import { CircleAlertIcon, PlusIcon, SearchIcon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { InvoiceSearch } from "./InvoiceSearch"
import type { Transaction, CreatedInvoiceInfo } from "./types"
import { Checkbox, ConfirmButton, AddedInvoiceRow } from "./shared-ui"

interface UnmatchedTransactionCardProps {
  tx: Transaction
  selectedIds: string[]
  addedInvoices: CreatedInvoiceInfo[]
  onToggleInvoice: (invoiceId: string) => void
  onConfirm: () => void
  isConfirming: boolean
  onCreateInvoice: () => void
}

export function UnmatchedTransactionCard({
  tx,
  selectedIds,
  addedInvoices,
  onToggleInvoice,
  onConfirm,
  isConfirming,
  onCreateInvoice,
}: UnmatchedTransactionCardProps) {
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
            <ConfirmButton onClick={onConfirm} isConfirming={isConfirming} />
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

      {addedInvoices.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {addedInvoices.map(inv => (
            <AddedInvoiceRow
              key={inv.id}
              inv={inv}
              isSelected={selectedIds.includes(inv.id)}
              onToggle={() => onToggleInvoice(inv.id)}
            />
          ))}
        </div>
      )}

      {expanded && (
        <div className="px-4 py-3 border-t border-border">
          <InvoiceSearch selectedIds={selectedIds} onSelect={onToggleInvoice} />
        </div>
      )}
    </div>
  )
}
