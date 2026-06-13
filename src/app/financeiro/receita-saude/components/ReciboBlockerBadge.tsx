"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"

const BLOCKER_LABELS: Record<string, string> = {
  BENEFICIARIO_SEM_CPF: "Beneficiário sem CPF",
  BENEFICIARIO_SEM_NASCIMENTO: "Beneficiário sem data de nascimento",
  PAGADOR_SEM_CPF: "Pagador sem CPF",
  PROFISSIONAL_SEM_CPF: "Profissional sem CPF",
  PROFISSIONAL_SEM_CRP: "Profissional sem CRP",
  PAGAMENTO_SEM_DATA: "Pagamento sem data",
  VALOR_INVALIDO: "Valor inválido",
}

const PROFESSIONAL_BLOCKERS = new Set(["PROFISSIONAL_SEM_CPF", "PROFISSIONAL_SEM_CRP"])

export function ReciboBlockerBadge({
  blockers,
  patientId,
}: {
  blockers: string[]
  patientId: string
}) {
  if (blockers.length === 0) return null
  const isProfessional = blockers.some((b) => PROFESSIONAL_BLOCKERS.has(b))
  // Patients open via a query param on the list page (there is no /patients/[id]
  // route); &edit=1 opens the edit form so the missing CPF/birthdate can be fixed.
  const fixHref = isProfessional ? "/professionals" : `/patients?id=${patientId}&edit=1`

  return (
    <div className="flex flex-col gap-1">
      {blockers.map((b) => (
        <span
          key={b}
          title={BLOCKER_LABELS[b] ?? b}
          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          <AlertTriangle size={12} />
          {BLOCKER_LABELS[b] ?? b}
        </span>
      ))}
      <Link href={fixHref} className="text-xs text-primary hover:underline">
        Corrigir cadastro →
      </Link>
    </div>
  )
}
