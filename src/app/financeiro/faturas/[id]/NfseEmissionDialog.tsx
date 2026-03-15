"use client"

import React, { useState } from "react"
import { createPortal } from "react-dom"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { AlertTriangleIcon } from "@/shared/components/ui/icons"

interface NfseEmissionDialogProps {
  invoiceId: string
  patientId: string
  patientName: string
  patientCpf: string | null
  patientCpfNota: string | null
  patientBillingName: string | null
  totalAmount: string
  defaultCodigoServico: string
  defaultDescricao: string
  defaultAliquotaIss: number
  onClose: () => void
  onSuccess: () => void
}

export default function NfseEmissionDialog({
  invoiceId,
  patientId,
  patientName,
  patientCpf,
  patientCpfNota,
  patientBillingName,
  totalAmount,
  defaultCodigoServico,
  defaultDescricao,
  defaultAliquotaIss,
  onClose,
  onSuccess,
}: NfseEmissionDialogProps) {
  const effectiveCpf = patientCpfNota || patientCpf || ""
  const [billingCpf, setCpfNota] = useState(effectiveCpf)
  const [billingName, setBillingName] = useState(patientBillingName || patientName)
  const [descricao, setDescricao] = useState(defaultDescricao)
  const [aliquotaIss, setAliquotaIss] = useState(String(defaultAliquotaIss))
  const [codigoServico, setCodigoServico] = useState(defaultCodigoServico)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const cleanCpf = billingCpf.replace(/\D/g, "")
    if (!cleanCpf || cleanCpf.length !== 11) {
      setError("CPF invalido. Informe 11 digitos.")
      return
    }

    setSubmitting(true)
    setError(null)

    const overrides: Record<string, unknown> = {}
    if (codigoServico !== defaultCodigoServico) overrides.codigoServico = codigoServico
    if (descricao !== defaultDescricao) overrides.descricao = descricao
    const parsedAliquota = parseFloat(aliquotaIss)
    if (!isNaN(parsedAliquota) && parsedAliquota !== defaultAliquotaIss) {
      overrides.aliquotaIss = parsedAliquota
    }
    // Send the CPF and name to use and save back to patient
    overrides.billingCpf = cleanCpf
    if (billingName !== patientName) overrides.billingResponsibleName = billingName

    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/nfse/emitir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Erro ao emitir NFS-e")
        setSubmitting(false)
        return
      }
      onSuccess()
    } catch {
      setError("Erro de rede ao emitir NFS-e")
      setSubmitting(false)
    }
  }

  const inputCls = "w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background rounded-xl border border-border shadow-lg w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Emitir NFS-e</h3>

        {/* Tomador */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Tomador (Responsavel Financeiro)</label>
          <input
            type="text"
            value={billingName}
            onChange={(e) => setBillingName(e.target.value)}
            placeholder="Nome do responsavel financeiro"
            className={inputCls}
          />
          <p className="text-xs text-muted-foreground mt-1">Paciente: {patientName}</p>

          <div className="mt-2">
            <label className="text-xs font-medium text-muted-foreground">
              CPF para Nota Fiscal
            </label>
            <input
              type="text"
              value={billingCpf}
              onChange={(e) => setCpfNota(e.target.value)}
              placeholder="000.000.000-00"
              className={inputCls}
            />
            {!effectiveCpf && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1">
                <AlertTriangleIcon className="w-3.5 h-3.5" />
                <span>Nenhum CPF cadastrado. Informe o CPF do responsavel.</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              CPF do responsavel financeiro (pai/mae). Sera salvo no cadastro do paciente.
            </p>
          </div>
        </div>

        {/* Valor */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Valor</label>
          <p className="text-sm font-bold">{formatCurrencyBRL(Number(totalAmount))}</p>
        </div>

        {/* Codigo de servico */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Codigo de Servico</label>
          <input type="text" value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} className={inputCls} />
        </div>

        {/* Descricao */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Descricao do Servico</label>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>

        {/* Aliquota ISS */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Aliquota ISS (%)</label>
          <input type="number" step="0.01" min="0" max="100" value={aliquotaIss} onChange={(e) => setAliquotaIss(e.target.value)} className="w-24 px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={submitting || !billingCpf.replace(/\D/g, "")} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {submitting ? "Emitindo..." : "Confirmar Emissao"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
