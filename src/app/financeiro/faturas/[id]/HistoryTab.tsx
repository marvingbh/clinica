"use client"

import React, { useState, useCallback } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { STATUS_LABELS } from "../invoice-status"

interface AuditLogEntry {
  id: string
  action: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  createdAt: string
  user: { name: string } | null
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  INVOICE_STATUS_CHANGED: "Status alterado",
  INVOICE_RECALCULATED: "Fatura recalculada",
  INVOICE_ITEM_ADDED: "Item adicionado",
  INVOICE_ITEM_UPDATED: "Item atualizado",
  INVOICE_ITEM_DELETED: "Item removido",
  INVOICE_DELETED: "Fatura excluída",
  INVOICE_SENT: "Fatura enviada",
  INVOICE_DUE_DATE_CHANGED: "Vencimento alterado",
  INVOICE_NF_CHANGED: "Nota fiscal alterada",
  INVOICE_NOTES_UPDATED: "Observações atualizadas",
}

function formatAuditDetail(log: AuditLogEntry): string {
  const { action, oldValues, newValues } = log
  switch (action) {
    case "INVOICE_STATUS_CHANGED":
      return `${STATUS_LABELS[(oldValues?.status as string) || ""] || oldValues?.status || "?"} → ${STATUS_LABELS[(newValues?.status as string) || ""] || newValues?.status || "?"}`
    case "INVOICE_DUE_DATE_CHANGED":
      return `${oldValues?.dueDate ? formatDateBR(String(oldValues.dueDate)) : "?"} → ${newValues?.dueDate ? formatDateBR(String(newValues.dueDate)) : "?"}`
    case "INVOICE_ITEM_ADDED":
      return `${newValues?.description || ""} (${formatCurrencyBRL(Number(newValues?.unitPrice || 0))})`
    case "INVOICE_ITEM_UPDATED":
      return `${newValues?.description || oldValues?.description || ""}`
    case "INVOICE_ITEM_DELETED":
      return `${oldValues?.description || ""}`
    case "INVOICE_NF_CHANGED":
      return newValues?.notaFiscalEmitida ? "Marcada como emitida" : "Desmarcada"
    case "INVOICE_SENT":
      return `WhatsApp: ${newValues?.recipient || ""}`
    default:
      return ""
  }
}

interface HistoryTabProps {
  invoiceId: string
}

export default function HistoryTab({ invoiceId }: HistoryTabProps) {
  const [historyLogs, setHistoryLogs] = useState<AuditLogEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    const res = await fetch(`/api/financeiro/faturas/${invoiceId}/historico`)
    if (res.ok) {
      const data = await res.json()
      setHistoryLogs(data.logs)
    }
    setLoadingHistory(false)
    setHistoryLoaded(true)
  }, [invoiceId])

   
  useEffect(() => {
    if (!historyLoaded) {
      fetchHistory()
    }
  }, [historyLoaded, fetchHistory])

  return (
    <div className="space-y-2">
      {loadingHistory ? (
        <p className="text-sm text-muted-foreground animate-pulse">Carregando histórico...</p>
      ) : historyLogs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-2.5 px-4 font-medium">Data/Hora</th>
                <th className="text-left py-2.5 px-4 font-medium">Ação</th>
                <th className="text-left py-2.5 px-4 font-medium">Detalhe</th>
                <th className="text-left py-2.5 px-4 font-medium">Usuário</th>
              </tr>
            </thead>
            <tbody>
              {historyLogs.map(log => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleDateString("pt-BR")}{" "}
                    {new Date(log.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-2.5 px-4 font-medium">
                    {AUDIT_ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">
                    {formatAuditDetail(log)}
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">
                    {log.user?.name || "Sistema"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
