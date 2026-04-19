"use client"

import { CheckIcon, Loader2Icon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR, getMonthName } from "@/lib/financeiro/format"
import { INVOICE_STATUS_CONFIG, CONFIDENCE_CONFIG, hasWordOverlap } from "./types"
import type { CreatedInvoiceInfo } from "./types"

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
      checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
    }`}>
      {checked && <CheckIcon className="w-3.5 h-3.5" />}
    </div>
  )
}

export function StatusBadge({ status }: { status?: string }) {
  if (!status || !INVOICE_STATUS_CONFIG[status]) return null
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${INVOICE_STATUS_CONFIG[status].bg}`}>
      {INVOICE_STATUS_CONFIG[status].label}
    </span>
  )
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const conf = CONFIDENCE_CONFIG[confidence]
  if (!conf) return null
  return (
    <div className={`shrink-0 flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${conf.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
      {conf.label}
    </div>
  )
}

export function ConfirmButton({ onClick, isConfirming }: { onClick: () => void; isConfirming: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={isConfirming}
      className="inline-flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 px-2.5 py-1.5 rounded-md transition-colors"
    >
      {isConfirming
        ? <Loader2Icon className="w-3 h-3 animate-spin" />
        : <CheckIcon className="w-3 h-3" />
      }
      Confirmar
    </button>
  )
}

export function ParentNames({ motherName, fatherName, payerName }: { motherName: string | null; fatherName: string | null; payerName: string | null }) {
  return (
    <div className="flex items-center gap-3 mt-0.5 text-xs flex-wrap">
      {motherName && (
        <span className={`inline-flex items-center gap-1 ${
          hasWordOverlap(motherName, payerName) ? "text-green-700 font-medium" : "text-muted-foreground"
        }`}>
          {hasWordOverlap(motherName, payerName) && <CheckIcon className="w-3 h-3" />}
          Mãe: {motherName}
        </span>
      )}
      {fatherName && (
        <span className={`inline-flex items-center gap-1 ${
          hasWordOverlap(fatherName, payerName) ? "text-green-700 font-medium" : "text-muted-foreground"
        }`}>
          {hasWordOverlap(fatherName, payerName) && <CheckIcon className="w-3 h-3" />}
          Pai: {fatherName}
        </span>
      )}
      {!motherName && !fatherName && (
        <span className="text-muted-foreground/60 italic">Sem nome dos pais cadastrado</span>
      )}
    </div>
  )
}

export function InvoiceRow({ inv, payerName }: {
  inv: { invoiceId: string; patientName: string; motherName: string | null; fatherName: string | null; totalAmount: number; referenceMonth: number; referenceYear: number; dueDate?: string | null; status?: string }
  payerName: string | null
}) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{inv.patientName}</span>
        <StatusBadge status={inv.status} />
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs">
        {inv.dueDate ? (
          <span className="text-muted-foreground">
            {formatDateBR(inv.dueDate)}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {getMonthName(inv.referenceMonth)}/{inv.referenceYear}
          </span>
        )}
        <span className="font-medium tabular-nums">
          {formatCurrencyBRL(inv.totalAmount)}
        </span>
      </div>
      <ParentNames motherName={inv.motherName} fatherName={inv.fatherName} payerName={payerName} />
    </div>
  )
}

export function AddedInvoiceRow({ inv, isSelected, onToggle }: { inv: CreatedInvoiceInfo; isSelected: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left px-4 py-3 transition-colors ${
        isSelected ? "bg-primary/8 ring-2 ring-inset ring-primary/30" : "hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <Checkbox checked={isSelected} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{inv.patientName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              Nova
            </span>
            <span className="text-xs text-muted-foreground">
              {getMonthName(inv.referenceMonth)}/{inv.referenceYear}
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
}

export function DismissButtons({ onDismiss }: { onDismiss: (reason: "DUPLICATE" | "NOT_PATIENT") => void }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onDismiss("DUPLICATE")}
        className="text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
        title="Marcar como duplicado"
      >
        Duplicado
      </button>
      <button
        type="button"
        onClick={() => onDismiss("NOT_PATIENT")}
        className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
        title="Sem relação com paciente"
      >
        Sem relação
      </button>
    </div>
  )
}
