"use client"

import { useState } from "react"
import {
  SparklesIcon,
  InfoIcon,
  LinkIcon,
  EyeIcon,
  SearchIcon,
  PlusIcon,
  XIcon,
  UnlinkIcon,
  Loader2Icon,
} from "lucide-react"
import { formatCurrencyBRL, formatDateBR, getMonthName } from "@/lib/financeiro/format"
import { allocateGroupPayment } from "@/lib/bank-reconciliation"
import { InvoiceSearch, type InvoiceSearchResult } from "./InvoiceSearch"
import type { Transaction, Candidate, CandidateInvoice } from "./types"

function payerInitials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return "?"
  return (parts[0][0] + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase()
}

function initials(name: string | null | undefined): string {
  if (!name) return "?"
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase()
}

type Reason = {
  tone: "strong" | "suggested" | "none"
  icon: React.ReactNode
  text: React.ReactNode
}

function computeReason(tx: Transaction): Reason {
  const groupCount = tx.groupCandidates?.length ?? 0
  if (tx.candidates.length === 0 && groupCount === 0) {
    return {
      tone: "none",
      icon: <InfoIcon className="w-3.5 h-3.5" />,
      text: (
        <>
          <b className="font-semibold">Sem candidatos.</b> Nenhuma fatura em aberto corresponde ao
          valor ou pagador. Busque manualmente, crie uma fatura ou descarte.
        </>
      ),
    }
  }
  const top = tx.candidates[0]
  if (groupCount > 0 || top?.confidence === "HIGH" || top?.confidence === "KNOWN") {
    return {
      tone: "strong",
      icon: <SparklesIcon className="w-3.5 h-3.5" />,
      text: (
        <>
          <b className="font-semibold">Match forte detectado.</b> Encontramos fatura em aberto com
          o mesmo valor e responsável financeiro vinculado. Confira e confirme.
        </>
      ),
    }
  }
  return {
    tone: "suggested",
    icon: <InfoIcon className="w-3.5 h-3.5" />,
    text: (
      <>
        <b className="font-semibold">Match sugerido.</b> Valor bate, mas o nome do pagador não está
        vinculado como responsável. Verifique antes de conciliar.
      </>
    ),
  }
}

interface WorkspacePaneProps {
  tx: Transaction | null
  isConfirming: boolean
  onReconcileOne: (invoiceId: string, amount: number) => void
  onReconcileGroup: (links: Array<{ invoiceId: string; amount: number }>) => void
  onDismiss: (txId: string, reason: "DUPLICATE" | "NOT_PATIENT") => void
  onCreateInvoice: () => void
}

