"use client"

import { useState } from "react"
import {
  CheckIcon,
  UserIcon,
  UsersIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { formatCurrencyBRL, formatDateBR, getMonthName } from "@/lib/financeiro/format"
import { InvoiceSearch } from "./InvoiceSearch"
import type { Transaction, CreatedInvoiceInfo } from "./types"
import { hasWordOverlap } from "./types"
import {
  Checkbox,
  StatusBadge,
  ConfidenceBadge,
  ConfirmButton,
  ParentNames,
  InvoiceRow,
  AddedInvoiceRow,
  DismissButtons,
} from "./shared-ui"

interface TransactionCardProps {
  tx: Transaction
  selectedIds: string[]
  addedInvoices: CreatedInvoiceInfo[]
  onToggleInvoice: (invoiceId: string, amount?: number) => void
  onUpdateAmount: (invoiceId: string, amount: number) => void
  onSelectGroup: (invoiceIds: string[]) => void
  onConfirm: () => void
  isConfirming: boolean
  onCreateInvoice: () => void
  onDismiss: (transactionId: string, reason: "DUPLICATE" | "NOT_PATIENT") => void
}

export function TransactionCard({
  tx,
  selectedIds,
  addedInvoices,
  onToggleInvoice,
  onUpdateAmount,
  onSelectGroup,
  onConfirm,
  isConfirming,
  onCreateInvoice,
  onDismiss,
}: TransactionCardProps) {
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
            {tx.allocatedAmount > 0 && tx.remainingAmount > 0.01 && (
              <span className="text-xs text-orange-600 dark:text-orange-400 tabular-nums">
                {formatCurrencyBRL(tx.allocatedAmount)} / {formatCurrencyBRL(tx.amount)} alocado
              </span>
            )}
            {!expanded && selectedIds.length > 0 && (
              <span className="text-xs text-primary font-medium">{selectedIds.length} fatura(s)</span>
            )}
            {!expanded && selectedIds.length === 0 && (
              <span className="text-xs text-muted-foreground">{candidateCount} sugestão(ões)</span>
            )}
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            {selectedIds.length > 0 && (
              <ConfirmButton onClick={onConfirm} isConfirming={isConfirming} />
            )}
            {tx.links.length === 0 && selectedIds.length === 0 && (
              <DismissButtons onDismiss={(reason) => onDismiss(tx.id, reason)} />
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

      {expanded && tx.links.length > 0 && (
        <div className="divide-y divide-border">
          {tx.links.map(link => (
            <div key={link.linkId} className="px-4 py-2 bg-green-50/50 dark:bg-green-950/10 border-b border-border">
              <div className="flex items-center gap-2 text-sm">
                <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                <span className="font-medium">{link.patientName}</span>
                <span className="text-xs text-muted-foreground">
                  {getMonthName(link.referenceMonth)}/{link.referenceYear}
                </span>
                <span className="text-xs font-medium tabular-nums">
                  {formatCurrencyBRL(link.amount)}
                </span>
                {link.amount < link.totalAmount && (
                  <span className="text-xs text-orange-600">
                    de {formatCurrencyBRL(link.totalAmount)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && <div className="divide-y divide-border">
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
                <Checkbox checked={allSelected} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <UsersIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      {g.invoices.length} faturas — {g.sharedParent && `mesmo responsável: ${g.sharedParent}`}
                    </span>
                  </div>
                  {g.invoices.map(inv => (
                    <InvoiceRow key={inv.invoiceId} inv={inv} payerName={tx.payerName} />
                  ))}
                </div>
                <ConfidenceBadge confidence="HIGH" />
              </div>
            </button>
          )
        })}

        {tx.candidates.map(c => {
          const isSelected = selectedIds.includes(c.invoiceId)

          return (
            <button
              key={c.invoiceId}
              onClick={() => onToggleInvoice(c.invoiceId, c.remainingAmount ?? c.totalAmount)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                isSelected ? "bg-primary/8 ring-2 ring-inset ring-primary/30" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <Checkbox checked={isSelected} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.patientName}</span>
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-muted-foreground">
                      {getMonthName(c.referenceMonth)}/{c.referenceYear}
                    </span>
                    {c.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        venc. {formatDateBR(c.dueDate)}
                      </span>
                    )}
                    <span className="text-xs font-medium tabular-nums">
                      {formatCurrencyBRL(c.totalAmount)}
                    </span>
                    {c.remainingAmount !== undefined && c.remainingAmount < c.totalAmount && (
                      <span className="text-xs text-orange-600 tabular-nums">
                        (falta {formatCurrencyBRL(c.remainingAmount)})
                      </span>
                    )}
                  </div>
                  <ParentNames motherName={c.motherName} fatherName={c.fatherName} payerName={tx.payerName} />
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
                <ConfidenceBadge confidence={c.confidence} />
              </div>
            </button>
          )
        })}
      </div>}

      {expanded && addedInvoices.length > 0 && (
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

      {showSearch && (
        <div className="px-4 py-3 border-t border-border bg-muted/10">
          <InvoiceSearch selectedIds={selectedIds} onSelect={onToggleInvoice} />
        </div>
      )}
    </div>
  )
}
