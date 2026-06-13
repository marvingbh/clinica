import type { PeriodInput } from "./types"

export type ReportFormat = "json" | "csv"

export interface ParsedReportQuery {
  ok: true
  period: PeriodInput
  professionalId: string | null
  format: ReportFormat
}

export interface ParsedReportQueryError {
  ok: false
  error: string
}

/**
 * Parse the common query string for all report routes.
 * `?year=2026&month=5` or `&quarter=2` (mutually exclusive); absent = full year.
 * `&professionalId=...` (optional), `&format=csv` (optional).
 *
 * Tenant validation of professionalId happens in the route, not here.
 */
export function parseReportQuery(
  searchParams: URLSearchParams
): ParsedReportQuery | ParsedReportQueryError {
  const yearRaw = searchParams.get("year")
  const year = yearRaw ? Number(yearRaw) : new Date().getUTCFullYear()
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Ano inválido" }
  }

  const monthRaw = searchParams.get("month")
  const quarterRaw = searchParams.get("quarter")
  if (monthRaw != null && quarterRaw != null) {
    return { ok: false, error: "Informe mês ou trimestre, não ambos" }
  }

  let month: number | null = null
  let quarter: number | null = null

  if (monthRaw != null) {
    const m = Number(monthRaw)
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return { ok: false, error: "Mês inválido" }
    }
    month = m
  } else if (quarterRaw != null) {
    const q = Number(quarterRaw)
    if (!Number.isInteger(q) || q < 1 || q > 4) {
      return { ok: false, error: "Trimestre inválido" }
    }
    quarter = q
  }

  const professionalId = searchParams.get("professionalId") || null

  const formatRaw = searchParams.get("format")
  const format: ReportFormat = formatRaw === "csv" ? "csv" : "json"

  return {
    ok: true,
    period: { year, month, quarter },
    professionalId,
    format,
  }
}
