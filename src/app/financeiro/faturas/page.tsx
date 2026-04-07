"use client"

import React, { useState, useCallback, useRef, useMemo } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { toast } from "sonner"
import { DownloadIcon, PlusIcon } from "@/shared/components/ui/icons"
import { useFinanceiroContext } from "../context/FinanceiroContext"
import { InvoiceDetailModal } from "./InvoiceDetailModal"
import { NfseEmitWrapper } from "./NfseEmitWrapper"
import NfseEmailDialog from "./[id]/NfseEmailDialog"
import { InvoiceTableBody, STATUS_LABELS, STATUS_COLORS } from "./InvoiceTableBody"
import {
  type Invoice,
  buildInvoiceRows,
  filterRowsByStatus,
  countAllInvoices,
  sumTotalSessions,
  sumTotalAmount,
  collectAllInvoices,
} from "./invoice-grouping-helpers"

interface Professional {
  id: string
  name: string
  professionalProfile: { id: string } | null
}

export default function FaturasPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"
  const { year, month } = useFinanceiroContext()

  const [statusFilter, setStatusFilter] = useState("")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState<{ current: number; total: number; patient: string } | null>(null)
  const [markingEnviado, setMarkingEnviado] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("")
  const [patientSearch, setPatientSearch] = useState("")
  const [patientSearchInput, setPatientSearchInput] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "recurrence">("name")
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null)
  const [recalculatingGroupKey, setRecalculatingGroupKey] = useState<string | null>(null)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [downloadingXmlZip, setDownloadingXmlZip] = useState(false)
  const [downloadingNfsePdfZip, setDownloadingNfsePdfZip] = useState(false)
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)
  const [emitNfseInvoiceId, setEmitNfseInvoiceId] = useState<string | null>(null)
  const [emailNfseInvoice, setEmailNfseInvoice] = useState<{ id: string; patientEmail: string | null; patientName: string; nfseNumero: string } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchInvoices = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (month !== null) params.set("month", String(month))
    params.set("year", String(year))
    if (selectedProfessionalId) params.set("professionalId", selectedProfessionalId)
    if (patientSearch.trim()) params.set("patientSearch", patientSearch.trim())
    if (sortBy !== "name") params.set("sortBy", sortBy)
    fetch(`/api/financeiro/faturas?${params}`)
      .then(r => r.json())
      .then(setInvoices)
      .finally(() => setLoading(false))
  }, [month, year, selectedProfessionalId, patientSearch, sortBy])

   
  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  // Build grouped rows from invoices, then apply status filter client-side
  const displayRows = useMemo(() => {
    const allRows = buildInvoiceRows(invoices)
    return filterRowsByStatus(allRows, statusFilter)
  }, [invoices, statusFilter])

  function handlePatientSearchChange(value: string) {
    setPatientSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPatientSearch(value)
    }, 350)
  }

  function handleToggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

   
  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/professionals")
      .then(r => r.json())
      .then(data => setProfessionals(data.professionals || []))
      .catch(() => {})
  }, [isAdmin])

  async function handleGenerate() {
    setGenerating(true)
    setGenerateProgress(null)
    try {
      const generateMonth = month ?? new Date().getMonth() + 1
      const res = await fetch("/api/financeiro/faturas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: generateMonth,
          year,
          ...(selectedProfessionalId ? { professionalProfileId: selectedProfessionalId } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Erro ao gerar faturas")
        return
      }

      // Read NDJSON stream for progress
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let finalResult: { generated?: number; updated?: number; skipped?: number } | null = null

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const event = JSON.parse(line)
              if (event.type === "progress") {
                setGenerateProgress({ current: event.current, total: event.total, patient: event.patient })
              } else if (event.type === "done") {
                finalResult = event
              }
            } catch { /* skip malformed lines */ }
          }
        }
      }

      if (finalResult) {
        const parts = []
        if (finalResult.generated) parts.push(`${finalResult.generated} gerada(s)`)
        if (finalResult.updated) parts.push(`${finalResult.updated} atualizada(s)`)
        if (finalResult.skipped) parts.push(`${finalResult.skipped} mantida(s)`)
        toast.success(parts.join(", ") || "Nenhuma fatura gerada")
      }
      fetchInvoices()
    } finally {
      setGenerating(false)
      setGenerateProgress(null)
    }
  }

  async function handleBulkMarkEnviado() {
    const allInvoices = collectAllInvoices(displayRows)
    const pendentes = allInvoices.filter(i => i.status === "PENDENTE")
    if (pendentes.length === 0) {
      toast.error("Nenhuma fatura pendente para marcar")
      return
    }
    setMarkingEnviado(true)
    try {
      let count = 0
      for (const inv of pendentes) {
        const res = await fetch(`/api/financeiro/faturas/${inv.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ENVIADO" }),
        })
        if (res.ok) count++
      }
      toast.success(`${count} fatura(s) marcada(s) como enviada(s)`)
      fetchInvoices()
    } finally {
      setMarkingEnviado(false)
    }
  }

  async function handleMarkPaid(id: string) {
    const res = await fetch(`/api/financeiro/faturas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAGO" }),
    })
    if (res.ok) {
      toast.success("Fatura marcada como paga")
      fetchInvoices()
    } else {
      toast.error("Erro ao atualizar fatura")
    }
  }

  async function handleRecalcular(invoiceId: string) {
    setRecalculatingId(invoiceId)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/recalcular`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao recalcular fatura")
        return
      }
      toast.success(data.message || "Fatura recalculada")
      fetchInvoices()
    } catch {
      toast.error("Erro ao recalcular fatura")
    } finally {
      setRecalculatingId(null)
    }
  }

  async function handleRecalcularGrupo(group: { patientId: string; professionalProfileId: string; referenceMonth: number; referenceYear: number; key: string }) {
    setRecalculatingGroupKey(group.key)
    try {
      const res = await fetch("/api/financeiro/faturas/recalcular-grupo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: group.patientId,
          professionalProfileId: group.professionalProfileId,
          month: group.referenceMonth,
          year: group.referenceYear,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao recalcular grupo")
        return
      }
      toast.success(data.message || "Grupo recalculado")
      fetchInvoices()
    } catch {
      toast.error("Erro ao recalcular grupo")
    } finally {
      setRecalculatingGroupKey(null)
    }
  }

  async function handleDownloadZip() {
    if (month === null) {
      toast.error("Selecione um mês para baixar os relatórios")
      return
    }
    setDownloadingZip(true)
    try {
      const dlParams = new URLSearchParams({ month: String(month), year: String(year) })
      if (selectedProfessionalId) dlParams.set("professionalId", selectedProfessionalId)
      const res = await fetch(`/api/financeiro/faturas/download-zip?${dlParams}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Erro ao gerar arquivo")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `faturas-${month}-${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Erro ao baixar relatórios")
    } finally {
      setDownloadingZip(false)
    }
  }

  async function handleDownloadXmlZip() {
    if (month === null) {
      toast.error("Selecione um mês para baixar os XMLs")
      return
    }
    setDownloadingXmlZip(true)
    try {
      const dlParams = new URLSearchParams({ month: String(month), year: String(year) })
      const res = await fetch(`/api/financeiro/faturas/download-nfse-xml?${dlParams}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Erro ao gerar arquivo")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `nfse-xml-${month}-${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Erro ao baixar XMLs")
    } finally {
      setDownloadingXmlZip(false)
    }
  }

  async function handleDownloadNfsePdfZip() {
    if (month === null) { toast.error("Selecione um mês"); return }
    setDownloadingNfsePdfZip(true)
    try {
      const dlParams = new URLSearchParams({ month: String(month), year: String(year) })
      const res = await fetch(`/api/financeiro/faturas/download-nfse-pdf?${dlParams}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Erro ao gerar arquivo")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `nfse-pdf-${month}-${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Erro ao baixar NFS-e PDFs")
    } finally {
      setDownloadingNfsePdfZip(false)
    }
  }

  const allInvoicesForFooter = useMemo(() => collectAllInvoices(displayRows), [displayRows])
  const hasPendentes = allInvoicesForFooter.some(i => i.status === "PENDENTE")

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar paciente..."
          value={patientSearchInput}
          onChange={e => handlePatientSearchChange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm w-48 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex gap-1">
          {[
            { label: "Todos", value: "" },
            { label: "Pendente", value: "PENDENTE" },
            { label: "Enviado", value: "ENVIADO" },
            { label: "Parcial", value: "PARCIAL" },
            { label: "Pago", value: "PAGO" },
            { label: "Cancelado", value: "CANCELADO" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {([
            { label: "Nome", value: "name" as const },
            { label: "Dia da semana", value: "recurrence" as const },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                sortBy === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {isAdmin && professionals.length > 0 && (
          <select
            value={selectedProfessionalId}
            onChange={e => setSelectedProfessionalId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map(p => (
              <option key={p.id} value={p.professionalProfile?.id || ""}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex gap-2">
          <Link
            href="/financeiro/faturas/nova"
            className="px-4 py-2 border border-input bg-background text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors flex items-center gap-1.5"
          >
            <PlusIcon className="h-4 w-4" />
            Nova Fatura
          </Link>
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip || month === null || invoices.length === 0}
            className="px-4 py-2 border border-input bg-background text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <DownloadIcon className="h-4 w-4" />
            {downloadingZip ? "Baixando..." : "Baixar Relatórios"}
          </button>
          <button
            onClick={handleDownloadXmlZip}
            disabled={downloadingXmlZip || month === null || invoices.length === 0}
            className="px-4 py-2 border border-input bg-background text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <DownloadIcon className="h-4 w-4" />
            {downloadingXmlZip ? "Baixando..." : "Baixar XMLs"}
          </button>
          <button
            onClick={handleDownloadNfsePdfZip}
            disabled={downloadingNfsePdfZip || month === null || invoices.length === 0}
            className="px-4 py-2 border border-input bg-background text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <DownloadIcon className="h-4 w-4" />
            {downloadingNfsePdfZip ? "Baixando..." : "Baixar NFS-e PDFs"}
          </button>
          <button
            onClick={handleBulkMarkEnviado}
            disabled={markingEnviado || !hasPendentes}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {markingEnviado ? "Marcando..." : "Marcar como Enviado"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || month === null}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {generating ? "Gerando..." : "Gerar Faturas do Mês"}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      ) : displayRows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma fatura encontrada para este período
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-medium">Paciente</th>
                <th className="text-center py-3 px-4 font-medium">Sessões</th>
                <th className="text-right py-3 px-4 font-medium">Total</th>
                <th className="text-center py-3 px-4 font-medium">Status</th>
                <th className="text-center py-3 px-4 font-medium">NF</th>
                <th className="text-center py-3 px-4 font-medium">Vencimento</th>
                <th className="text-center py-3 px-4 font-medium">Pagamento</th>
                <th className="text-right py-3 px-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              <InvoiceTableBody
                rows={displayRows}
                expandedGroups={expandedGroups}
                onToggleGroup={handleToggleGroup}
                recalculatingId={recalculatingId}
                recalculatingGroupKey={recalculatingGroupKey}
                onMarkPaid={handleMarkPaid}
                onRecalcular={handleRecalcular}
                onRecalcularGrupo={handleRecalcularGrupo}
                onViewDetail={setDetailInvoiceId}
                onEmitNfse={setEmitNfseInvoiceId}
                onSendNfseEmail={(inv) => setEmailNfseInvoice({
                  id: inv.id,
                  patientEmail: inv.patient.email,
                  patientName: inv.patient.name,
                  nfseNumero: inv.nfseNumero || "",
                })}
              />
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-medium">
                <td className="py-3 px-4">{countAllInvoices(displayRows)} fatura(s)</td>
                <td className="text-center py-3 px-4">{sumTotalSessions(displayRows)}</td>
                <td className="text-right py-3 px-4">{formatCurrencyBRL(sumTotalAmount(displayRows))}</td>
                <td className="text-center py-3 px-4">
                  <span className="text-xs text-green-600 dark:text-green-400">{allInvoicesForFooter.filter(i => i.status === "PAGO").length} pagos</span>
                  {" / "}
                  <span className="text-xs text-orange-600 dark:text-orange-400">{allInvoicesForFooter.filter(i => i.status === "PARCIAL").length} parciais</span>
                  {" / "}
                  <span className="text-xs text-blue-600 dark:text-blue-400">{allInvoicesForFooter.filter(i => i.status === "ENVIADO").length} enviados</span>
                  {" / "}
                  <span className="text-xs text-yellow-600 dark:text-yellow-400">{allInvoicesForFooter.filter(i => i.status === "PENDENTE").length} pendentes</span>
                </td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          onUpdate={fetchInvoices}
        />
      )}

      {emitNfseInvoiceId && (
        <NfseEmitWrapper
          invoiceId={emitNfseInvoiceId}
          onClose={() => setEmitNfseInvoiceId(null)}
          onSuccess={fetchInvoices}
        />
      )}

      {emailNfseInvoice && (
        <NfseEmailDialog
          invoiceId={emailNfseInvoice.id}
          patientEmail={emailNfseInvoice.patientEmail}
          patientName={emailNfseInvoice.patientName}
          nfseNumero={emailNfseInvoice.nfseNumero}
          onClose={() => setEmailNfseInvoice(null)}
          onSuccess={fetchInvoices}
        />
      )}

      {/* Invoice generation progress overlay */}
      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="bg-background border border-border rounded-2xl shadow-lg px-8 py-6 max-w-sm w-full mx-4 text-center">
            <div className="w-8 h-8 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-base font-semibold text-foreground mb-1">Gerando faturas...</p>
            {generateProgress ? (
              <>
                <p className="text-sm text-muted-foreground mb-3 truncate">
                  {generateProgress.patient}
                </p>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((generateProgress.current / generateProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {generateProgress.current} de {generateProgress.total} pacientes
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Preparando...</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
