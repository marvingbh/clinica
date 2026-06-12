"use client"

import { deriveChargeBadge, CHARGE_BADGE_LABELS, type ChargeBadgeInput } from "@/lib/cobranca"
import type { ChargeBadgeStatus } from "@/lib/cobranca/types"

const STYLES: Record<ChargeBadgeStatus, string> = {
  ATIVO: "bg-blue-100 text-blue-700",
  VISUALIZADO: "bg-indigo-100 text-indigo-700",
  PAGO_PIX: "bg-emerald-100 text-emerald-700",
  PAGO_CARTAO: "bg-emerald-100 text-emerald-700",
  EXPIRADO: "bg-amber-100 text-amber-700",
  CANCELADO: "bg-slate-100 text-slate-600",
  REEMBOLSADA: "bg-red-100 text-red-700",
}

/** Small chip showing the cobrança status of the most recent charge. */
export default function ChargeBadge({ charge }: { charge: ChargeBadgeInput }) {
  const badge = deriveChargeBadge(charge)
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[badge]}`}>
      {CHARGE_BADGE_LABELS[badge]}
    </span>
  )
}
