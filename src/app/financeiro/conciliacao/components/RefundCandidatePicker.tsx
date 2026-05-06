"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useMountEffect } from "@/shared/hooks"
import { toast } from "sonner"
import { XIcon } from "@/shared/components/ui/icons"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"

export interface RefundCandidate {
  id: string
  amount: number
  remainingAmount: number
  date: string
  payerName: string | null
  description: string | null
  score: number
  reasons: string[]
}

interface SourceInfo {
  id: string
  amount: number
  payerName: string | null
  remainingAmount: number
  /** "credit" → looking for matching DEBIT; "debit" → looking for matching CREDIT */
  side: "credit" | "debit"
}

interface Props {
  source: SourceInfo
  onClose: () => void
  onLinked: () => void
}

const SOURCE_LABEL_BY_SIDE: Record<SourceInfo["side"], string> = {
  credit: "Identificar devolução",
  debit: "Identificar origem da devolução",
}

const PEER_NAME_BY_SIDE: Record<SourceInfo["side"], string> = {
  credit: "Débito",
  debit: "Crédito",
}

/**
 * Picker that lists candidate transactions of the *opposite* type to
 * pair as a refund link. Suggestions are ranked server-side by amount
 * proximity, payer-name similarity, and date proximity.
 */
export function RefundCandidatePicker({ source, onClose, onLinked }: Props) {
  const [candidates, setCandidates] = useState<RefundCandidate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [amount, setAmount] = useState<string>(source.remainingAmount.toFixed(2))
  const [isSaving, setIsSaving] = useState(false)
  const [windowDays, setWindowDays] = useState<number | null>(null)

  useMountEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const params = new URLSearchParams(
      source.side === "credit"
        ? { creditTransactionId: source.id }
        : { debitTransactionId: source.id },
    )
    fetch(`/api/financeiro/conciliacao/refund-candidates?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.candidates) {
          setCandidates(data.candidates)
          setWindowDays(data.windowDays ?? null)
        } else {
          toast.error("Erro ao buscar candidatos")
        }
      })
      .catch(() => toast.error("Erro de conexão"))
      .finally(() => setIsLoading(false))
    return () => window.removeEventListener("keydown", onKey)
  })

  async function handleConfirm() {
    if (!selectedId) return
    const parsed = parseFloat(amount.replace(",", "."))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Valor inválido")
      return
    }
    setIsSaving(true)
    try {
      const body =
        source.side === "credit"
          ? { creditTransactionId: source.id, debitTransactionId: selectedId, amount: parsed }
          : { creditTransactionId: selectedId, debitTransactionId: source.id, amount: parsed }
      const res = await fetch("/api/financeiro/conciliacao/refund-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result.error ?? "Erro ao registrar devolução")
        return
      }
      toast.success("Devolução registrada")
      onLinked()
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-[rgba(15,23,41,0.45)] grid place-items-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[640px] max-w-[94vw] max-h-[88vh] bg-card rounded-xl flex flex-col overflow-hidden shadow-xl text-[13px]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-[15px] font-bold">{SOURCE_LABEL_BY_SIDE[source.side]}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {source.payerName ?? "Sem nome"} ·{" "}
              <span className="tabular-nums">{formatCurrencyBRL(source.amount)}</span> total ·{" "}
              <span className="tabular-nums font-medium">
                {formatCurrencyBRL(source.remainingAmount)} restante
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md grid place-items-center text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">Buscando candidatos…</div>
          )}
          {!isLoading && candidates.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhum {PEER_NAME_BY_SIDE[source.side].toLowerCase()} candidato encontrado
              {windowDays != null ? ` nos últimos ${windowDays} dias` : ""}.
            </div>
          )}
          {!isLoading && candidates.length > 0 && (
            <ul className="space-y-2">
              {candidates.map((c) => {
                const isSelected = c.id === selectedId
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id)
                        // Default the amount to min(source remaining, candidate remaining)
                        setAmount(Math.min(source.remainingAmount, c.remainingAmount).toFixed(2))
                      }}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">
                            {formatCurrencyBRL(c.remainingAmount)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateBR(c.date)}
                          </span>
                        </div>
                        {c.reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {c.reasons.map((r) => (
                              <span
                                key={r}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {c.payerName ?? c.description ?? "—"}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center gap-3 px-5 py-3.5 border-t border-border">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Valor</span>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!selectedId || isSaving}
              className="w-28 h-8 px-2 rounded-md border border-input bg-background text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              inputMode="decimal"
            />
          </label>
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={isSaving}
            className="h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId || isSaving || !amount}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? "Registrando..." : "Registrar devolução"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
