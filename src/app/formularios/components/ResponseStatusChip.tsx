"use client"

import { FORM_STATUS_LABELS } from "@/lib/forms"
import type { FormResponseStatus } from "@prisma/client"

const TONE: Record<FormResponseStatus, string> = {
  ENVIADO: "bg-sky-50 text-sky-700",
  EM_PREENCHIMENTO: "bg-amber-50 text-amber-700",
  CONCLUIDO: "bg-emerald-50 text-emerald-700",
  EXPIRADO: "bg-ink-100 text-ink-500",
}

/** Status chip with pt-BR label and a tone per status. */
export function ResponseStatusChip({ status }: { status: FormResponseStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] ${TONE[status]}`}>
      {FORM_STATUS_LABELS[status]}
    </span>
  )
}
