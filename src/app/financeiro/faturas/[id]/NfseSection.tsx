"use client"

import React, { useState } from "react"
import { toast } from "sonner"
import NfseEmissionDialog from "./NfseEmissionDialog"
import PerItemNfseSection from "./PerItemNfseSection"
import { StatusBadge, CancelConfirmBox, HistoryToggle } from "./NfseSectionShared"
import type { NfseSectionProps, NfseLogEntry } from "./NfseSectionShared"

export default function NfseSection({ invoice, nfseConfig, onRefresh }: NfseSectionProps) {
  const isPerItem = invoice.patient.nfsePerAppointment

  if (isPerItem) {
    return <PerItemNfseSection invoice={invoice} nfseConfig={nfseConfig} onRefresh={onRefresh} />
  }

  return <PerInvoiceNfseSection invoice={invoice} nfseConfig={nfseConfig} onRefresh={onRefresh} />
}

// =============================================================================
// Per-invoice mode (original behavior)
// =============================================================================

function PerInvoiceNfseSection({ invoice, nfseConfig, onRefresh }: NfseSectionProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyLogs, setHistoryLogs] = useState<NfseLogEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const canEmit =
    (invoice.status === "PAGO" || invoice.status === "ENVIADO") &&
    (invoice.nfseStatus === null || invoice.nfseStatus === "ERRO")

  function loadHistory() {
    if (showHistory) { setShowHistory(false); return }
    setLoadingHistory(true)
    fetch(`/api/financeiro/faturas/${invoice.id}/nfse/historico`)
      .then(r => r.json())
      .then(data => { setHistoryLogs(data.logs || []); setShowHistory(true) })
      .catch(() => toast.error("Erro ao carregar historico"))
      .finally(() => setLoadingHistory(false))
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
      if (!res.ok) { toast.error(data.error || "Erro ao cancelar NFS-e"); return }
      toast.success("NFS-e cancelada com sucesso")
      setShowCancelConfirm(false)
      setCancelReason("")
      onRefresh()
    } catch { toast.error("Erro de rede ao cancelar NFS-e") }
    finally { setCancelling(false) }
  }

  function renderStatus() {
    switch (invoice.nfseStatus) {
      case "PENDENTE": return <StatusBadge label="Processando..." style="amber" spinning />
      case "EMITIDA": return (
        <div className="space-y-2">
          <StatusBadge label={`NFS-e #${invoice.nfseNumero}`} style="green" />
          <div className="text-xs text-muted-foreground space-y-0.5">
            {invoice.nfseCodigoVerificacao && <p>Verificacao: {invoice.nfseCodigoVerificacao}</p>}
            {invoice.nfseEmitidaAt && <p>Emitida em {new Date(invoice.nfseEmitidaAt).toLocaleDateString("pt-BR")}</p>}
          </div>
        </div>
      )
      case "ERRO": return (
        <div className="space-y-2">
          <StatusBadge label="Erro na emissao" style="red" />
          {invoice.nfseErro && <p className="text-xs text-destructive">{invoice.nfseErro}</p>}
          <button onClick={() => setShowDialog(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors">
            Tentar Novamente
          </button>
        </div>
      )
      case "CANCELADA": return (
        <div className="space-y-1">
          <StatusBadge label="NFS-e Cancelada" style="muted" strikethrough />
          <div className="text-xs text-muted-foreground space-y-0.5">
            {invoice.nfseCanceladaAt && <p>Cancelada em {new Date(invoice.nfseCanceladaAt).toLocaleDateString("pt-BR")}</p>}
            {invoice.nfseCancelamentoMotivo && <p>Motivo: {invoice.nfseCancelamentoMotivo}</p>}
          </div>
        </div>
      )
      default: return null
    }
  }

  return (
    <div className="p-4 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">NFS-e</h3>
        {canEmit && !invoice.nfseStatus && (
          <button onClick={() => setShowDialog(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            Emitir NFS-e
          </button>
        )}
      </div>

      {renderStatus()}

      {invoice.nfseStatus === "EMITIDA" && (
        <div className="flex gap-2">
          <a href={`/api/financeiro/faturas/${invoice.id}/nfse/pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Baixar PDF</a>
          <a href={`/api/financeiro/faturas/${invoice.id}/nfse/pdf?source=adn`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors">Baixar do Gov.br</a>
          {!showCancelConfirm && <button onClick={() => setShowCancelConfirm(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">Cancelar NFS-e</button>}
        </div>
      )}

      {showCancelConfirm && <CancelConfirmBox cancelReason={cancelReason} setCancelReason={setCancelReason} cancelling={cancelling} onConfirm={handleCancel} onBack={() => { setShowCancelConfirm(false); setCancelReason("") }} />}

      {!invoice.nfseStatus && !canEmit && invoice.status !== "CANCELADO" && (
        <p className="text-xs text-muted-foreground">A fatura precisa estar com status Pago ou Enviado para emitir NFS-e.</p>
      )}

      <HistoryToggle invoiceId={invoice.id} showHistory={showHistory} historyLogs={historyLogs} loadingHistory={loadingHistory} onToggle={loadHistory} />

      {showDialog && (
        <NfseEmissionDialog
          invoiceId={invoice.id} patientId={invoice.patient.id} patientName={invoice.patient.name}
          patientCpf={invoice.patient.cpf} patientCpfNota={invoice.patient.billingCpf ?? null}
          patientBillingName={invoice.patient.billingResponsibleName ?? null}
          patientAddress={{ street: invoice.patient.addressStreet, number: invoice.patient.addressNumber, neighborhood: invoice.patient.addressNeighborhood, city: invoice.patient.addressCity, state: invoice.patient.addressState, zip: invoice.patient.addressZip }}
          totalAmount={invoice.totalAmount}
          defaultCodigoServico={nfseConfig.codigoServico} defaultCodigoNbs={nfseConfig.codigoNbs || ""} defaultCClassNbs={nfseConfig.cClassNbs || ""}
          defaultDescricao={nfseConfig.descricaoServico || "Servicos de saude"} defaultAliquotaIss={nfseConfig.aliquotaIss}
          onClose={() => { setShowDialog(false); onRefresh() }}
          onSuccess={() => { setShowDialog(false); toast.success("NFS-e em processamento"); onRefresh() }}
        />
      )}
    </div>
  )
}
