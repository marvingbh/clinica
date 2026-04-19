"use client"

import { useCallback, useMemo, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import {
  ClockIcon,
  CheckCircle2Icon,
  InfoIcon,
  AlertTriangleIcon,
  DownloadCloudIcon,
  RefreshCwIcon,
  DownloadIcon,
  CheckIcon,
  UnlinkIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"
import { formatCurrencyBRL, formatDateBR, getMonthName } from "@/lib/financeiro/format"
import { InboxList, getTxBucket, type ConfidenceTab } from "./InboxList"
import { WorkspacePane } from "./WorkspacePane"
import { CreateInvoiceSheet } from "./CreateInvoiceSheet"
import type { CreatedInvoiceInfo, DismissedTransaction, Transaction } from "./types"

interface ConciliacaoV1Props {
  transactions: Transaction[]
  onReconciled: () => void
  onFetchExtract: () => Promise<void>
  lastFetch: { fetched: number; newTransactions: number } | null
  fetching: boolean
  startDate: string
  endDate: string
  onStartDateChange: (v: string) => void
  onEndDateChange: (v: string) => void
  showReconciled: boolean
  onToggleReconciled: () => void
}

/** V1 Inbox-split layout for the Conciliação page. */
export function ConciliacaoV1({
  transactions,
  onReconciled,
  onFetchExtract,
  lastFetch,
  fetching,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  showReconciled,
  onToggleReconciled,
}: ConciliacaoV1Props) {
  const unreconciled = useMemo(
    () => transactions.filter((tx) => !tx.isFullyReconciled),
    [transactions]
  )
  const reconciledTx = useMemo(
    () => transactions.filter((tx) => tx.isFullyReconciled),
    [transactions]
  )

  const stats = useMemo(() => {
    const pendingAmount = unreconciled.reduce((s, tx) => s + tx.remainingAmount, 0)
    const strong = unreconciled.filter((tx) => getTxBucket(tx) === "strong").length
    const suggested = unreconciled.filter((tx) => getTxBucket(tx) === "suggested").length
    const none = unreconciled.filter((tx) => getTxBucket(tx) === "none").length
    return { pendingCount: unreconciled.length, pendingAmount, strong, suggested, none }
  }, [unreconciled])

  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<ConfidenceTab>("all")
  const [selectedId, setSelectedId] = useState<string | null>(unreconciled[0]?.id ?? null)
  const [reconciling, setReconciling] = useState(false)
  const [createSheetTxId, setCreateSheetTxId] = useState<string | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const [dismissedTransactions, setDismissedTransactions] = useState<DismissedTransaction[]>([])

  // Keep selection stable when the list refreshes — pick the first unreconciled
  // when the previous pick is no longer pending.
  useEffect(() => {
    if (!selectedId) {
      if (unreconciled.length > 0) setSelectedId(unreconciled[0].id)
      return
    }
    const stillPending = unreconciled.some((tx) => tx.id === selectedId)
    if (!stillPending) setSelectedId(unreconciled[0]?.id ?? null)
  }, [unreconciled, selectedId])

  const selectedTx = unreconciled.find((tx) => tx.id === selectedId) || null

  const fetchDismissed = useCallback(async () => {
    if (!showDismissed) return
    try {
      const res = await fetch("/api/financeiro/conciliacao/transactions?showDismissed=true")
      const data = await res.json()
      setDismissedTransactions(data.dismissedTransactions || [])
    } catch {
      toast.error("Erro ao carregar transações descartadas")
    }
  }, [showDismissed])


  useEffect(() => {
    if (showDismissed) fetchDismissed()
    else setDismissedTransactions([])
  }, [showDismissed, fetchDismissed])

  async function reconcile(links: Array<{ transactionId: string; invoiceId: string; amount: number }>) {
    const res = await fetch("/api/financeiro/conciliacao/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Erro ao conciliar")
    }
    return res.json()
  }

  const handleReconcileOne = async (invoiceId: string, amount: number) => {
    if (!selectedTx) return
    setReconciling(true)
    try {
      const data = await reconcile([{ transactionId: selectedTx.id, invoiceId, amount }])
      toast.success(data.message || "Conciliado")
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar")
    } finally {
      setReconciling(false)
    }
  }

  const handleReconcileGroup = async (invoiceIds: string[], totalAmount: number) => {
    if (!selectedTx) return
    setReconciling(true)
    try {
      const remaining = selectedTx.remainingAmount
      const chunk = remaining > 0 ? Math.min(totalAmount, remaining) / invoiceIds.length : 0
      const links = invoiceIds.map((invoiceId) => ({
        transactionId: selectedTx.id,
        invoiceId,
        amount: chunk,
      }))
      const data = await reconcile(links)
      toast.success(data.message || "Grupo conciliado")
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar grupo")
    } finally {
      setReconciling(false)
    }
  }

  const handleDismiss = async (transactionId: string, reason: "DUPLICATE" | "NOT_PATIENT") => {
    try {
      const res = await fetch("/api/financeiro/conciliacao/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, reason }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Erro ao descartar transação")
        return
      }
      toast.success(reason === "DUPLICATE" ? "Marcada como duplicada" : "Marcada sem relação")
      onReconciled()
      fetchDismissed()
    } catch {
      toast.error("Erro ao descartar transação")
    }
  }

  const handleUndismiss = async (transactionId: string) => {
    try {
      const res = await fetch("/api/financeiro/conciliacao/dismiss", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Erro ao restaurar transação")
        return
      }
      toast.success("Transação restaurada")
      onReconciled()
      fetchDismissed()
    } catch {
      toast.error("Erro ao restaurar transação")
    }
  }

  // Undo the entire reconciliation for a transaction — used by the Reconciled
  // table. Multi-invoice payments (group reconciliations) must always undo as
  // one unit; individual undo is not offered here.
  const handleUndoTransaction = async (txId: string) => {
    try {
      const res = await fetch("/api/financeiro/conciliacao/reconcile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao desfazer")
      }
      toast.success("Conciliação desfeita")
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desfazer")
    }
  }

  const handleInvoiceCreated = async (invoice: CreatedInvoiceInfo) => {
    if (!createSheetTxId) return
    const tx = transactions.find((t) => t.id === createSheetTxId)
    const amount = tx?.remainingAmount ?? invoice.totalAmount
    setCreateSheetTxId(null)
    try {
      const data = await reconcile([
        { transactionId: createSheetTxId, invoiceId: invoice.id, amount },
      ])
      toast.success(data.message || "Fatura criada e conciliada")
      onReconciled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conciliar fatura criada")
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <StatCard
          tone="warn"
          label="Pendentes"
          icon={<ClockIcon className="w-3 h-3" />}
          value={stats.pendingCount}
          sub={`${formatCurrencyBRL(stats.pendingAmount)} aguardando`}
        />
        <StatCard
          tone="ok"
          label="Match forte"
          icon={<CheckCircle2Icon className="w-3 h-3" />}
          value={stats.strong}
          sub="Prontos p/ conciliar"
        />
        <StatCard
          tone="default"
          label="Sugeridos"
          icon={<InfoIcon className="w-3 h-3" />}
          value={stats.suggested}
          sub="Revisar antes"
        />
        <StatCard
          tone="err"
          label="Sem relação"
          icon={<AlertTriangleIcon className="w-3 h-3" />}
          value={stats.none}
          sub="Sem candidatos"
        />
      </div>

      {/* Import banner */}
      <div
        className="flex items-center gap-2.5 p-3 border border-brand-100 rounded-[4px] flex-wrap"
        style={{ background: "linear-gradient(to right, var(--brand-50), transparent)" }}
      >
        <RefreshCwIcon className="w-4 h-4 text-brand-600 flex-shrink-0" />
        <div className="text-[12px] text-ink-700 min-w-0 flex-1">
          {lastFetch ? (
            <>
              <b className="font-semibold text-ink-900">Última importação:</b>{" "}
              {lastFetch.fetched} recebimento(s),{" "}
              <span className="font-semibold text-ink-900">
                {lastFetch.newTransactions} novo(s)
              </span>
              .
            </>
          ) : (
            <>
              <b className="font-semibold text-ink-900">Conexão bancária ativa.</b>{" "}
              Escolha o período e sincronize o extrato.
            </>
          )}
        </div>
        <div className="inline-flex items-center h-7 rounded-[4px] border border-ink-300 bg-card overflow-hidden">
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            aria-label="Data inicial"
            className="h-full px-2.5 text-[11px] font-mono tabular-nums text-ink-800 bg-transparent border-0 focus:outline-none"
          />
          <span className="text-ink-300 font-mono">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            aria-label="Data final"
            className="h-full px-2.5 text-[11px] font-mono tabular-nums text-ink-800 bg-transparent border-0 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            void onFetchExtract()
          }}
          disabled={fetching}
          className="h-7 px-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 disabled:opacity-50 transition-colors"
        >
          {fetching ? (
            <Loader2Icon className="w-3 h-3 animate-spin" />
          ) : (
            <DownloadCloudIcon className="w-3 h-3" />
          )}
          {fetching ? "Importando..." : "Sincronizar"}
        </button>
      </div>

      {/* Split */}
      <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] bg-card border border-ink-200 rounded-[4px] overflow-hidden min-h-[640px]">
        <InboxList
          transactions={unreconciled}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={search}
          onSearchChange={setSearch}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <WorkspacePane
          key={selectedTx?.id ?? "none"}
          tx={selectedTx}
          isConfirming={reconciling}
          onReconcileOne={handleReconcileOne}
          onReconcileGroup={handleReconcileGroup}
          onDismiss={handleDismiss}
          onCreateInvoice={() => selectedTx && setCreateSheetTxId(selectedTx.id)}
        />
      </div>

      {/* Reconciled table */}
      <ReconciledTable
        transactions={reconciledTx}
        showReconciled={showReconciled}
        onToggleReconciled={onToggleReconciled}
        onUndoTransaction={handleUndoTransaction}
        showDismissed={showDismissed}
        onToggleDismissed={() => setShowDismissed((v) => !v)}
        dismissed={dismissedTransactions}
        onUndismiss={handleUndismiss}
      />

      <CreateInvoiceSheet
        isOpen={createSheetTxId !== null}
        onClose={() => setCreateSheetTxId(null)}
        onCreated={handleInvoiceCreated}
        defaultAmount={
          createSheetTxId ? transactions.find((t) => t.id === createSheetTxId)?.amount : undefined
        }
        defaultDate={
          createSheetTxId ? transactions.find((t) => t.id === createSheetTxId)?.date : undefined
        }
      />
    </div>
  )
}

