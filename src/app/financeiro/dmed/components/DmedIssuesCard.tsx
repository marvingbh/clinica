"use client"

import Link from "next/link"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import type { DmedIssueView } from "./types"

const BLOCKER_LABELS: Record<string, string> = {
  BENEFICIARIO_SEM_CPF: "Beneficiário sem CPF",
  BENEFICIARIO_SEM_NASCIMENTO: "Beneficiário sem data de nascimento",
  PAGADOR_SEM_CPF: "Pagador sem CPF",
  PROFISSIONAL_SEM_CPF: "Profissional sem CPF",
  PROFISSIONAL_SEM_CRP: "Profissional sem CRP",
  PAGAMENTO_SEM_DATA: "Pagamento sem data",
  VALOR_INVALIDO: "Valor inválido",
}

export function DmedIssuesCard({ issues, unexplainedDiff }: { issues: DmedIssueView[]; unexplainedDiff: number }) {
  if (issues.length === 0 && Math.abs(unexplainedDiff) < 0.01) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">Pendências</h3>
      {Math.abs(unexplainedDiff) >= 0.01 && (
        <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">
          Diferença não explicada: {formatCurrencyBRL(unexplainedDiff)}
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {issues.map((issue, i) => (
          <li key={i} className="flex items-center justify-between">
            {issue.kind === "BLOQUEIO" ? (
              <>
                <span>
                  {issue.patientName}: {issue.blockers.map((b) => BLOCKER_LABELS[b] ?? b).join(", ")}
                </span>
                <Link href={`/patients/${issue.patientId}`} className="text-primary hover:underline">
                  Corrigir →
                </Link>
              </>
            ) : issue.kind === "PARCIAL_SEM_DETALHE" ? (
              <>
                <span>
                  Fatura parcial sem detalhe: {issue.patientName} · {formatCurrencyBRL(issue.amount)}
                </span>
                <Link href={`/financeiro/faturas/${issue.invoiceId}`} className="text-primary hover:underline">
                  Abrir →
                </Link>
              </>
            ) : (
              <>
                <span>
                  Recebimento sem origem: {issue.payerName ?? "—"} · {formatCurrencyBRL(issue.amount)}
                </span>
                <Link href="/financeiro/conciliacao" className="text-primary hover:underline">
                  Conciliar →
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
