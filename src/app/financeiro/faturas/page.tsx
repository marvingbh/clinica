"use client"

import React, { useState, useCallback, useRef, useMemo } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { toast } from "sonner"
import {
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  AlertTriangleIcon,
  ClockIcon,
  ReceiptIcon,
  CheckCircleIcon,
  FilterIcon,
  SendIcon,
  ChevronDownIcon,
  TrendingUpIcon,
  FileTextIcon,
} from "@/shared/components/ui/icons"
import { useFinanceiroContext } from "../context/FinanceiroContext"
import { InvoiceDetailModal } from "./InvoiceDetailModal"
import { NfseEmitWrapper } from "./NfseEmitWrapper"
import { NfsePreviewReport } from "./NfsePreviewReport"
import NfseEmailDialog from "./[id]/NfseEmailDialog"
import { InvoiceTableBody } from "./InvoiceTableBody"
import {
  type Invoice,
  buildInvoiceRows,
  filterRowsByStatus,
  countAllInvoices,
  sumTotalAmount,
  collectAllInvoices,
} from "./invoice-grouping-helpers"

interface Professional {
  id: string
  name: string
  professionalProfile: { id: string } | null
}

type StatusFilter = "" | "PENDENTE" | "ENVIADO" | "PARCIAL" | "PAGO" | "CANCELADO"
type DueFilter = "" | "overdue" | "due-soon"
type NfseFilter = "" | "SEM_NFSE" | "COM_NFSE"
type SortBy = "name" | "recurrence"

