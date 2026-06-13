import type { PeriodInput } from "./types"

const BOM = "﻿"
const DELIMITER = ";"
const CRLF = "\r\n"

/**
 * Format a number in Brazilian convention: "." thousands, "," decimal.
 * `1234.5` → `"1.234,5"`. Defaults to as-given decimals (max 2 for safety).
 */
export function formatNumberBr(n: number, decimals?: number): string {
  if (!Number.isFinite(n)) return "0"
  if (decimals == null) {
    // No fixed precision: dot thousands, comma decimal, up to 2 places, no padding.
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
  }
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Escape a single CSV cell for the ";"-delimited Brazilian dialect. */
function escapeCell(value: string | number | null): string {
  if (value === null || value === undefined) return ""
  const str = typeof value === "number" ? formatNumberBr(value) : String(value)
  // Quote when the value contains the delimiter, quotes, or a line break.
  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Build a CSV string that opens cleanly in Excel Brazil:
 * UTF-8 BOM, ";" delimiter, CRLF line endings, pt-BR numbers (commas).
 */
export function toCsvBr(
  headers: string[],
  rows: Array<Array<string | number | null>>
): string {
  const headerLine = headers.map(escapeCell).join(DELIMITER)
  const bodyLines = rows.map((row) => row.map(escapeCell).join(DELIMITER))
  return BOM + [headerLine, ...bodyLines].join(CRLF) + CRLF
}

/** "ocupacao-2026-05.csv" | "ocupacao-2026-T2.csv" | "ocupacao-2026.csv" */
export function csvFilename(prefix: string, period: PeriodInput): string {
  if (period.month != null) {
    return `${prefix}-${period.year}-${String(period.month).padStart(2, "0")}.csv`
  }
  if (period.quarter != null) {
    return `${prefix}-${period.year}-T${period.quarter}.csv`
  }
  return `${prefix}-${period.year}.csv`
}
