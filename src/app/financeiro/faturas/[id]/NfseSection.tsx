"use client"

import React, { useState } from "react"
import { toast } from "sonner"
import { LoaderIcon } from "@/shared/components/ui/icons"
import type { InvoiceDetail } from "./types"
import NfseEmissionDialog from "./NfseEmissionDialog"

interface NfseSectionProps {
  invoice: InvoiceDetail
  nfseConfig: { codigoServico: string; codigoNbs?: string | null; cClassNbs?: string | null; descricaoServico: string | null; aliquotaIss: number }
  onRefresh: () => void
}

function NfseStatusPendente() {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <LoaderIcon className="w-3 h-3 animate-spin" />
        Processando...
      </span>
    </div>
  )
}

function NfseStatusEmitida({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          NFS-e #{invoice.nfseNumero}
        </span>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {invoice.nfseCodigoVerificacao && (
          <p>Verificacao: {invoice.nfseCodigoVerificacao}</p>
        )}
        {invoice.nfseEmitidaAt && (
          <p>Emitida em {new Date(invoice.nfseEmitidaAt).toLocaleDateString("pt-BR")}</p>
        )}
      </div>
    </div>
  )
}

function NfseStatusErro({ invoice, onRetry }: { invoice: InvoiceDetail; onRetry: () => void }) {
  return (
    <div className="space-y-2">
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
        Erro na emissao
      </span>
      {invoice.nfseErro && (
        <p className="text-xs text-destructive">{invoice.nfseErro}</p>
      )}
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
      >
        Tentar Novamente
      </button>
    </div>
  )
}

function NfseStatusCancelada({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground line-through">
        NFS-e Cancelada
      </span>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {invoice.nfseCanceladaAt && (
          <p>Cancelada em {new Date(invoice.nfseCanceladaAt).toLocaleDateString("pt-BR")}</p>
        )}
        {invoice.nfseCancelamentoMotivo && (
          <p>Motivo: {invoice.nfseCancelamentoMotivo}</p>
        )}
      </div>
    </div>
  )
}

interface NfseLogEntry {
  id: string
  operation: string
  statusCode: number | null
  error: string | null
  durationMs: number | null
  createdAt: string
}

export default function NfseSection({ invoice, nfseConfig, onRefresh }: NfseSectionProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyLogs, setHistoryLogs] = useState<NfseLogEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  function loadHistory() {
    if (showHistory) { setShowHistory(false); return }
    setLoadingHistory(true)
    fetch(`/api/financeiro/faturas/${invoice.id}/nfse/historico`)
      .then(r => r.json())
      .then(data => { setHistoryLogs(data.logs || []); setShowHistory(true) })
      .catch(() => toast.error("Erro ao carregar historico"))
      .finally(() => setLoadingHistory(false))
  }

  const canEmit =
    (invoice.status === "PAGO" || invoice.status === "ENVIADO") &&
    (invoice.nfseStatus === null || invoice.nfseStatus === "ERRO")

  function handleRetry() {
    setShowDialog(true)
  }

  async function handleCancel() {
    if (!cancelReason.trim() || cancelReason.trim().length < 15) {
      toast.error("Motivo do cancelamento deve ter pelo menos 15 caracteres")
      return
    }
    setCancelling(true)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}/nfse/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: cancelReason.trim(), codigoMotivo: 2 }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao cancelar NFS-e")
        return
      }
      toast.success("NFS-e cancelada com sucesso")
      setShowCancelConfirm(false)
      setCancelReason("")
      onRefresh()
    } catch {
      toast.error("Erro de rede ao cancelar NFS-e")
    } finally {
      setCancelling(false)
    }
  }

  function renderStatus() {
    switch (invoice.nfseStatus) {
      case "PENDENTE":
        return <NfseStatusPendente />
      case "EMITIDA":
        return <NfseStatusEmitida invoice={invoice} />
      case "ERRO":
        return <NfseStatusErro invoice={invoice} onRetry={handleRetry} />
      case "CANCELADA":
        return <NfseStatusCancelada invoice={invoice} />
      default:
        return null
    }
  }

  return (
    <div className="p-4 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">NFS-e</h3>
        {canEmit && !invoice.nfseStatus && (
          <button
            onClick={() => setShowDialog(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Emitir NFS-e
          </button>
        )}
      </div>

      {renderStatus()}

      {/* Actions for EMITIDA */}
      {invoice.nfseStatus === "EMITIDA" && (
        <div className="flex gap-2">
          <a
            href={`/api/financeiro/faturas/${invoice.id}/nfse/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Baixar PDF
          </a>
          {!showCancelConfirm && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              Cancelar NFS-e
            </button>
          )}
        </div>
      )}

      {showCancelConfirm && (
        <div className="space-y-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
          <p className="text-xs font-medium text-destructive">Confirmar cancelamento da NFS-e?</p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Motivo do cancelamento..."
            rows={2}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelando..." : "Confirmar"}
            </button>
            <button
              onClick={() => { setShowCancelConfirm(false); setCancelReason("") }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* Not eligible for emission message */}
      {!invoice.nfseStatus && !canEmit && invoice.status !== "CANCELADO" && (
        <p className="text-xs text-muted-foreground">
          A fatura precisa estar com status Pago ou Enviado para emitir NFS-e.
        </p>
      )}

      {/* History toggle */}
      <button
        onClick={loadHistory}
        disabled={loadingHistory}
        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
      >
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

      {showDialog && (
        <NfseEmissionDialog
          invoiceId={invoice.id}
          patientId={invoice.patient.id}
          patientName={invoice.patient.name}
          patientCpf={invoice.patient.cpf}
          patientCpfNota={invoice.patient.billingCpf ?? null}
          patientBillingName={invoice.patient.billingResponsibleName ?? null}
          patientAddress={{
            street: invoice.patient.addressStreet,
            number: invoice.patient.addressNumber,
            neighborhood: invoice.patient.addressNeighborhood,
            city: invoice.patient.addressCity,
            state: invoice.patient.addressState,
            zip: invoice.patient.addressZip,
          }}
          totalAmount={invoice.totalAmount}
          defaultCodigoServico={nfseConfig.codigoServico}
          defaultCodigoNbs={nfseConfig.codigoNbs || ""}
          defaultCClassNbs={nfseConfig.cClassNbs || ""}
          defaultDescricao={nfseConfig.descricaoServico || "Servicos de saude"}
          defaultAliquotaIss={nfseConfig.aliquotaIss}
          onClose={() => { setShowDialog(false); onRefresh() }}
          onSuccess={() => {
            setShowDialog(false)
            toast.success("NFS-e em processamento")
            onRefresh()
          }}
        />
      )}
    </div>
  )
}
