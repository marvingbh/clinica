"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import type { FiscalIssueView } from "./types"

/** Collapsible card listing "sem origem" recebimentos (unreconciled credits + partial invoices). */
export function SemOrigemCard({ issues }: { issues: FiscalIssueView[] }) {
  const [open, setOpen] = useState(false)
  const relevant = issues.filter((i) => i.kind === "SEM_ORIGEM" || i.kind === "PARCIAL_SEM_DETALHE")
  if (relevant.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-amber-800 dark:text-amber-200"
      >
        <span>
          {open ? <ChevronDown size={16} className="inline" /> : <ChevronRight size={16} className="inline" />}{" "}
          Recebimentos sem origem (não conciliados) — {relevant.length}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-amber-200 px-4 pb-3 dark:divide-amber-900">
          {relevant.map((issue, i) => (
            <li key={i} className="flex items-center justify-between py-2 text-sm">
              {issue.kind === "SEM_ORIGEM" ? (
                <>
                  <span>
                    {issue.date ? formatDateBR(issue.date) : "—"} · {issue.payerName ?? "Pagador desconhecido"} ·{" "}
                    {formatCurrencyBRL(issue.amount)}
                  </span>
                  <Link href="/financeiro/conciliacao" className="text-primary hover:underline">
                    Conciliar →
                  </Link>
                </>
              ) : (
                <>
                  <span>
                    Fatura parcial: {issue.patientName} · {formatCurrencyBRL(issue.amount)}
                  </span>
                  <Link href={`/financeiro/faturas/${issue.invoiceId}`} className="text-primary hover:underline">
                    Abrir fatura →
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