function StatCard({
  tone,
  label,
  icon,
  value,
  sub,
}: {
  tone: "default" | "ok" | "warn" | "err"
  label: string
  icon: React.ReactNode
  value: number
  sub: string
}) {
  const valColor =
    tone === "ok"
      ? "text-ok-700"
      : tone === "warn"
        ? "text-warn-700"
        : tone === "err"
          ? "text-err-700"
          : "text-ink-900"
  return (
    <div className="bg-card border border-ink-200 rounded-[4px] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-1.5">
        <span className="text-ink-400">{icon}</span>
        {label}
      </div>
      <div className={`text-[22px] font-semibold font-mono leading-none tracking-[-0.02em] ${valColor}`}>
        {value}
      </div>
      <div className="text-[11px] text-ink-500 mt-1">{sub}</div>
    </div>
  )
}

interface ReconciledTableProps {
  transactions: Transaction[]
  showReconciled: boolean
  onToggleReconciled: () => void
  onUndoTransaction: (txId: string) => void
  showDismissed: boolean
  onToggleDismissed: () => void
  dismissed: DismissedTransaction[]
  onUndismiss: (id: string) => void
}

function ReconciledTable({
  transactions,
  showReconciled,
  onToggleReconciled,
  onUndoTransaction,
  showDismissed,
  onToggleDismissed,
  dismissed,
  onUndismiss,
}: ReconciledTableProps) {
  const [filter, setFilter] = useState("")
  // Default to the current month (YYYY-MM). "all" = no month filter.
  const [month, setMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })

  const normalized = filter.trim().toLowerCase()

  // Group by transaction: one row per payment, even when it was split across
  // multiple invoices. Undo always operates on the whole transaction so the
  // group stays consistent (matches the previous layout's behaviour).
  const filteredTx = transactions.filter((tx) => {
    if (month !== "all") {
      // tx.date is ISO (YYYY-MM-DD) — slice first 7 chars to compare against month state
      if ((tx.date || "").slice(0, 7) !== month) return false
    }
    if (!normalized) return true
    return (
      (tx.payerName || "").toLowerCase().includes(normalized) ||
      (tx.description || "").toLowerCase().includes(normalized) ||
      tx.links.some((l) => (l.patientName || "").toLowerCase().includes(normalized))
    )
  })

  const visible = showReconciled ? filteredTx.slice(0, 30) : filteredTx.slice(0, 8)
  const total = filteredTx.reduce(
    (s, tx) => s + tx.links.reduce((a, l) => a + l.amount, 0),
    0
  )

  return (
    <div className="bg-card border border-ink-200 rounded-[4px] p-4">
      {/* Title row — matches design: title on the left, small actions on the right */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="m-0 text-[12px] font-semibold text-ink-900 flex items-center gap-2">
          <CheckCircle2Icon className="w-3.5 h-3.5 text-ok-500" />
          Conciliadas recentemente
          <span className="bg-ok-50 text-ok-700 font-mono text-[10px] px-1.5 py-0.5 rounded-full border border-ok-100">
            {transactions.length}
          </span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleReconciled}
            className="h-7 px-2.5 rounded-[4px] text-ink-600 text-[11px] font-medium hover:bg-ink-100 transition-colors"
          >
            {showReconciled ? "Mostrar menos" : "Mostrar todas"}
          </button>
          <button
            type="button"
            className="h-7 px-2.5 rounded-[4px] text-ink-600 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-100 transition-colors"
          >
            <DownloadIcon className="w-3 h-3" />
            Exportar
          </button>
        </div>
      </div>

      {/* Filter bar — dedicated row so filters don't crowd the title */}
      <div className="flex items-center gap-2 mb-3 flex-wrap rounded-[4px] border border-ink-200 bg-ink-50 p-2">
        <div className="relative flex items-center flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por pagador ou paciente…"
            className="h-7 w-full pl-[26px] pr-2 rounded-[4px] border border-ink-300 bg-card text-[11px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-colors"
          />
        </div>
        <input
          type="month"
          value={month === "all" ? "" : month}
          onChange={(e) => setMonth(e.target.value || "all")}
          aria-label="Filtrar por mês"
          className="h-7 px-2 rounded-[4px] border border-ink-300 bg-card text-[11px] font-mono tabular-nums text-ink-800 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-colors"
        />
        {month !== "all" && (
          <button
            type="button"
            onClick={() => setMonth("all")}
            title="Limpar filtro de mês"
            className="h-7 px-2 rounded-[4px] text-ink-500 text-[11px] hover:bg-ink-100 transition-colors"
          >
            Todos os meses
          </button>
        )}
        <span className="w-px h-5 bg-ink-200 mx-0.5" />
        <label className="flex items-center gap-1.5 text-[11px] text-ink-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showDismissed}
            onChange={onToggleDismissed}
            className="w-3.5 h-3.5 rounded-[2px] border-ink-300 text-brand-500 focus:ring-brand-500/25"
          />
          Mostrar descartados
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-[12px] text-ink-500 m-0 py-4 text-center">
          {normalized || month !== "all"
            ? "Nenhuma conciliação encontrada para o filtro."
            : "Ainda não há pagamentos conciliados."}
        </p>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <Th className="w-[90px]">Data</Th>
              <Th>Pagamento recebido</Th>
              <Th>Fatura(s) conciliada(s)</Th>
              <Th className="text-right w-[110px]">Valor</Th>
              <Th className="w-[90px]" />
            </tr>
          </thead>
          <tbody>
            {visible.map((tx) => {
              const txTotal = tx.links.reduce((s, l) => s + l.amount, 0)
              const multi = tx.links.length > 1
              return (
                <tr key={tx.id} className="hover:bg-ink-50 align-top">
                  <Td className="font-mono">{formatDateBR(tx.date)}</Td>
                  <Td>
                    <div className="font-medium text-ink-900">{tx.payerName || "—"}</div>
                    <div className="text-[11px] font-mono text-ink-500 mt-0.5">
                      {txMethod(tx.description)}
                    </div>
                  </Td>
                  <Td>
                    {multi && (
                      <div className="text-[10px] font-medium text-brand-700 bg-brand-50 border border-brand-100 rounded-full inline-flex items-center px-1.5 py-0.5 mb-1.5">
                        {tx.links.length} faturas combinadas
                      </div>
                    )}
                    <ul className="space-y-1">
                      {tx.links.map((link) => (
                        <li key={link.linkId}>
                          <div className="font-medium text-ink-900">{link.patientName}</div>
                          <div className="text-[11px] font-mono text-ink-500 mt-0.5">
                            Fatura {getMonthName(link.referenceMonth)}/{link.referenceYear}
                            {multi && (
                              <>
                                <span className="text-ink-300 mx-1">·</span>
                                {formatCurrencyBRL(link.amount)}
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Td>
                  <Td className="text-right font-mono font-medium">
                    {formatCurrencyBRL(txTotal)}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => onUndoTransaction(tx.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-ok-700 hover:underline"
                      title={
                        multi
                          ? "Desfaz as duas conciliações deste pagamento"
                          : "Desfaz a conciliação"
                      }
                    >
                      <UnlinkIcon className="w-3 h-3" />
                      {multi ? "Desfazer tudo" : "Desfazer"}
                    </button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between mt-2.5 text-[11px] text-ink-500">
        <span>
          Mostrando {visible.length} de {filteredTx.length}
          {normalized ? ` (filtrado de ${transactions.length})` : ""} · {formatCurrencyBRL(total)}
        </span>
      </div>

      {/* Dismissed */}
      {showDismissed && dismissed.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink-100">
          <h4 className="m-0 mb-2 text-[11px] font-semibold text-ink-500 uppercase tracking-[0.08em]">
            Descartados · {dismissed.length}
          </h4>
          <ul className="space-y-1.5">
            {dismissed.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between text-[12px] bg-ink-50 border border-ink-100 rounded-[4px] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <span className="text-ink-700">{d.payerName || "Pagador não identificado"}</span>
                  <span className="ml-2 text-ink-500 font-mono text-[11px]">
                    {formatDateBR(d.date)} · {formatCurrencyBRL(d.amount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onUndismiss(d.id)}
                  className="text-[11px] text-brand-700 font-medium hover:underline inline-flex items-center gap-1"
                >
                  <CheckIcon className="w-3 h-3" />
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Th({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <th
      className={`text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 px-2.5 py-1.5 border-b border-ink-200 ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <td className={`px-2.5 py-2 border-b border-ink-100 text-ink-800 align-middle ${className}`}>
      {children}
    </td>
  )
}

function txMethod(description: string): string {
  const d = description.toUpperCase()
  if (d.includes("PIX")) return "PIX RECEBIDO"
  if (d.includes("TED")) return "TED"
  if (d.includes("BOLETO")) return "BOLETO"
  return d.split(/\s+/).slice(0, 2).join(" ") || "PAGAMENTO"
}
