"use client"

import React from "react"
import Link from "next/link"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import {
  EyeIcon,
  CheckCircleIcon,
  DownloadIcon,
  RefreshCwIcon,
  SquarePenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FileTextIcon,
} from "@/shared/components/ui/icons"
import type { Invoice, InvoiceRow } from "./invoice-grouping-helpers"
import { STATUS_LABELS, STATUS_COLORS } from "./invoice-status"

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || ""}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function NfBadgeCell({ invoice }: { invoice: Invoice }) {
  // NFS-e automated statuses take priority
  if (invoice.nfseStatus === "EMITIDA") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
        title={invoice.nfseNumero ? `NFS-e #${invoice.nfseNumero}` : "NFS-e emitida"}
      >
        NFS-e
      </span>
    )
  }
  if (invoice.nfseStatus === "PENDENTE") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        title="NFS-e em processamento"
      >
        ...
      </span>
    )
  }
  if (invoice.nfseStatus === "ERRO") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
        title={invoice.nfseErro || "Erro na emissao"}
      >
        Erro
      </span>
    )
  }
  if (invoice.nfseStatus === "PARCIAL") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        title="NFS-e parcialmente emitida"
      >
        Parcial
      </span>
    )
  }
  if (invoice.nfseStatus === "CANCELADA") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground line-through"
        title="NFS-e cancelada"
      >
        NFS-e
      </span>
    )
  }
  // Manual NF fallback
  if (invoice.notaFiscalEmitida) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" title="NF emitida">&#x2713;</span>
    )
  }
  return <span className="text-muted-foreground">&mdash;</span>
}

function PaymentCell({
  invoice,
  onMarkPaid,
}: {
  invoice: Invoice
  onMarkPaid: (id: string) => void
}) {
  if (invoice.status === "PENDENTE" || invoice.status === "ENVIADO" || invoice.status === "PARCIAL") {
    return (
      <button
        onClick={() => onMarkPaid(invoice.id)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
        title="Marcar como pago"
      >
        <CheckCircleIcon className="w-3.5 h-3.5" />
        Pagar
      </button>
    )
  }
  if (invoice.status === "PAGO") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
          {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("pt-BR") : "Pago"}
        </span>
        <span className={`text-[10px] ${invoice.paidViaBank ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
          {invoice.paidViaBank ? "Conciliado" : "Manual"}
        </span>
      </div>
    )
  }
  return <span className="text-xs text-muted-foreground">&mdash;</span>
}

function ActionButtons({
  invoice,
  recalculatingId,
  onRecalcular,
  onViewDetail,
}: {
  invoice: Invoice
  recalculatingId: string | null
  onRecalcular: (id: string) => void
  onViewDetail: (id: string) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {(invoice.status === "PENDENTE" || invoice.status === "ENVIADO" || invoice.status === "PARCIAL") && (
        <button
          onClick={() => onRecalcular(invoice.id)}
          disabled={recalculatingId === invoice.id}
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          title="Recalcular fatura"
        >
          <RefreshCwIcon className={`w-4 h-4 ${recalculatingId === invoice.id ? "animate-spin" : ""}`} />
        </button>
      )}
      <button
        onClick={() => onViewDetail(invoice.id)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title="Ver detalhes"
      >
        <EyeIcon className="w-4 h-4" />
      </button>
      <Link
        href={`/financeiro/faturas/${invoice.id}`}
        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title="Editar fatura"
      >
        <SquarePenIcon className="w-4 h-4" />
      </Link>
      {invoice.nfseStatus === "EMITIDA" && (
        <a
          href={`/api/financeiro/faturas/${invoice.id}/nfse/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
          title="Baixar NFS-e PDF"
        >
          <FileTextIcon className="w-4 h-4" />
        </a>
      )}
      <a
        href={`/api/financeiro/faturas/${invoice.id}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Baixar PDF"
      >
        <DownloadIcon className="w-4 h-4" />
      </a>
    </div>
  )
}

function IndividualRow({
  invoice,
  recalculatingId,
  onMarkPaid,
  onRecalcular,
  onViewDetail,
  indent,
}: {
  invoice: Invoice
  recalculatingId: string | null
  onMarkPaid: (id: string) => void
  onRecalcular: (id: string) => void
  onViewDetail: (id: string) => void
  indent?: boolean
}) {
  return (
    <tr className={`border-b border-border last:border-0 hover:bg-muted/50 ${indent ? "bg-background" : "even:bg-muted/30"}`}>
      <td className={`py-3 px-4 ${indent ? "pl-10" : "font-medium"}`}>
        {indent ? (
          <span className="text-muted-foreground">{invoice._count.items > 0 ? invoice.dueDate ? formatDateBR(invoice.dueDate) : "Sessão" : "Sessão"}</span>
        ) : (
          <div>
            <span>{invoice.patient.name}</span>
            {(invoice.patient.motherName || invoice.patient.fatherName) && (
              <span className="block text-xs text-muted-foreground mt-0.5 truncate max-w-[250px]">
                {invoice.patient.motherName || invoice.patient.fatherName}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="text-center py-3 px-4">{invoice.totalSessions}</td>
      <td className="text-right py-3 px-4">{formatCurrencyBRL(Number(invoice.totalAmount))}</td>
      <td className="text-center py-3 px-4">
        <StatusBadge status={invoice.status} />
      </td>
      <td className="text-center py-3 px-4">
        <NfBadgeCell invoice={invoice} />
      </td>
      <td className="text-center py-3 px-4">{formatDateBR(invoice.dueDate)}</td>
      <td className="text-center py-3 px-4">
        <PaymentCell invoice={invoice} onMarkPaid={onMarkPaid} />
      </td>
      <td className="text-right py-3 px-4">
        <ActionButtons
          invoice={invoice}
          recalculatingId={recalculatingId}
          onRecalcular={onRecalcular}
          onViewDetail={onViewDetail}
        />
      </td>
    </tr>
  )
}

function GroupHeaderRow({
  group,
  isExpanded,
  onToggle,
  isRecalculating,
  onRecalcularGrupo,
}: {
  group: { key: string; patientName: string; patientId: string; sessionCount: number; totalAmount: number; derivedStatus: string; invoices: Invoice[] }
  isExpanded: boolean
  onToggle: () => void
  isRecalculating: boolean
  onRecalcularGrupo: () => void
}) {
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronRightIcon
  return (
    <tr
      className="border-b border-border bg-muted/30 hover:bg-muted/50 cursor-pointer"
      onClick={onToggle}
    >
      <td className="py-3 px-4 font-medium">
        <div className="flex items-center gap-2">
          <ChevronIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>{group.patientName}</span>
          <span className="text-xs text-muted-foreground font-normal">
            ({group.sessionCount} {group.sessionCount === 1 ? "sessão" : "sessões"})
          </span>
        </div>
      </td>
      <td className="text-center py-3 px-4">{group.sessionCount}</td>
      <td className="text-right py-3 px-4 font-medium">{formatCurrencyBRL(group.totalAmount)}</td>
      <td className="text-center py-3 px-4">
        <StatusBadge status={group.derivedStatus} />
      </td>
      <td className="text-center py-3 px-4">
        <span className="text-muted-foreground">&mdash;</span>
      </td>
      <td className="text-center py-3 px-4">
        <span className="text-muted-foreground">&mdash;</span>
      </td>
      <td className="text-center py-3 px-4">
        <span className="text-muted-foreground">&mdash;</span>
      </td>
      <td className="text-right py-3 px-4">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onRecalcularGrupo() }}
            disabled={isRecalculating}
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            title="Recalcular todas as sessões"
          >
            <RefreshCwIcon className={`w-4 h-4 ${isRecalculating ? "animate-spin" : ""}`} />
          </button>
          <a
            href={`/api/financeiro/faturas/download-group-pdf?ids=${group.invoices.map(i => i.id).join(",")}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Baixar PDF do grupo"
          >
            <DownloadIcon className="w-4 h-4" />
          </a>
        </div>
      </td>
    </tr>
  )
}

