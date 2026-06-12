import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { formatDateInTz } from "./placeholders"
import type { SessionRow } from "./types"

/** Invoice item types that represent a billable session (eligible for recibo). */
export const RECIBO_ELIGIBLE_ITEM_TYPES = [
  "SESSAO_REGULAR",
  "SESSAO_EXTRA",
  "SESSAO_GRUPO",
] as const

export const SUGGESTED_TUSS_LABEL =
  "Sessão de psicoterapia individual (verificar código TUSS vigente)"

export interface PaidItemInput {
  id: string
  description: string
  total: string | number
  appointmentScheduledAt: Date | null
  appointmentEndAt: Date | null
  invoiceStatus: string
  type: string
}

function toNumber(value: string | number): number {
  if (typeof value === "number") return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Filter items to those whose invoice is PAGO and whose type is one of the
 * eligible session types, then build SessionRow[] ordered by date. Duration is
 * derived from scheduledAt/endAt; falls back to `defaultDuration` minutes.
 * CREDITO items are never eligible.
 */
export function buildReciboSessionRows(
  items: PaidItemInput[],
  timezone: string,
  defaultDuration: number
): SessionRow[] {
  const eligible = items.filter(
    (item) =>
      item.invoiceStatus === "PAGO" &&
      (RECIBO_ELIGIBLE_ITEM_TYPES as readonly string[]).includes(item.type)
  )

  const rows = eligible.map((item) => {
    const scheduledAt = item.appointmentScheduledAt
    const endAt = item.appointmentEndAt
    let durationMinutes = defaultDuration
    if (scheduledAt && endAt) {
      const diff = Math.round((endAt.getTime() - scheduledAt.getTime()) / 60000)
      if (diff > 0) durationMinutes = diff
    }
    const sortKey = scheduledAt ? scheduledAt.getTime() : Number.MAX_SAFE_INTEGER
    return {
      sortKey,
      row: {
        date: scheduledAt ? formatDateInTz(scheduledAt, timezone) : "—",
        durationMinutes,
        unitPrice: formatCurrencyBRL(toNumber(item.total)),
        invoiceItemId: item.id,
      } satisfies SessionRow,
    }
  })

  rows.sort((a, b) => a.sortKey - b.sortKey)
  return rows.map((r) => r.row)
}

/** Sum the unit prices of all session rows, formatted as BRL. */
export function sumSessionRows(rows: SessionRow[]): string {
  const total = rows.reduce((sum, r) => sum + parseUnit(r.unitPrice), 0)
  return formatCurrencyBRL(total)
}

function parseUnit(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
