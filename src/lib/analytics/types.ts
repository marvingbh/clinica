/**
 * Shared DTOs for the operational dashboard (/relatorios).
 * Pure types only — no Prisma or framework dependencies.
 */

export type PeriodGranularity = "month" | "quarter" | "year"

export interface PeriodInput {
  year: number
  /** 1-12 when granularity is "month"; null otherwise. */
  month?: number | null
  /** 1-4 when granularity is "quarter"; null otherwise. */
  quarter?: number | null
}

/** Half-open interval [start, end) in UTC. */
export interface DateRange {
  start: Date
  end: Date
}

export type CancelStatus =
  | "CANCELADO_ACORDADO"
  | "CANCELADO_FALTA"
  | "CANCELADO_PROFISSIONAL"

export const CANCEL_STATUSES: CancelStatus[] = [
  "CANCELADO_ACORDADO",
  "CANCELADO_FALTA",
  "CANCELADO_PROFISSIONAL",
]

/** Statuses that occupy a slot on the agenda (not cancelled). */
export const BOOKED_STATUSES = ["AGENDADO", "CONFIRMADO", "FINALIZADO"] as const

/** Brazil is UTC-3 with no DST since 2019; fixed offset in minutes. */
export const BR_TZ_OFFSET_MINUTES = -180

export function emptyCancelRecord(): Record<CancelStatus, number> {
  return {
    CANCELADO_ACORDADO: 0,
    CANCELADO_FALTA: 0,
    CANCELADO_PROFISSIONAL: 0,
  }
}
