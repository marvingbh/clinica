"use client"

import React, { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { AlertTriangleIcon } from "@/shared/components/ui/icons"

interface PerItemPreview {
  invoiceItemId: string
  date: string | null
  valor: number
  descricao: string
}

interface NfseEmissionDialogProps {
  invoiceId: string
  patientId: string
  patientName: string
  patientCpf: string | null
  patientCpfNota: string | null
  patientBillingName: string | null
  patientAddress: {
    street: string | null
    number: string | null
    neighborhood: string | null
    city: string | null
    state: string | null
    zip: string | null
  }
  totalAmount: string
  isPerItem?: boolean
  itemId?: string | null
  defaultCodigoServico: string
  defaultCodigoNbs: string
  defaultCClassNbs: string
  defaultDescricao: string
  defaultAliquotaIss: number
  onClose: () => void
  onSuccess: () => void
}

export default function NfseEmissionDialog({
  invoiceId,
  patientName,
  patientCpf,
  patientCpfNota,
  patientBillingName,
  patientAddress,
  totalAmount,
  isPerItem,
  itemId,
  defaultCodigoServico,
  defaultCodigoNbs,
  defaultCClassNbs,
  defaultDescricao,
  defaultAliquotaIss,
  onClose,
  onSuccess,
}: NfseEmissionDialogProps) {
  const effectiveCpf = patientCpfNota || patientCpf || ""
  const [billingCpf, setBillingCpf] = useState(effectiveCpf)
  const [billingName, setBillingName] = useState(patientBillingName || patientName)
  const [street, setStreet] = useState(patientAddress.street || "")
  const [number, setNumber] = useState(patientAddress.number || "")
  const [neighborhood, setNeighborhood] = useState(patientAddress.neighborhood || "")
  const [city, setCity] = useState(patientAddress.city || "")
  const [state, setState] = useState(patientAddress.state || "")
  const [zip, setZip] = useState(patientAddress.zip || "")

  // Per-invoice: single description
  const [descricao, setDescricao] = useState("")
  // Per-item: individual descriptions
  const [itemPreviews, setItemPreviews] = useState<PerItemPreview[]>([])
  const [loadingDescricao, setLoadingDescricao] = useState(true)

  useEffect(() => {
    fetch(`/api/financeiro/faturas/${invoiceId}/nfse/preview`)
      .then(res => res.json())
      .then(data => {
        if (data.items) setItemPreviews(data.items)
        // When emitting a single item, use that item's description
        if (itemId && data.items) {
          const match = (data.items as PerItemPreview[]).find(i => i.invoiceItemId === itemId)
          setDescricao(match?.descricao || data.descricao || defaultDescricao)
        } else {
          setDescricao(data.descricao || defaultDescricao)
        }
      })
      .catch(() => setDescricao(defaultDescricao))
      .finally(() => setLoadingDescricao(false))
  }, [invoiceId, itemId, defaultDescricao])

  const [aliquotaIss, setAliquotaIss] = useState(String(defaultAliquotaIss))
  const [codigoServico, setCodigoServico] = useState(defaultCodigoServico)
  const [codigoNbs, setCodigoNbs] = useState(defaultCodigoNbs)
  const [cClassNbs, setCClassNbs] = useState(defaultCClassNbs)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(): string | null {
    const cleanCpf = billingCpf.replace(/\D/g, "")
    if (!cleanCpf || cleanCpf.length !== 11) return "CPF invalido. Informe 11 digitos."
    if (!billingName.trim()) return "Nome do responsavel e obrigatorio."
    if (!street.trim()) return "Rua e obrigatoria para emissao de NFS-e."
    if (!neighborhood.trim()) return "Bairro e obrigatorio para emissao de NFS-e."
    if (!zip.replace(/\D/g, "") || zip.replace(/\D/g, "").length !== 8) return "CEP invalido. Informe 8 digitos."
    if (!codigoServico.trim()) return "Codigo de servico e obrigatorio."
    return null
  }

  async function handleSubmit() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)

    const overrides: Record<string, unknown> = {}
    if (codigoServico !== defaultCodigoServico) overrides.codigoServico = codigoServico
    if (codigoNbs !== defaultCodigoNbs) overrides.codigoNbs = codigoNbs
    if (cClassNbs !== defaultCClassNbs) overrides.cClassNbs = cClassNbs
    if (!isPerItem && descricao !== defaultDescricao) overrides.descricao = descricao
    const parsedAliquota = parseFloat(aliquotaIss)
    if (!isNaN(parsedAliquota) && parsedAliquota !== defaultAliquotaIss) {
      overrides.aliquotaIss = parsedAliquota
    }
    overrides.billingCpf = billingCpf.replace(/\D/g, "")
    if (billingName !== patientName) overrides.billingResponsibleName = billingName
    overrides.address = {
      street: street.trim(),
      number: number.trim() || "SN",
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      zip: zip.replace(/\D/g, ""),
    }

    try {
      const emitUrl = itemId
        ? `/api/financeiro/faturas/${invoiceId}/nfse/emitir?itemId=${itemId}`
        : `/api/financeiro/faturas/${invoiceId}/nfse/emitir`
      const res = await fetch(emitUrl, {
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
  const inputSmCls = "px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background rounded-xl border border-border shadow-lg w-full max-w-lg mx-4 p-6 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {isPerItem ? `Emitir ${itemPreviews.length} NFS-e` : "Emitir NFS-e"}
        </h3>

        {/* Tomador */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tomador (Responsavel Financeiro)</p>
          <input type="text" value={billingName} onChange={(e) => setBillingName(e.target.value)} placeholder="Nome completo" className={inputCls} />
          <p className="text-xs text-muted-foreground">Paciente: {patientName}</p>
          <input type="text" value={billingCpf} onChange={(e) => setBillingCpf(e.target.value)} placeholder="CPF: 000.000.000-00" className={inputCls} />
          {!effectiveCpf && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangleIcon className="w-3.5 h-3.5" />
              <span>Informe o CPF do responsavel financeiro.</span>
            </div>
          )}
        </div>

        {/* Endereco */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereco do Tomador</p>
          <div className="flex gap-2">
            <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua" className={`flex-1 ${inputSmCls}`} />
            <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Nro" className={`w-20 ${inputSmCls}`} />
          </div>
          <div className="flex gap-2">
            <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Bairro" className={`flex-1 ${inputSmCls}`} />
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" className={`flex-1 ${inputSmCls}`} />
          </div>
          <div className="flex gap-2">
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="UF" maxLength={2} className={`w-16 ${inputSmCls}`} />
            <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="CEP" className={`w-28 ${inputSmCls}`} />
          </div>
          <p className="text-xs text-muted-foreground">Dados serao salvos no cadastro do paciente.</p>
        </div>

        {/* Valor */}
        <div className="flex items-center justify-between py-1">
          <span className="text-xs font-medium text-muted-foreground">Valor total</span>
          <span className="text-sm font-bold">{formatCurrencyBRL(Number(totalAmount))}</span>
        </div>

        {/* Servico */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Servico</p>
          <div className="flex gap-2">
            <input type="text" value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} placeholder="cTribNac" className={`w-24 ${inputSmCls}`} />
            <input type="number" step="0.01" min="0" max="100" value={aliquotaIss} onChange={(e) => setAliquotaIss(e.target.value)} placeholder="ISS %" className={`w-20 ${inputSmCls}`} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Servico NBS</label>
            <select
              value={`${codigoNbs}_${cClassNbs}`}
              onChange={(e) => {
                const [nbs, cc] = e.target.value.split("_")
                setCodigoNbs(nbs)
                setCClassNbs(cc)
              }}
              className={inputCls}
            >
              <option value="_">Selecione</option>
              <option value="123019800_200029">123019800 | 200029 - Servicos de psicologia (Saude humana LC 214/2025)</option>
              <option value="123019800_000001">123019800 | 000001 - Servicos de psicologia (Tributado integralmente IBS/CBS)</option>
              <option value="112021000_000001">112021000 | 000001 - Pesquisa e desenvolvimento em psicologia (Tributado integralmente)</option>
              <option value="112021000_200016">112021000 | 200016 - Pesquisa e desenvolvimento em psicologia (ICT sem fins lucrativos)</option>
              <option value="123012200_200029">123012200 | 200029 - Servicos medicos especializados (Saude humana LC 214/2025)</option>
              <option value="123019900_200029">123019900 | 200029 - Outros servicos de saude humana (LC 214/2025)</option>
              <option value="123019900_000001">123019900 | 000001 - Outros servicos de saude humana (Tributado integralmente)</option>
            </select>
          </div>

          {/* Per-item: show each session's description */}
          {isPerItem && itemPreviews.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {itemPreviews.length} NFS-e {itemPreviews.length === 1 ? "sera emitida" : "serao emitidas"} individualmente:
              </p>
              {loadingDescricao ? (
                <p className="text-xs text-muted-foreground animate-pulse">Gerando descricoes...</p>
              ) : (
                itemPreviews.map((item, idx) => (
                  <div key={item.invoiceItemId} className="rounded-lg border border-border/60 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {item.date ? formatDateBR(item.date) : `Sessao ${idx + 1}`}
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        {formatCurrencyBRL(item.valor)}
                      </span>
                    </div>
                    <textarea
                      value={item.descricao}
                      onChange={(e) => {
                        const updated = [...itemPreviews]
                        updated[idx] = { ...updated[idx], descricao: e.target.value }
                        setItemPreviews(updated)
                      }}
                      rows={3}
                      className={`${inputCls} text-xs resize-y`}
                    />
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Per-invoice: single description */
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={6} placeholder="Descricao do servico" className={`${inputCls} resize-y`} />
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {submitting
              ? "Emitindo..."
              : isPerItem
                ? `Emitir ${itemPreviews.length} NFS-e`
                : "Confirmar Emissao"
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
