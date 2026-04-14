"use client"

import React from "react"
import { LoaderIcon } from "@/shared/components/ui/icons"
import type { InvoiceDetail } from "./types"

export interface NfseLogEntry {
  id: string
  operation: string
  statusCode: number | null
  error: string | null
  durationMs: number | null
  createdAt: string
}

export interface NfseSectionProps {
  invoice: InvoiceDetail
  nfseConfig: { codigoServico: string; codigoNbs?: string | null; cClassNbs?: string | null; descricaoServico: string | null; aliquotaIss: number }
  onRefresh: () => void
}

export const EMISSION_STATUS_STYLES: Record<string, string> = {
  PENDENTE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  EMITIDA: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ERRO: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  CANCELADA: "bg-muted text-muted-foreground",
}

export function StatusBadge({ label, style, spinning, strikethrough }: { label: string; style: "amber" | "green" | "red" | "muted" | "blue"; spinning?: boolean; strikethrough?: boolean }) {
  const colors = { amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", muted: "bg-muted text-muted-foreground", blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors[style]} ${strikethrough ? "line-through" : ""}`}>
      {spinning && <LoaderIcon className="w-3 h-3 animate-spin" />}
      {label}
    </span>
  )
}

export function CancelConfirmBox({ cancelReason, setCancelReason, cancelling, onConfirm, onBack }: { cancelReason: string; setCancelReason: (v: string) => void; cancelling: boolean; onConfirm: () => void; onBack: () => void }) {
  return (
    <div className="space-y-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
      <p className="text-xs font-medium text-destructive">Confirmar cancelamento da NFS-e?</p>
      <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motivo do cancelamento (min 15 caracteres)..." rows={2} className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={cancelling} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50">
          {cancelling ? "Cancelando..." : "Confirmar"}
        </button>
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors">
          Voltar
        </button>
      </div>
    </div>
  )
}

export function HistoryToggle({ invoiceId, showHistory, historyLogs, loadingHistory, onToggle }: { invoiceId: string; showHistory: boolean; historyLogs: NfseLogEntry[]; loadingHistory: boolean; onToggle: () => void }) {
  return (
    <>
      <button onClick={onToggle} disabled={loadingHistory} className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">
        {loadingHistory ? "Carregando..." : showHistory ? "Ocultar historico" : "Ver historico de emissoes"}
      </button>
      {showHistory && historyLogs.length > 0 && (
        <div className="space-y-1 text-xs">
          {historyLogs.map((log) => (
            <div key={log.id} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${log.error ? "bg-red-500" : "bg-green-500"}`} />
              <span className="font-medium capitalize">{log.operation === "emit" ? "Emissao" : log.operation === "cancel" ? "Cancelamento" : log.operation}</span>
              <span className="text-muted-foreground">
                {new Date(log.createdAt).toLocaleDateString("pt-BR")} {new Date(log.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {log.statusCode && <span className="text-muted-foreground">HTTP {log.statusCode}</span>}
              {log.durationMs && <span className="text-muted-foreground">{log.durationMs}ms</span>}
              {log.error && <span className="text-destructive truncate max-w-[200px]" title={log.error}>{log.error}</span>}
            </div>
          ))}
        </div>
      )}
      {showHistory && historyLogs.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum registro de comunicacao com o ADN.</p>
      )}
    </>
  )
}
