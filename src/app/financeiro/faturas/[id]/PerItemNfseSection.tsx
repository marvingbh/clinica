"use client"

import React, { useState, useEffect } from "react"
import { toast } from "sonner"
import type { NfseEmissionRow } from "./types"
import NfseEmissionDialog from "./NfseEmissionDialog"
import PerItemNfseCard from "./PerItemNfseCard"
import { CancelConfirmBox } from "./NfseSectionShared"
import type { NfseSectionProps } from "./NfseSectionShared"

interface PerItemPreview {
  invoiceItemId: string
  date: string | null
  valor: number
  descricao: string
}

export default function PerItemNfseSection({ invoice, nfseConfig, onRefresh }: NfseSectionProps) {
  const [previews, setPreviews] = useState<PerItemPreview[]>([])
  const [loadingPreviews, setLoadingPreviews] = useState(true)
  const [showDialogForItemId, setShowDialogForItemId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelEmissionId, setCancelEmissionId] = useState<string | null>(null)

  const canEmit = invoice.status === "PAGO" || invoice.status === "ENVIADO"

  // Fetch per-item descriptions on mount
  useEffect(() => {
    fetch(`/api/financeiro/faturas/${invoice.id}/nfse/preview`)
      .then(r => r.json())
      .then(data => { if (data.items) setPreviews(data.items) })
      .catch(() => {})
      .finally(() => setLoadingPreviews(false))
  }, [invoice.id])

  // Map emissions by invoiceItemId for quick lookup
  const emissionByItemId = new Map<string, NfseEmissionRow>()
  for (const e of invoice.nfseEmissions) {
    if (e.invoiceItemId) emissionByItemId.set(e.invoiceItemId, e)
  }

  // Billable items (skip CREDITO)
  const billableItems = invoice.items.filter(i => i.type !== "CREDITO")

  const emitidaCount = invoice.nfseEmissions.filter(e => e.status === "EMITIDA").length
  const totalBillable = billableItems.length

  function handleEmitItem(itemId: string) {
    // Always open dialog so the user can review description and billing info
    setShowDialogForItemId(itemId)
  }

  async function handleCancelEmission() {
    if (!cancelEmissionId || !cancelReason.trim() || cancelReason.trim().length < 15) {
      toast.error("Motivo do cancelamento deve ter pelo menos 15 caracteres")
      return
    }
    setCancelling(true)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}/nfse/cancelar?emissionId=${cancelEmissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: cancelReason.trim(), codigoMotivo: 2 }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Erro ao cancelar"); return }
      toast.success("NFS-e cancelada")
      setCancelEmissionId(null)
      setCancelReason("")
      onRefresh()
    } catch { toast.error("Erro de rede") }
    finally { setCancelling(false) }
  }

  return (
    <div className="p-4 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">NFS-e por sessao</h3>
        {totalBillable > 0 && (
          <span className="text-xs text-muted-foreground">
            {emitidaCount}/{totalBillable} emitida{emitidaCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!canEmit && invoice.status !== "CANCELADO" && (
        <p className="text-xs text-muted-foreground">A fatura precisa estar com status Pago ou Enviado para emitir NFS-e.</p>
      )}

      {loadingPreviews ? (
        <p className="text-xs text-muted-foreground animate-pulse">Carregando descricoes...</p>
      ) : (
        <div className="space-y-2">
          {billableItems.map((item) => {
            const emission = emissionByItemId.get(item.id)
            const preview = previews.find(p => p.invoiceItemId === item.id)
            const description = emission?.descricao || preview?.descricao || item.description

            return (
              <PerItemNfseCard
                key={item.id}
                item={item}
                invoiceId={invoice.id}
                emission={emission}
                description={description}
                canEmit={canEmit}
                emittingItemId={null}
                onEmit={handleEmitItem}
                onStartCancel={(emissionId) => { setCancelEmissionId(emissionId); setCancelReason("") }}
              />
            )
          })}
        </div>
      )}

      {/* Cancel confirmation inline */}
      {cancelEmissionId && (
        <CancelConfirmBox
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          cancelling={cancelling}
          onConfirm={handleCancelEmission}
          onBack={() => { setCancelEmissionId(null); setCancelReason("") }}
        />
      )}

      {/* Billing info dialog — opens when patient has no CPF/address and user clicks emit */}
      {showDialogForItemId && (() => {
        const dialogItem = invoice.items.find(i => i.id === showDialogForItemId)
        return (
          <NfseEmissionDialog
            invoiceId={invoice.id} patientId={invoice.patient.id} patientName={invoice.patient.name}
            patientCpf={invoice.patient.cpf} patientCpfNota={invoice.patient.billingCpf ?? null}
            patientBillingName={invoice.patient.billingResponsibleName ?? null}
            patientAddress={{ street: invoice.patient.addressStreet, number: invoice.patient.addressNumber, neighborhood: invoice.patient.addressNeighborhood, city: invoice.patient.addressCity, state: invoice.patient.addressState, zip: invoice.patient.addressZip }}
            totalAmount={dialogItem?.total || invoice.totalAmount}
            itemId={showDialogForItemId}
            defaultCodigoServico={nfseConfig.codigoServico} defaultCodigoNbs={nfseConfig.codigoNbs || ""} defaultCClassNbs={nfseConfig.cClassNbs || ""}
            defaultDescricao={nfseConfig.descricaoServico || "Servicos de saude"} defaultAliquotaIss={nfseConfig.aliquotaIss}
            onClose={() => { setShowDialogForItemId(null); onRefresh() }}
            onSuccess={() => { setShowDialogForItemId(null); toast.success("NFS-e emitida"); onRefresh() }}
          />
        )
      })()}
    </div>
  )
}