export function WorkspacePane({
  tx,
  isConfirming,
  onReconcileOne,
  onReconcileGroup,
  onDismiss,
  onCreateInvoice,
}: WorkspacePaneProps) {
  // Manually-added candidates (from "Buscar outra fatura"). Reset whenever the
  // selected transaction changes, since parent passes key={tx.id}.
  const [addedCandidates, setAddedCandidates] = useState<InvoiceSearchResult[]>([])
  const [showSearch, setShowSearch] = useState(false)
  if (!tx) {
    return (
      <div className="flex items-center justify-center min-h-[520px] text-[13px] text-ink-500">
        Selecione um pagamento para ver candidatos à conciliação.
      </div>
    )
  }

  const reason = computeReason(tx)
  const groups = tx.groupCandidates || []
  const hasAny = tx.candidates.length > 0 || groups.length > 0
  const topIdx = tx.candidates.findIndex(
    (c) => c.confidence === "HIGH" || c.confidence === "KNOWN"
  )

  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      {/* Head */}
      <div className="px-5 pt-4 pb-3 border-b border-ink-200 flex flex-col gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-[4px] bg-brand-100 text-brand-700 font-semibold text-[13px] grid place-items-center flex-shrink-0">
            {payerInitials(tx.payerName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-ink-900 tracking-tight truncate">
              {tx.payerName || "Pagador não identificado"}
            </div>
            <div className="text-[11px] text-ink-500 font-mono mt-0.5 truncate">
              {tx.description}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[20px] font-semibold font-mono text-ink-900 leading-none tracking-[-0.02em]">
              {formatCurrencyBRL(tx.amount)}
            </div>
            <div className="text-[11px] text-ink-500 mt-1">Recebido {formatDateBR(tx.date)}</div>
          </div>
        </div>

        <div
          className={`flex items-start gap-2.5 p-2.5 rounded-[4px] border text-[11px] leading-[1.5] ${
            reason.tone === "strong"
              ? "bg-ok-50 border-ok-100 text-ok-700"
              : reason.tone === "suggested"
                ? "bg-warn-50 border-warn-100 text-warn-700"
                : "bg-ink-50 border-ink-200 text-ink-600"
          }`}
        >
          <span className="flex-shrink-0 mt-0.5">{reason.icon}</span>
          <div className="flex-1">{reason.text}</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
            Candidatos
            <span className="font-mono bg-ink-100 text-ink-700 px-1.5 py-0 rounded-full text-[10px] tracking-normal">
              {groups.reduce((n, g) => n + g.invoices.length, 0) +
                tx.candidates.length +
                addedCandidates.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className={`h-7 px-2.5 rounded-[4px] text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors ${
              showSearch
                ? "bg-brand-50 text-brand-700 border border-brand-200"
                : "border border-ink-300 bg-card text-ink-800 hover:bg-ink-50 hover:border-ink-400"
            }`}
          >
            <SearchIcon className="w-3 h-3" />
            {showSearch ? "Fechar busca" : "Buscar outra fatura"}
          </button>
        </div>

        {/* Inline invoice search — adds the pick to the candidate list
            without auto-conciliating. */}
        {showSearch && (
          <div className="mb-3 p-3 rounded-[4px] border border-ink-200 bg-ink-50">
            <InvoiceSearch
              selectedIds={addedCandidates.map((a) => a.invoiceId)}
              onSelect={() => {}}
              onPick={(inv) => {
                setAddedCandidates((prev) =>
                  prev.some((p) => p.invoiceId === inv.invoiceId) ? prev : [...prev, inv]
                )
              }}
            />
          </div>
        )}

        {!hasAny && addedCandidates.length === 0 && (
          <div className="p-8 text-center border border-dashed border-ink-300 rounded-[4px] text-ink-500">
            <UnlinkIcon className="w-7 h-7 text-ink-400 mx-auto" />
            <h4 className="text-[13px] font-semibold text-ink-700 mt-2.5 mb-1">
              Nenhuma fatura em aberto bate com este pagamento
            </h4>
            <p className="text-[12px] m-0 mb-3">
              Você pode buscar manualmente, criar uma fatura ou descartar.
            </p>
            <div className="inline-flex gap-1.5 flex-wrap justify-center">
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="h-7 px-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 transition-colors"
              >
                <SearchIcon className="w-3 h-3" />
                Buscar fatura
              </button>
              <button
                type="button"
                onClick={onCreateInvoice}
                className="h-7 px-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                Criar fatura
              </button>
              <button
                type="button"
                onClick={() => onDismiss(tx.id, "NOT_PATIENT")}
                className="h-7 px-2.5 rounded-[4px] text-ink-600 text-[11px] font-medium hover:bg-ink-100 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Group candidate card — top of list */}
        {groups.map((g, gi) => {
          const total = g.invoices.reduce((s, i) => s + i.totalAmount, 0)
          return (
            <div
              key={`group-${gi}`}
              className="p-3 rounded-[4px] border border-ok-300 mb-2"
              style={{ background: "#F7FDF9" }}
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ok-700">
                  <SparklesIcon className="w-3 h-3" />
                  Pagamento combinado{g.sharedParent ? ` · mesmo responsável: ${g.sharedParent}` : ""}
                </div>
                <div className="text-[12px] font-mono text-ink-700 font-medium">
                  {g.invoices.length} faturas · {formatCurrencyBRL(total)}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 mb-2.5">
                {g.invoices.map((inv) => (
                  <InvoiceChip key={inv.invoiceId} inv={inv} />
                ))}
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onReconcileGroup(
                      allocateGroupPayment(
                        g.invoices.map((i) => ({
                          invoiceId: i.invoiceId,
                          remainingAmount: i.remainingAmount,
                        })),
                        tx.remainingAmount
                      )
                    )
                  }
                  disabled={isConfirming}
                  className="h-7 px-2.5 rounded-[4px] bg-brand-500 text-white text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {isConfirming ? (
                    <Loader2Icon className="w-3 h-3 animate-spin" />
                  ) : (
                    <LinkIcon className="w-3 h-3" />
                  )}
                  Conciliar todas
                </button>
              </div>
            </div>
          )
        })}

        {/* Individual candidates */}
        {tx.candidates.map((c, i) => (
          <CandidateRow
            key={c.invoiceId}
            rank={i + 1}
            candidate={c}
            tx={tx}
            isTop={i === (topIdx >= 0 ? topIdx : -1)}
            isConfirming={isConfirming}
            onReconcile={onReconcileOne}
          />
        ))}

        {/* Manually-added candidates */}
        {addedCandidates.length > 0 && (
          <>
            <div className="mt-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              Adicionadas manualmente
            </div>
            {addedCandidates.map((inv, i) => (
              <AddedCandidateRow
                key={inv.invoiceId}
                rank={tx.candidates.length + i + 1}
                invoice={inv}
                tx={tx}
                isConfirming={isConfirming}
                onRemove={() =>
                  setAddedCandidates((prev) => prev.filter((p) => p.invoiceId !== inv.invoiceId))
                }
                onReconcile={onReconcileOne}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-ink-200 bg-ink-50">
        <button
          type="button"
          onClick={onCreateInvoice}
          className="h-7 px-2.5 rounded-[4px] border border-ink-300 bg-card text-ink-800 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-50 hover:border-ink-400 transition-colors"
        >
          <PlusIcon className="w-3 h-3" />
          Criar fatura
        </button>
        <button
          type="button"
          onClick={() => onDismiss(tx.id, "NOT_PATIENT")}
          className="h-7 px-2.5 rounded-[4px] text-ink-600 text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-ink-100 transition-colors"
        >
          <XIcon className="w-3 h-3" />
          Descartar
        </button>
        <div className="flex-1 text-[11px] text-ink-500 flex items-center justify-end gap-1.5">
          <span className="font-mono text-[10px] bg-card border border-ink-200 text-ink-600 rounded px-1.5 py-0.5">
            J
          </span>
          <span className="font-mono text-[10px] bg-card border border-ink-200 text-ink-600 rounded px-1.5 py-0.5">
            K
          </span>
          navegar
        </div>
      </div>
    </div>
  )
}

interface AddedCandidateRowProps {
  rank: number
  invoice: InvoiceSearchResult
  tx: Transaction
  isConfirming: boolean
  onReconcile: (invoiceId: string, amount: number) => void
  onRemove: () => void
}

function AddedCandidateRow({
  rank,
  invoice: inv,
  tx,
  isConfirming,
  onReconcile,
  onRemove,
}: AddedCandidateRowProps) {
  const amount = inv.remainingAmount ?? inv.totalAmount
  const splitAmt = tx.remainingAmount < amount ? tx.remainingAmount : undefined

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3.5 items-center p-3 rounded-[4px] border border-brand-200 bg-brand-50/40 mb-2 transition-all">
      <div className="w-6 h-6 rounded-[2px] grid place-items-center font-mono font-semibold text-[11px] bg-brand-100 text-brand-700">
        {rank}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-900 tracking-tight truncate">
          {inv.patientName}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-500 mt-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] border bg-brand-50 text-brand-700 border-brand-100">
            Adicionada manualmente
          </span>
          {inv.motherName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-600">
              Mãe: {inv.motherName}
            </span>
          )}
          {inv.fatherName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-600">
              Pai: {inv.fatherName}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-600">
            Fatura {getMonthName(inv.referenceMonth)}/{inv.referenceYear}
          </span>
          {splitAmt !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-warn-50 text-warn-700 border border-warn-100">
              Total {formatCurrencyBRL(amount)}
            </span>
          )}
        </div>
      </div>
      <div className="font-mono text-[13px] font-semibold text-ink-900 text-right tracking-tight">
        {formatCurrencyBRL(splitAmt ?? amount)}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onRemove}
          title="Remover da lista"
          className="h-[22px] w-[22px] grid place-items-center rounded-[4px] text-ink-500 hover:bg-ink-100 hover:text-err-700 transition-colors"
        >
          <XIcon className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onReconcile(inv.invoiceId, splitAmt ?? amount)}
          disabled={isConfirming}
          className="h-[22px] px-2 rounded-[4px] text-[11px] font-medium inline-flex items-center gap-1 bg-brand-500 text-white border border-brand-500 hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {isConfirming ? <Loader2Icon className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
          Conciliar
        </button>
      </div>
    </div>
  )
}

interface CandidateRowProps {
  rank: number
  candidate: Candidate
  tx: Transaction
  isTop: boolean
  isConfirming: boolean
  onReconcile: (invoiceId: string, amount: number) => void
}

function CandidateRow({ rank, candidate: c, tx, isTop, isConfirming, onReconcile }: CandidateRowProps) {
  const amount = c.remainingAmount ?? c.totalAmount
  const splitAmt = tx.remainingAmount < amount ? tx.remainingAmount : undefined
  const isPartial = splitAmt !== undefined

  const tag =
    c.confidence === "KNOWN"
      ? { label: "Pagador usual", cls: "bg-brand-50 text-brand-700 border-brand-100" }
      : c.confidence === "HIGH"
        ? { label: "Responsável bate", cls: "bg-ok-50 text-ok-700 border-ok-100" }
        : c.confidence === "MEDIUM"
          ? { label: "Parcial", cls: "bg-warn-50 text-warn-700 border-warn-100" }
          : { label: "Só valor", cls: "bg-warn-50 text-warn-700 border-warn-100" }

  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto] gap-3.5 items-center p-3 rounded-[4px] border mb-2 transition-all cursor-pointer ${
        isTop
          ? "border-ok-300 hover:border-ok-500"
          : "border-ink-200 bg-card hover:border-brand-300 hover:shadow-sm"
      }`}
      style={isTop ? { background: "#F7FDF9" } : undefined}
    >
      <div
        className={`w-6 h-6 rounded-[2px] grid place-items-center font-mono font-semibold text-[11px] ${
          isTop ? "bg-ok-100 text-ok-700" : "bg-ink-100 text-ink-700"
        }`}
      >
        {rank}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-900 tracking-tight truncate">
          {c.patientName}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-500 mt-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-[3px] border ${tag.cls}`}>
            {tag.label}
          </span>
          {c.motherName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-600">
              Mãe: {c.motherName}
            </span>
          )}
          {c.fatherName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-600">
              Pai: {c.fatherName}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-600">
            Fatura {getMonthName(c.referenceMonth)}/{c.referenceYear}
          </span>
          {isPartial && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-warn-50 text-warn-700 border border-warn-100">
              Total {formatCurrencyBRL(amount)}
            </span>
          )}
        </div>
      </div>
      <div className="font-mono text-[13px] font-semibold text-ink-900 text-right tracking-tight">
        {formatCurrencyBRL(splitAmt ?? amount)}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          title="Ver fatura"
          className="h-[22px] w-[22px] grid place-items-center rounded-[4px] text-ink-500 hover:bg-ink-100 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            window.open(`/financeiro/faturas/${c.invoiceId}`, "_blank")
          }}
        >
          <EyeIcon className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onReconcile(c.invoiceId, splitAmt ?? amount)
          }}
          disabled={isConfirming}
          className={`h-[22px] px-2 rounded-[4px] text-[11px] font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${
            isTop
              ? "bg-ok-500 text-white border border-ok-500 hover:bg-ok-700"
              : "bg-card text-ink-800 border border-ink-300 hover:bg-ink-50 hover:border-ink-400"
          }`}
        >
          {isConfirming ? <Loader2Icon className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
          Conciliar
        </button>
      </div>
    </div>
  )
}

function InvoiceChip({ inv }: { inv: CandidateInvoice }) {
  return (
    <div className="flex items-center justify-between gap-2.5 px-2.5 py-1.5 bg-card border border-ink-200 rounded-[2px]">
      <div className="flex items-center gap-2 text-[12px] text-ink-800">
        <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 border border-brand-200 grid place-items-center text-[10px] font-semibold">
          {initials(inv.patientName)}
        </span>
        <span>{inv.patientName}</span>
        <span className="text-[10px] font-mono text-ink-500">
          · fatura {getMonthName(inv.referenceMonth)}/{inv.referenceYear}
        </span>
      </div>
      <div className="font-mono text-[12px] text-ink-900 font-medium">
        {formatCurrencyBRL(inv.totalAmount)}
      </div>
    </div>
  )
}