interface InvoiceTableBodyProps {
  rows: InvoiceRow[]
  expandedGroups: Set<string>
  onToggleGroup: (key: string) => void
  recalculatingId: string | null
  recalculatingGroupKey: string | null
  onMarkPaid: (id: string) => void
  onRecalcular: (id: string) => void
  onRecalcularGrupo: (group: { patientId: string; professionalProfileId: string; referenceMonth: number; referenceYear: number; key: string }) => void
  onViewDetail: (id: string) => void
}

export function InvoiceTableBody({
  rows,
  expandedGroups,
  onToggleGroup,
  recalculatingId,
  recalculatingGroupKey,
  onMarkPaid,
  onRecalcular,
  onRecalcularGrupo,
  onViewDetail,
}: InvoiceTableBodyProps) {
  return (
    <>
      {rows.map(row => {
        if (row.type === "individual") {
          return (
            <IndividualRow
              key={row.invoice.id}
              invoice={row.invoice}
              recalculatingId={recalculatingId}
              onMarkPaid={onMarkPaid}
              onRecalcular={onRecalcular}
              onViewDetail={onViewDetail}
            />
          )
        }

        const { group } = row
        const isExpanded = expandedGroups.has(group.key)
        return (
          <React.Fragment key={group.key}>
            <GroupHeaderRow
              group={group}
              isExpanded={isExpanded}
              onToggle={() => onToggleGroup(group.key)}
              isRecalculating={recalculatingGroupKey === group.key}
              onRecalcularGrupo={() => onRecalcularGrupo({
                patientId: group.patientId,
                professionalProfileId: group.invoices[0].professionalProfile.id,
                referenceMonth: group.referenceMonth,
                referenceYear: group.referenceYear,
                key: group.key,
              })}
            />
            {isExpanded && group.invoices.map(inv => (
              <tr key={inv.id} className="border-b border-border last:border-0 bg-background">
                <td className="py-2.5 px-4 pl-10">
                  <div className="flex items-center gap-2 border-l-2 border-muted-foreground/20 pl-3">
                    <span className="text-muted-foreground text-sm">
                      {formatDateBR(inv.dueDate)}
                    </span>
                  </div>
                </td>
                <td className="text-center py-2.5 px-4">{inv.totalSessions}</td>
                <td className="text-right py-2.5 px-4">{formatCurrencyBRL(Number(inv.totalAmount))}</td>
                <td className="text-center py-2.5 px-4">
                  <StatusBadge status={inv.status} />
                </td>
                <td className="text-center py-2.5 px-4">
                  <NfBadgeCell invoice={inv} />
                </td>
                <td className="text-center py-2.5 px-4">{formatDateBR(inv.dueDate)}</td>
                <td className="text-center py-2.5 px-4">
                  <PaymentCell invoice={inv} onMarkPaid={onMarkPaid} />
                </td>
                <td className="text-right py-2.5 px-4">
                  <ActionButtons
                    invoice={inv}
                    recalculatingId={recalculatingId}
                    onRecalcular={onRecalcular}
                    onViewDetail={onViewDetail}
                  />
                </td>
              </tr>
            ))}
          </React.Fragment>
        )
      })}
    </>
  )
}

export { STATUS_LABELS, STATUS_COLORS } from "./invoice-status"