function daysDiff(dateStr: string): number {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function isOverdue(inv: Invoice): boolean {
  if (inv.status === "PAGO" || inv.status === "CANCELADO") return false
  return daysDiff(inv.dueDate) < 0
}

function isDueSoon(inv: Invoice): boolean {
  if (inv.status === "PAGO" || inv.status === "CANCELADO") return false
  const diff = daysDiff(inv.dueDate)
  return diff >= 0 && diff <= 3
}

export default function FaturasPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"
  const { year, month } = useFinanceiroContext()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("")
  const [dueFilter, setDueFilter] = useState<DueFilter>("")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState<{
    current: number
    total: number
    patient: string
  } | null>(null)
  const [markingEnviado, setMarkingEnviado] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("")
  const [patientSearch, setPatientSearch] = useState("")
  const [nfseFilter, setNfseFilter] = useState<NfseFilter>("")
  const [patientSearchInput, setPatientSearchInput] = useState("")
  const [sortBy, setSortBy] = useState<SortBy>("name")
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null)
  const [recalculatingGroupKey, setRecalculatingGroupKey] = useState<string | null>(null)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [downloadingXmlZip, setDownloadingXmlZip] = useState(false)
  const [downloadingNfsePdfZip, setDownloadingNfsePdfZip] = useState(false)
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)
  const [emitNfseInvoiceId, setEmitNfseInvoiceId] = useState<string | null>(null)
  const [emailNfseInvoice, setEmailNfseInvoice] = useState<{
    id: string
    patientEmail: string | null
    patientName: string
    nfseNumero: string
  } | null>(null)
  const [showNfsePreview, setShowNfsePreview] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
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
      .then((r) => r.json())
      .then((data) => {
        // API returns `{ error }` when the caller lacks permission; guard so
        // stats computations don't crash on non-array payloads.
        setInvoices(Array.isArray(data) ? data : [])
      })
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))
  }, [month, year, selectedProfessionalId, patientSearch, sortBy])


  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // Close dropdowns on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  // Derived stats over the raw invoice list (before grouping, before filters).
  const stats = useMemo(() => {
    const overdue = invoices.filter(isOverdue)
    const dueSoon = invoices.filter(isDueSoon)
    const paid = invoices.filter((i) => i.status === "PAGO")
    const open = invoices.filter(
      (i) =>
        !isOverdue(i) &&
        !isDueSoon(i) &&
        i.status !== "PAGO" &&
        i.status !== "CANCELADO"
    )
    const overdueAmt = overdue.reduce((s, i) => s + Number(i.totalAmount), 0)
    const dueSoonAmt = dueSoon.reduce((s, i) => s + Number(i.totalAmount), 0)
    const openAmt = open.reduce((s, i) => s + Number(i.totalAmount), 0)
    const paidAmt = paid.reduce((s, i) => s + Number(i.totalAmount), 0)
    const guardians = new Set(
      overdue.map((i) => i.patient.motherName || i.patient.fatherName || i.patient.name)
    ).size
    return {
      overdue,
      dueSoon,
      open,
      paid,
      overdueAmt,
      dueSoonAmt,
      openAmt,
      paidAmt,
      totalOpen: overdueAmt + dueSoonAmt + openAmt,
      guardians,
    }
  }, [invoices])

  // Build grouped rows, then apply filters client-side.
  const displayRows = useMemo(() => {
    const allRows = buildInvoiceRows(invoices)
    let filtered = filterRowsByStatus(allRows, statusFilter)
    if (nfseFilter) filtered = filterRowsByStatus(filtered, nfseFilter)
    if (dueFilter) {
      // Keep rows whose underlying invoices match the due filter
      filtered = filtered.filter((row) => {
        const invs =
          row.type === "individual" ? [row.invoice] : row.group.invoices
        if (dueFilter === "overdue") return invs.some(isOverdue)
        if (dueFilter === "due-soon") return invs.some(isDueSoon)
        return true
      })
    }
    return filtered
  }, [invoices, statusFilter, nfseFilter, dueFilter])

  function handlePatientSearchChange(value: string) {
    setPatientSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPatientSearch(value), 350)
  }

  function handleToggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }


  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/professionals")
      .then((r) => r.json())
      .then((data) => setProfessionals(data.professionals || []))
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
                setGenerateProgress({
                  current: event.current,
                  total: event.total,
                  patient: event.patient,
                })
              } else if (event.type === "done") {
                finalResult = event
              }
            } catch {
              /* skip malformed */
            }
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
    setMoreMenuOpen(false)
    const allInvoices = collectAllInvoices(displayRows)
    const pendentes = allInvoices.filter((i) => i.status === "PENDENTE")
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
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/recalcular`, {
        method: "POST",
      })
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

  async function handleRecalcularGrupo(group: {
    patientId: string
    professionalProfileId: string
    referenceMonth: number
    referenceYear: number
    key: string
  }) {
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
    setExportMenuOpen(false)
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
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        `faturas-${month}-${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Erro ao baixar relatórios")
    } finally {
      setDownloadingZip(false)
    }
  }

  async function handleDownloadXmlZip() {
    setExportMenuOpen(false)
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
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        `nfse-xml-${month}-${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Erro ao baixar XMLs")
    } finally {
      setDownloadingXmlZip(false)
    }
  }

  async function handleDownloadNfsePdfZip() {
    setExportMenuOpen(false)
    if (month === null) {
      toast.error("Selecione um mês")
      return
    }
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
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        `nfse-pdf-${month}-${year}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Erro ao baixar NFS-e PDFs")
    } finally {
      setDownloadingNfsePdfZip(false)
    }
  }

  const allInvoicesForFooter = useMemo(() => collectAllInvoices(displayRows), [displayRows])
  const hasPendentes = allInvoicesForFooter.some((i) => i.status === "PENDENTE")
  const statusCounts = useMemo(() => {
    const c = { PENDENTE: 0, ENVIADO: 0, PARCIAL: 0, PAGO: 0, CANCELADO: 0 }
    for (const inv of invoices) {
      if (inv.status in c) c[inv.status as keyof typeof c]++
    }
    return c
  }, [invoices])

  const displayedCount = countAllInvoices(displayRows)
  const displayedTotal = sumTotalAmount(displayRows)

  return (
    <div className="flex flex-col gap-[18px]">
      {/* ═══════════ Page title + top actions ═══════════ */}
      <div className="flex items-baseline justify-between gap-3.5 flex-wrap">
        <div className="flex items-baseline gap-3.5">
          <h2 className="m-0 text-[22px] font-semibold text-ink-900 tracking-[-0.015em]">
            Faturas
          </h2>
          <span className="text-ink-500 font-mono text-[12px]">/ financeiro / faturas</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Exportar dropdown — download actions grouped */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={month === null || invoices.length === 0}
              className="h-8 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[12px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 disabled:opacity-50 transition-colors"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Exportar
              <ChevronDownIcon className="w-3 h-3" />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-card border border-ink-200 rounded-[4px] shadow-lg overflow-hidden">
                <MenuItem
                  onClick={handleDownloadZip}
                  disabled={downloadingZip}
                  icon={<DownloadIcon className="w-3.5 h-3.5" />}
                  label={downloadingZip ? "Baixando..." : "Relatórios (ZIP)"}
                />
                <MenuItem
                  onClick={handleDownloadXmlZip}
                  disabled={downloadingXmlZip}
                  icon={<FileTextIcon className="w-3.5 h-3.5" />}
                  label={downloadingXmlZip ? "Baixando..." : "NFS-e XMLs (ZIP)"}
                />
                <MenuItem
                  onClick={handleDownloadNfsePdfZip}
                  disabled={downloadingNfsePdfZip}
                  icon={<FileTextIcon className="w-3.5 h-3.5" />}
                  label={downloadingNfsePdfZip ? "Baixando..." : "NFS-e PDFs (ZIP)"}
                />
                <div className="h-px bg-ink-100" />
                <MenuItem
                  onClick={() => {
                    setExportMenuOpen(false)
                    setShowNfsePreview(true)
                  }}
                  icon={<ReceiptIcon className="w-3.5 h-3.5" />}
                  label="Preview NFS-e"
                />
              </div>
            )}
          </div>

          {/* Mais ações dropdown — bulk & generation */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              className="h-8 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[12px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 transition-colors"
            >
              Mais ações
              <ChevronDownIcon className="w-3 h-3" />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-card border border-ink-200 rounded-[4px] shadow-lg overflow-hidden">
                <MenuItem
                  onClick={handleBulkMarkEnviado}
                  disabled={markingEnviado || !hasPendentes}
                  icon={<SendIcon className="w-3.5 h-3.5" />}
                  label={markingEnviado ? "Marcando..." : "Marcar pendentes como enviadas"}
                />
                <MenuItem
                  onClick={() => {
                    setMoreMenuOpen(false)
                    handleGenerate()
                  }}
                  disabled={generating || month === null}
                  icon={<PlusIcon className="w-3.5 h-3.5" />}
                  label={generating ? "Gerando..." : "Gerar faturas do mês"}
                />
              </div>
            )}
          </div>

          <Link
            href="/financeiro/faturas/nova"
            className="h-8 px-3 rounded-[4px] bg-brand-500 text-white text-[12px] font-medium inline-flex items-center gap-1.5 hover:bg-brand-600 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Nova fatura
          </Link>
        </div>
      </div>

      {/* ═══════════ Stats row ═══════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard
          tone="err"
          label="Vencidas"
          icon={<AlertTriangleIcon className="w-3 h-3" />}
          amount={stats.overdueAmt}
          sub={`${stats.overdue.length} faturas · ${stats.guardians} ${stats.guardians === 1 ? "responsável" : "responsáveis"}`}
        />
        <StatCard
          tone="warn"
          label="Vencem em 3 dias"
          icon={<ClockIcon className="w-3 h-3" />}
          amount={stats.dueSoonAmt}
          sub={`${stats.dueSoon.length} faturas a lembrar`}
        />
        <StatCard
          tone="default"
          label="Em aberto total"
          icon={<ReceiptIcon className="w-3 h-3" />}
          amount={stats.totalOpen}
          sub={`${stats.overdue.length + stats.dueSoon.length + stats.open.length} faturas pendentes`}
        />
        <StatCard
          tone="ok"
          label={`Recebido ${month ? monthLabel(month) : "(ano)"}`}
          icon={<CheckCircleIcon className="w-3 h-3" />}
          amount={stats.paidAmt}
          sub={`${stats.paid.length} pagamentos confirmados`}
          trend="up"
          trendValue=""
        />
      </div>

      {/* ═══════════ Overdue callout ═══════════ */}
      {stats.overdue.length > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 border border-err-100 rounded-[4px]"
          style={{
            background: "linear-gradient(to right, var(--err-50), transparent)",
            borderLeft: "3px solid var(--err-500)",
          }}
        >
          <AlertTriangleIcon className="w-[18px] h-[18px] text-err-500 flex-shrink-0" />
          <div className="flex-1 text-[12px] text-ink-700">
            <b className="font-semibold text-err-700">
              {stats.overdue.length} faturas vencidas
            </b>{" "}
            — {formatCurrencyBRL(stats.overdueAmt)} em inadimplência de {stats.guardians}{" "}
            {stats.guardians === 1 ? "responsável" : "responsáveis"}. Filtre apenas as vencidas
            ou marque como enviadas para enviar cobranças.
          </div>
          <button
            type="button"
            onClick={() => setDueFilter(dueFilter === "overdue" ? "" : "overdue")}
            className="h-7 px-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 transition-colors"
          >
            <FilterIcon className="w-3 h-3" />
            {dueFilter === "overdue" ? "Remover filtro" : "Ver só vencidas"}
          </button>
        </div>
      )}

      {/* ═══════════ Filter bar — two rows grouped by purpose ═══════════ */}
      <div className="bg-card border border-ink-200 rounded-[4px] divide-y divide-ink-100">
        {/* Row 1: search + admin scope + clear */}
        <div className="flex items-center gap-2 flex-wrap px-3.5 py-2.5">
          <div className="relative flex items-center flex-1 min-w-[240px]">
            <SearchIcon className="absolute left-2.5 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar paciente ou responsável…"
              value={patientSearchInput}
              onChange={(e) => handlePatientSearchChange(e.target.value)}
              className="h-8 w-full pl-[30px] pr-2.5 rounded-[4px] border border-ink-300 bg-card text-[12px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-colors"
            />
          </div>

          {isAdmin && professionals.length > 0 && (
            <select
              value={selectedProfessionalId}
              onChange={(e) => setSelectedProfessionalId(e.target.value)}
              className="h-8 px-2.5 rounded-[4px] border border-ink-300 bg-card text-[12px] text-ink-800 max-w-[200px]"
            >
              <option value="">Todos os profissionais</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.professionalProfile?.id || ""}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {(dueFilter || statusFilter || nfseFilter) && (
            <button
              type="button"
              onClick={() => {
                setDueFilter("")
                setStatusFilter("")
                setNfseFilter("")
              }}
              className="h-8 px-2.5 rounded-[4px] text-ink-500 text-[11px] font-medium hover:bg-ink-100 transition-colors inline-flex items-center gap-1"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Row 2: chip groups with inline labels */}
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-3.5 py-2.5">
          {/* Status group */}
          <FilterGroup label="Status">
            <FilterChip
              tone="err"
              active={dueFilter === "overdue"}
              onClick={() => setDueFilter(dueFilter === "overdue" ? "" : "overdue")}
              label="Vencidas"
              count={stats.overdue.length}
              dotColor="var(--err-500)"
            />
            <FilterChip
              tone="warn"
              active={dueFilter === "due-soon"}
              onClick={() => setDueFilter(dueFilter === "due-soon" ? "" : "due-soon")}
              label="Vence em 3d"
              count={stats.dueSoon.length}
              dotColor="var(--warn-500)"
            />
            <FilterChip
              active={statusFilter === "PENDENTE"}
              onClick={() =>
                setStatusFilter(statusFilter === "PENDENTE" ? "" : "PENDENTE")
              }
              label="Pendentes"
              count={statusCounts.PENDENTE}
            />
            <FilterChip
              active={statusFilter === "ENVIADO"}
              onClick={() =>
                setStatusFilter(statusFilter === "ENVIADO" ? "" : "ENVIADO")
              }
              label="Enviadas"
              count={statusCounts.ENVIADO}
            />
            <FilterChip
              active={statusFilter === "PARCIAL"}
              onClick={() =>
                setStatusFilter(statusFilter === "PARCIAL" ? "" : "PARCIAL")
              }
              label="Parciais"
              count={statusCounts.PARCIAL}
            />
            <FilterChip
              tone="ok"
              active={statusFilter === "PAGO"}
              onClick={() => setStatusFilter(statusFilter === "PAGO" ? "" : "PAGO")}
              label="Pagas"
              count={statusCounts.PAGO}
            />
            <FilterChip
              active={statusFilter === "CANCELADO"}
              onClick={() =>
                setStatusFilter(statusFilter === "CANCELADO" ? "" : "CANCELADO")
              }
              label="Canceladas"
              count={statusCounts.CANCELADO}
            />
          </FilterGroup>

          {/* NFS-e group */}
          <FilterGroup label="NFS-e">
            <FilterChip
              active={nfseFilter === "SEM_NFSE"}
              onClick={() => setNfseFilter(nfseFilter === "SEM_NFSE" ? "" : "SEM_NFSE")}
              label="Sem"
            />
            <FilterChip
              active={nfseFilter === "COM_NFSE"}
              onClick={() => setNfseFilter(nfseFilter === "COM_NFSE" ? "" : "COM_NFSE")}
              label="Com"
            />
          </FilterGroup>

          {/* Sort group */}
          <FilterGroup label="Ordem">
            {(
              [
                { value: "name" as const, label: "Nome" },
                { value: "recurrence" as const, label: "Dia da semana" },
              ]
            ).map((opt) => (
              <FilterChip
                key={opt.value}
                active={sortBy === opt.value}
                onClick={() => setSortBy(opt.value)}
                label={opt.label}
              />
            ))}
          </FilterGroup>
        </div>
      </div>

      {/* ═══════════ Table card ═══════════ */}
      <div className="bg-card border border-ink-200 rounded-[4px] overflow-hidden">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-ink-200 bg-ink-50">
          <h3 className="m-0 text-[13px] font-semibold text-ink-900 flex items-center gap-2">
            Faturas
            <span className="bg-ink-100 text-ink-700 font-mono text-[10px] px-1.5 py-0.5 rounded-full">
              {displayedCount}
            </span>
          </h3>
          <span className="text-[11px] text-ink-500">
            {formatCurrencyBRL(displayedTotal)} total
            {month !== null ? ` · ${monthLabel(month)}/${year}` : ` · ${year}`}
          </span>
          <div className="flex-1" />
          {generating && generateProgress && (
            <span className="text-[11px] text-ink-500">
              Gerando… {generateProgress.current}/{generateProgress.total}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-[13px] text-ink-500 animate-pulse">
            Carregando faturas…
          </div>
        ) : displayRows.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-ink-500">
            Nenhuma fatura encontrada para este período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50">
                  <Th>Paciente</Th>
                  <Th className="text-center">Sessões</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-center">Status</Th>
                  <Th className="text-center">NF</Th>
                  <Th className="text-center">Vencimento</Th>
                  <Th className="text-center">Pagamento</Th>
                  <Th className="text-right">Ações</Th>
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
                  onSendNfseEmail={(inv) =>
                    setEmailNfseInvoice({
                      id: inv.id,
                      patientEmail: inv.patient.email,
                      patientName: inv.patient.name,
                      nfseNumero: inv.nfseNumero || "",
                    })
                  }
                />
              </tbody>
            </table>
          </div>
        )}

        {/* Footer summary row (pagination-style) */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-ink-200 bg-ink-50 text-[11px] text-ink-600 flex-wrap gap-3">
          <span>
            {displayedCount} fatura(s) · {formatCurrencyBRL(displayedTotal)}
          </span>
          <div className="flex items-center gap-3">
            <StatusPill tone="ok" label="Pagas" count={allInvoicesForFooter.filter((i) => i.status === "PAGO").length} />
            <StatusPill tone="warn" label="Parciais" count={allInvoicesForFooter.filter((i) => i.status === "PARCIAL").length} />
            <StatusPill tone="info" label="Enviadas" count={allInvoicesForFooter.filter((i) => i.status === "ENVIADO").length} />
            <StatusPill tone="default" label="Pendentes" count={allInvoicesForFooter.filter((i) => i.status === "PENDENTE").length} />
          </div>
        </div>
      </div>

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

      {showNfsePreview && month !== null && (
        <NfsePreviewReport
          month={month}
          year={year}
          invoiceIds={collectAllInvoices(displayRows).map((i) => i.id)}
          onClose={() => setShowNfsePreview(false)}
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
          <div className="bg-card border border-ink-200 rounded-[8px] shadow-lg px-8 py-6 max-w-sm w-full mx-4 text-center">
            <div className="w-8 h-8 border-[3px] border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[15px] font-semibold text-ink-900 mb-1">Gerando faturas...</p>
            {generateProgress ? (
              <>
                <p className="text-[13px] text-ink-500 mb-3 truncate">{generateProgress.patient}</p>
                <div className="w-full h-2 bg-ink-100 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((generateProgress.current / generateProgress.total) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-ink-500 font-mono tabular-nums">
                  {generateProgress.current} de {generateProgress.total} pacientes
                </p>
              </>
            ) : (
              <p className="text-[13px] text-ink-500">Preparando...</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════ Presentational helpers ═══════════ */

function StatCard({
  tone,
  label,
  icon,
  amount,
  sub,
  trend,
  trendValue,
}: {
  tone: "default" | "err" | "warn" | "ok"
  label: string
  icon: React.ReactNode
  amount: number
  sub: string
  trend?: "up" | "down"
  trendValue?: string
}) {
  const stripe =
    tone === "err"
      ? "bg-err-500"
      : tone === "warn"
        ? "bg-warn-500"
        : tone === "ok"
          ? "bg-ok-500"
          : "bg-brand-500"
  const valColor =
    tone === "err"
      ? "text-err-700"
      : tone === "warn"
        ? "text-warn-700"
        : tone === "ok"
          ? "text-ok-700"
          : "text-ink-900"

  return (
    <div className="relative bg-card border border-ink-200 rounded-[4px] px-3.5 py-3 overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${stripe}`} />
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-2">
        <span className="text-ink-400">{icon}</span>
        {label}
      </div>
      <div
        className={`text-[22px] font-semibold font-mono leading-none tracking-[-0.02em] ${valColor}`}
      >
        <span className="text-[12px] text-ink-500 font-medium mr-1">R$</span>
        {Math.round(amount).toLocaleString("pt-BR")}
      </div>
      <div className="flex items-center gap-1 mt-1.5 text-[11px] text-ink-500">
        {trend && trendValue && (
          <span
            className={`inline-flex items-center gap-0.5 font-mono font-medium ${
              trend === "up" ? "text-ok-700" : "text-err-700"
            }`}
          >
            <TrendingUpIcon className="w-[10px] h-[10px]" />
            {trendValue}
          </span>
        )}
        {sub}
      </div>
    </div>
  )
}

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 mr-0.5">
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
  dotColor,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  tone?: "ok" | "warn" | "err"
  dotColor?: string
}) {
  const activeBg =
    tone === "ok"
      ? "bg-ok-700 border-ok-700"
      : tone === "warn"
        ? "bg-warn-700 border-warn-700"
        : tone === "err"
          ? "bg-err-700 border-err-700"
          : "bg-ink-900 border-ink-900"

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-full border text-[11px] font-medium transition-colors ${
        active
          ? `${activeBg} text-white`
          : "bg-card border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-400"
      }`}
    >
      {dotColor && !active && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: dotColor }}
        />
      )}
      {dotColor && active && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`font-mono text-[10px] px-1.5 py-0 rounded-full ${
            active ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  // Apply `text-left` only when the caller hasn't specified an alignment
  // override (`text-center` / `text-right`). Base `text-left` in a shared
  // className would otherwise win against the prop override due to
  // Tailwind's source-order specificity.
  const align = /\btext-(center|right|left)\b/.test(className) ? "" : "text-left"
  return (
    <th
      className={`${align} text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 py-3 px-4 whitespace-nowrap ${className}`.trim()}
    >
      {children}
    </th>
  )
}

function StatusPill({
  tone,
  label,
  count,
}: {
  tone: "ok" | "warn" | "info" | "default"
  label: string
  count: number
}) {
  const color =
    tone === "ok"
      ? "text-ok-700"
      : tone === "warn"
        ? "text-warn-700"
        : tone === "info"
          ? "text-brand-700"
          : "text-ink-600"
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${color}`}>
      <span className="font-mono tabular-nums font-medium">{count}</span>
      <span>{label.toLowerCase()}</span>
    </span>
  )
}

function MenuItem({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full px-3 py-2 text-left text-[13px] text-ink-800 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
    >
      <span className="text-ink-500">{icon}</span>
      {label}
    </button>
  )
}

function monthLabel(month: number): string {
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return months[month - 1] || String(month)
}
