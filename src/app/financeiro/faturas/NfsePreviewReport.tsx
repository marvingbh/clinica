"use client"

import { useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { formatCurrencyBRL } from "@/lib/financeiro/format"

interface NfsePreviewRow {
  invoiceId: string
  patientName: string
  professionalName: string
  sessions: number
  credits: number
  totalAmount: number
  dueDate: string
  status: string
  nfseStatus: string | null
  nfseObs: string | null
  responsavelNome: string
  responsavelCpf: string | null
  descricao: string
}

interface NfsePreviewReportProps {
  month: number
  year: number
  invoiceIds: string[]
  onClose: () => void
}

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente", ENVIADO: "Enviado", PAGO: "Pago",
  PARCIAL: "Parcial", CANCELADO: "Cancelado",
}

const NFSE_LABELS: Record<string, string> = {
  EMITIDA: "Emitida", PENDENTE: "Processando", ERRO: "Erro",
}

export function NfsePreviewReport({ month, year, invoiceIds, onClose }: NfsePreviewReportProps) {
  const [rows, setRows] = useState<NfsePreviewRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/financeiro/faturas/nfse-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year, invoiceIds }),
    })
      .then(r => r.json())
      .then(data => setRows(data.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [month, year, invoiceIds])

  const filteredRows = rows

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 print:hidden" onClick={onClose} />
      <div className="fixed inset-4 sm:inset-8 z-50 bg-background border border-border rounded-2xl shadow-lg flex flex-col overflow-hidden print:static print:inset-0 print:border-0 print:shadow-none print:rounded-none print:overflow-visible">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 print:hidden">
          <h2 className="text-lg font-semibold text-foreground">
            Preview NFS-e — {String(month).padStart(2, "0")}/{year}
          </h2>
          <div className="flex items-center gap-2">
            <a
              href={`/api/financeiro/faturas/nfse-preview/pdf?month=${month}&year=${year}&invoiceIds=${invoiceIds.join(",")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-input bg-background text-foreground hover:bg-muted transition-colors"
            >
              Exportar PDF
            </a>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
        {/* Print-only header */}
        <div className="hidden print:block px-6 py-4">
          <h2 className="text-lg font-semibold">Preview NFS-e — {String(month).padStart(2, "0")}/{year}</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma fatura encontrada</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-4">Paciente</th>
                  <th className="py-3 px-2 w-36">Responsável</th>
                  <th className="py-3 px-2 text-center w-16">Sessões</th>
                  <th className="py-3 px-2 text-center w-16">Créditos</th>
                  <th className="py-3 px-2 text-right w-24">Total</th>
                  <th className="py-3 px-2 w-32">Obs. NFS-e</th>
                  <th className="py-3 px-4">Descrição NFS-e</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.invoiceId} className="border-b border-border last:border-0 hover:bg-muted/30 align-top">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">{row.patientName}</div>
                      <div className="text-xs text-muted-foreground">{row.professionalName}</div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="text-xs text-foreground">{row.responsavelNome}</div>
                      {row.responsavelCpf && <div className="text-[10px] text-muted-foreground tabular-nums">{row.responsavelCpf}</div>}
                    </td>
                    <td className="py-3 px-2 text-center tabular-nums">{row.sessions}</td>
                    <td className="py-3 px-2 text-center tabular-nums">{row.credits > 0 ? row.credits : "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{formatCurrencyBRL(row.totalAmount)}</td>
                    <td className="py-3 px-2">
                      {row.nfseObs ? (
                        <div className="text-xs text-muted-foreground">{row.nfseObs}</div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="text-xs text-foreground leading-relaxed">{row.descricao}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground shrink-0 print:hidden">
          {filteredRows.length} fatura(s)
        </div>
      </div>
    </>,
    document.body
  )
}
