"use client"

import { SearchIcon, SparklesIcon, UsersIcon } from "lucide-react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import type { Transaction } from "./types"

export type ConfidenceTab = "all" | "strong" | "suggested" | "none"

/** Maps a transaction to one of the three high-level buckets the inbox shows. */
export function getTxBucket(tx: Transaction): Exclude<ConfidenceTab, "all"> {
  const groupCount = tx.groupCandidates?.length ?? 0
  if (tx.candidates.length === 0 && groupCount === 0) return "none"
  const top = tx.candidates[0]
  const hasGroup = groupCount > 0
  if (hasGroup || top?.confidence === "HIGH" || top?.confidence === "KNOWN") return "strong"
  if (top?.confidence === "MEDIUM") return "suggested"
  return "suggested"
}

interface InboxListProps {
  transactions: Transaction[]
  selectedId: string | null
  onSelect: (txId: string) => void
  search: string
  onSearchChange: (s: string) => void
  activeTab: ConfidenceTab
  onTabChange: (t: ConfidenceTab) => void
}

export function InboxList({
  transactions,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  activeTab,
  onTabChange,
}: InboxListProps) {
  const counts: Record<ConfidenceTab, number> = {
    all: transactions.length,
    strong: transactions.filter((tx) => getTxBucket(tx) === "strong").length,
    suggested: transactions.filter((tx) => getTxBucket(tx) === "suggested").length,
    none: transactions.filter((tx) => getTxBucket(tx) === "none").length,
  }

  const normalized = search.trim().toLowerCase()
  const visible = transactions.filter((tx) => {
    if (activeTab !== "all" && getTxBucket(tx) !== activeTab) return false
    if (!normalized) return true
    return (
      tx.payerName?.toLowerCase().includes(normalized) ||
      tx.description?.toLowerCase().includes(normalized) ||
      tx.amount.toFixed(2).includes(normalized) ||
      tx.date.includes(normalized)
    )
  })

  const tabs: Array<{ key: ConfidenceTab; label: string }> = [
    { key: "all", label: "Todos" },
    { key: "strong", label: "Match forte" },
    { key: "suggested", label: "Sugerido" },
    { key: "none", label: "Sem relação" },
  ]

  return (
    <div className="flex flex-col min-h-0 border-r border-ink-200 bg-card">
      {/* Head */}
      <div className="px-3.5 py-3 border-b border-ink-200 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-[13px] font-semibold text-ink-900 flex items-center gap-2">
            Pendentes
            <span className="bg-ink-100 text-ink-700 font-mono text-[10px] px-1.5 py-0.5 rounded-full">
              {transactions.length}
            </span>
          </h3>
        </div>
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por pagador, valor ou data…"
            className="w-full h-7 pl-[26px] pr-2 rounded-[2px] border border-ink-200 bg-ink-50 text-[12px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:bg-card focus:border-brand-300 transition-colors"
          />
        </div>
        <div className="flex gap-1 text-[11px] flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={`h-[22px] px-2.5 rounded-full border font-medium inline-flex items-center gap-1.5 transition-colors ${
                activeTab === t.key
                  ? "bg-ink-900 text-white border-ink-900"
                  : "bg-card text-ink-600 border-ink-200 hover:text-ink-900"
              }`}
            >
              {t.label}
              <span
                className={`font-mono text-[10px] px-1.5 py-0 rounded-full ${
                  activeTab === t.key ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-ink-500">
            Nenhum pagamento pendente{normalized ? " para esta busca" : ""}.
          </div>
        ) : (
          visible.map((tx) => {
            const selected = selectedId === tx.id
            const bucket = getTxBucket(tx)
            const hasGroup = (tx.groupCandidates?.length ?? 0) > 0
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelect(tx.id)}
                className={`w-full text-left px-3.5 py-3 border-b border-ink-100 border-l-[3px] transition-colors ${
                  selected
                    ? "bg-brand-50 border-l-brand-500"
                    : "border-l-transparent hover:bg-ink-50"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="text-[12px] font-semibold text-ink-900 tracking-tight truncate flex-1 min-w-0">
                    {tx.payerName || "Pagador não identificado"}
                  </span>
                  <span className="text-[13px] font-semibold font-mono text-ink-900 tracking-tight">
                    {formatCurrencyBRL(tx.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-ink-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-500 uppercase">
                      {txMethod(tx)}
                    </span>
                    <span className="text-ink-300">·</span>
                    <span>{formatDateBR(tx.date)}</span>
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      bucket === "strong"
                        ? "bg-ok-500"
                        : bucket === "suggested"
                          ? "bg-warn-500"
                          : "bg-ink-400"
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {bucket === "strong" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-ok-50 text-ok-700 border border-ok-100">
                      <SparklesIcon className="w-3 h-3" />
                      Match forte
                    </span>
                  )}
                  {bucket === "suggested" && (
                    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warn-50 text-warn-700 border border-warn-100">
                      Sugerido
                    </span>
                  )}
                  {bucket === "none" && (
                    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-700 border border-ink-200">
                      Sem relação
                    </span>
                  )}
                  {hasGroup && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                      <UsersIcon className="w-3 h-3" />
                      {tx.groupCandidates![0].invoices.length} faturas
                    </span>
                  )}
                  {tx.candidates.length > 0 && !hasGroup && (
                    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-700 border border-ink-200">
                      {tx.candidates.length}{" "}
                      {tx.candidates.length === 1 ? "candidato" : "candidatos"}
                    </span>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function txMethod(tx: Transaction): string {
  const d = (tx.description || "").toUpperCase()
  if (d.includes("PIX")) return "PIX"
  if (d.includes("TED")) return "TED"
  if (d.includes("BOLETO")) return "BOLETO"
  return d.split(/\s+/).slice(0, 2).join(" ") || "PAGAMENTO"
}
