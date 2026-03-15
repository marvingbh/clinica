"use client"

import React, { useState } from "react"
import { toast } from "sonner"
import { LoaderIcon } from "@/shared/components/ui/icons"
import type { InvoiceDetail } from "./types"
import NfseEmissionDialog from "./NfseEmissionDialog"

interface NfseSectionProps {
  invoice: InvoiceDetail
  nfseConfig: { codigoServico: string; descricaoServico: string | null; aliquotaIss: number }
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

export default function NfseSection({ invoice, nfseConfig, onRefresh }: NfseSectionProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const canEmit =
    (invoice.status === "PAGO" || invoice.status === "ENVIADO") &&
    (invoice.nfseStatus === null || invoice.nfseStatus === "ERRO")

  function handleRetry() {
    setShowDialog(true)
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      toast.error("Informe o motivo do cancelamento")
      return
    }
    setCancelling(true)
    // TODO: POST /api/financeiro/faturas/[id]/nfse/cancelar when API is ready
    toast.info("Cancelamento de NFS-e sera implementado com a integracao ADN")
    setCancelling(false)
    setShowCancelConfirm(false)
    setCancelReason("")
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

      {/* Cancel action for EMITIDA */}
      {invoice.nfseStatus === "EMITIDA" && !showCancelConfirm && (
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
        >
          Cancelar NFS-e
        </button>
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

      {showDialog && (
        <NfseEmissionDialog
          invoiceId={invoice.id}
          patientId={invoice.patient.id}
          patientName={invoice.patient.name}
          patientCpf={invoice.patient.cpf}
          patientCpfNota={invoice.patient.billingCpf ?? null}
          patientBillingName={invoice.patient.billingResponsibleName ?? null}
          totalAmount={invoice.totalAmount}
          defaultCodigoServico={nfseConfig.codigoServico}
          defaultDescricao={nfseConfig.descricaoServico || "Servicos de saude"}
          defaultAliquotaIss={nfseConfig.aliquotaIss}
          onClose={() => setShowDialog(false)}
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
