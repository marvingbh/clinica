import type { DateRange, PeriodInput } from "./types"

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

/**
 * Resolve a PeriodInput into a half-open UTC date range [start, end).
 * Month wins over quarter; if neither is set the whole year is used.
 */
export function resolvePeriod(input: PeriodInput): DateRange {
  const { year } = input
  if (input.month != null) {
    const m = input.month // 1-12
    return {
      start: new Date(Date.UTC(year, m - 1, 1)),
      end: new Date(Date.UTC(year, m, 1)),
    }
  }
  if (input.quarter != null) {
    const q = input.quarter // 1-4
    const startMonth = (q - 1) * 3
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 1)),
    }
  }
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  }
}

/** Returns the period immediately before the given one (same granularity). */
export function prevPeriod(input: PeriodInput): PeriodInput {
  if (input.month != null) {
    const m = input.month
    if (m === 1) return { year: input.year - 1, month: 12 }
    return { year: input.year, month: m - 1 }
  }
  if (input.quarter != null) {
    const q = input.quarter
    if (q === 1) return { year: input.year - 1, quarter: 4 }
    return { year: input.year, quarter: q - 1 }
  }
  return { year: input.year - 1 }
}

/** pt-BR label: "Maio 2026" | "2º trimestre 2026" | "2026". */
export function periodLabel(input: PeriodInput): string {
  if (input.month != null) {
    return `${MONTH_NAMES_PT[input.month - 1]} ${input.year}`
  }
  if (input.quarter != null) {
    return `${input.quarter}º trimestre ${input.year}`
  }
  return `${input.year}`
}

/** Enumerate the (year, month) pairs covered by the range, in order. */
export function monthsInRange(range: DateRange): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = []
  let y = range.start.getUTCFullYear()
  let m = range.start.getUTCMonth() // 0-11
  const endY = range.end.getUTCFullYear()
  const endM = range.end.getUTCMonth()
  // [start, end) — stop before the month containing `end` (end is exclusive,
  // and always lands on the 1st of a month).
  while (y < endY || (y === endY && m < endM)) {
    result.push({ year: y, month: m + 1 })
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return result
}
