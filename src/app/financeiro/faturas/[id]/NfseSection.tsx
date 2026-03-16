"use client"

import React, { useState, useEffect } from "react"
import { toast } from "sonner"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { LoaderIcon } from "@/shared/components/ui/icons"
import type { InvoiceDetail, NfseEmissionRow } from "./types"
import NfseEmissionDialog from "./NfseEmissionDialog"

interface NfseSectionProps {
  invoice: InvoiceDetail
  nfseConfig: { codigoServico: string; codigoNbs?: string | null; cClassNbs?: string | null; descricaoServico: string | null; aliquotaIss: number }
  onRefresh: () => void
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

// =============================================================================
// Per-item mode — each session has its own card with description + emit button
// =============================================================================

interface PerItemPreview {
  invoiceItemId: string
  date: string | null
  valor: number
  descricao: string
}

function PerItemNfseSection({ invoice, nfseConfig, onRefresh }: NfseSectionProps) {
  const [previews, setPreviews] = useState<PerItemPreview[]>([])
  const [loadingPreviews, setLoadingPreviews] = useState(true)
  const [emittingItemId, setEmittingItemId] = useState<string | null>(null)
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

  async function handleEmitItem(itemId: string) {
    // If patient has no billing info, open dialog to collect it first
    if (!invoice.patient.billingCpf || !invoice.patient.addressStreet) {
      setShowDialogForItemId(itemId)
      return
    }
    // Emit directly
    setEmittingItemId(itemId)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}/nfse/emitir?itemId=${itemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao emitir NFS-e")
      } else {
        toast.success("NFS-e emitida")
        onRefresh()
      }
    } catch { toast.error("Erro de rede") }
    finally { setEmittingItemId(null) }
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
            const dateStr = item.appointment?.scheduledAt ? formatDateBR(item.appointment.scheduledAt) : null
            const description = emission?.descricao || preview?.descricao || item.description

            return (
              <div key={item.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                {/* Header: date + amount + status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {dateStr && <span className="text-xs font-medium">{dateStr}</span>}
                    <span className="text-xs text-muted-foreground">{formatCurrencyBRL(Number(item.total))}</span>
                  </div>
                  {emission && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${EMISSION_STATUS_STYLES[emission.status] || ""}`}>
                      {emission.status === "EMITIDA" ? `#${emission.numero}` : emission.status}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {description}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {/* Not yet emitted */}
                  {!emission && canEmit && (
                    <button
                      onClick={() => handleEmitItem(item.id)}
                      disabled={emittingItemId === item.id}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {emittingItemId === item.id ? "Emitindo..." : "Emitir NFS-e"}
                    </button>
                  )}

                  {/* ERRO — retry */}
                  {emission?.status === "ERRO" && canEmit && (
                    <>
                      {emission.erro && <span className="text-[10px] text-destructive flex-1">{emission.erro}</span>}
                      <button
                        onClick={() => handleEmitItem(item.id)}
                        disabled={emittingItemId === item.id}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                      >
                        {emittingItemId === item.id ? "..." : "Tentar novamente"}
                      </button>
                    </>
                  )}

                  {/* PENDENTE */}
                  {emission?.status === "PENDENTE" && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                      <LoaderIcon className="w-3 h-3 animate-spin" /> Processando...
                    </span>
                  )}

                  {/* EMITIDA — PDF + cancel */}
                  {emission?.status === "EMITIDA" && (
                    <>
                      <a
                        href={`/api/financeiro/faturas/${invoice.id}/nfse/pdf?emissionId=${emission.id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        PDF
                      </a>
                      <button
                        onClick={() => { setCancelEmissionId(emission.id); setCancelReason("") }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        Cancelar
                      </button>
                      {emission.emitidaAt && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(emission.emitidaAt).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </>
                  )}

                  {/* CANCELADA */}
                  {emission?.status === "CANCELADA" && canEmit && (
                    <button
                      onClick={() => handleEmitItem(item.id)}
                      disabled={emittingItemId === item.id}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                    >
                      Re-emitir
                    </button>
                  )}
                </div>
              </div>
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

// =============================================================================
// Shared components
// =============================================================================

const EMISSION_STATUS_STYLES: Record<string, string> = {
  PENDENTE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  EMITIDA: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ERRO: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  CANCELADA: "bg-muted text-muted-foreground",
}

function StatusBadge({ label, style, spinning, strikethrough }: { label: string; style: "amber" | "green" | "red" | "muted"; spinning?: boolean; strikethrough?: boolean }) {
  const colors = { amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", muted: "bg-muted text-muted-foreground" }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors[style]} ${strikethrough ? "line-through" : ""}`}>
      {spinning && <LoaderIcon className="w-3 h-3 animate-spin" />}
      {label}
    </span>
  )
}

function CancelConfirmBox({ cancelReason, setCancelReason, cancelling, onConfirm, onBack }: { cancelReason: string; setCancelReason: (v: string) => void; cancelling: boolean; onConfirm: () => void; onBack: () => void }) {
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

function HistoryToggle({ invoiceId, showHistory, historyLogs, loadingHistory, onToggle }: { invoiceId: string; showHistory: boolean; historyLogs: NfseLogEntry[]; loadingHistory: boolean; onToggle: () => void }) {
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
