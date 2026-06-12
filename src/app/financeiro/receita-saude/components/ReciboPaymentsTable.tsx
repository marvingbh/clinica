"use client"

import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { ReciboStatusBadge } from "./ReciboStatusBadge"
import { ReciboBlockerBadge } from "./ReciboBlockerBadge"
import type { ReciboRowView } from "./types"

interface Props {
  rows: ReciboRowView[]
  selected: Set<string>
  onToggle: (paymentKey: string) => void
  onCancel: (emissionId: string, paymentKey: string) => void
}

function rowStatusLabel(row: ReciboRowView): "PENDENTE" | "EXPORTADO" | "EMITIDO" | "ERRO" | "CANCELADO" {
  return row.status?.status ?? "PENDENTE"
}

export function ReciboPaymentsTable({ rows, selected, onToggle }: Props) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-muted-foreground">Nenhum pagamento no período.</div>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Beneficiário</th>
            <th className="px-3 py-2">Pagador</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2">Profissional</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const status = rowStatusLabel(row)
            const blocked = row.blockers.length > 0 || row.fullyRefunded
            const selectable = !blocked && status !== "EMITIDO"
            return (
              <tr key={row.paymentKey} className={blocked ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    disabled={!selectable}
                    checked={selected.has(row.paymentKey)}
                    onChange={() => onToggle(row.paymentKey)}
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.paymentDate ? formatDateBR(row.paymentDate) : <span className="text-red-600">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div>{row.beneficiaryName}</div>
                  {row.blockers.length > 0 ? (
                    <ReciboBlockerBadge blockers={row.blockers} patientId={row.patientId} />
                  ) : (
                    <div className="text-xs text-muted-foreground">{row.beneficiaryCpf}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div>{row.payerName}</div>
                  <div className="text-xs text-muted-foreground">{row.payerCpf}</div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrencyBRL(row.amount)}</td>
                <td className="px-3 py-2">{row.professionalName}</td>
                <td className="px-3 py-2">
                  <ReciboStatusBadge status={status} />
                  {row.refundWarning && (
                    <div className="mt-1 text-xs text-amber-600">Estorno vinculado — confira antes de emitir</div>
                  )}
                  {row.status?.erro && <div className="mt-1 text-xs text-red-600">{row.status.erro}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
