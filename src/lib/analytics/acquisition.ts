import type { DateRange } from "./types"

export const NAO_INFORMADO = "NAO_INFORMADO"

/** Labels for acquisition sources, including the synthetic "Não informado". */
export const REFERRAL_SOURCE_LABELS: Record<string, string> = {
  INDICACAO: "Indicação",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  SITE: "Site",
  CONVENIO: "Convênio",
  OUTRO: "Outro",
  [NAO_INFORMADO]: "Não informado",
}

/** Display order for sources (legacy/unknown last). */
const SOURCE_ORDER = [
  "INDICACAO",
  "INSTAGRAM",
  "GOOGLE",
  "SITE",
  "CONVENIO",
  "OUTRO",
  NAO_INFORMADO,
]

export interface NewPatientSlim {
  createdAt: Date
  referralSource: string | null
  /** Whether the patient has ≥1 finalized CONSULTA. */
  converted: boolean
}

export interface SourceRow {
  source: string
  label: string
  count: number
  converted: number
  conversionPct: number | null
}

export interface AcquisitionMonthRow {
  year: number
  month: number
  bySource: Record<string, number>
}

export interface AcquisitionReport {
  bySource: SourceRow[]
  byMonth: AcquisitionMonthRow[]
  total: number
}

function sourceKey(referralSource: string | null): string {
  return referralSource ?? NAO_INFORMADO
}

/**
 * Group new patients by acquisition source and by month within the range.
 * `referralSource = null` aggregates into "NAO_INFORMADO". Conversion = % with
 * ≥1 finalized CONSULTA.
 */
export function acquisitionReport(
  patients: NewPatientSlim[],
  range: DateRange
): AcquisitionReport {
  const counts = new Map<string, { count: number; converted: number }>()
  const monthMap = new Map<string, AcquisitionMonthRow>()

  for (const p of patients) {
    if (p.createdAt < range.start || p.createdAt >= range.end) continue
    const key = sourceKey(p.referralSource)

    const c = counts.get(key) || { count: 0, converted: 0 }
    c.count++
    if (p.converted) c.converted++
    counts.set(key, c)

    const y = p.createdAt.getUTCFullYear()
    const m = p.createdAt.getUTCMonth() + 1
    const mKey = `${y}-${m}`
    let row = monthMap.get(mKey)
    if (!row) {
      row = { year: y, month: m, bySource: {} }
      monthMap.set(mKey, row)
    }
    row.bySource[key] = (row.bySource[key] || 0) + 1
  }

  const bySource: SourceRow[] = SOURCE_ORDER.filter((s) => counts.has(s)).map((s) => {
    const c = counts.get(s)!
    return {
      source: s,
      label: REFERRAL_SOURCE_LABELS[s] ?? s,
      count: c.count,
      converted: c.converted,
      conversionPct: c.count === 0 ? null : c.converted / c.count,
    }
  })

  const byMonth = [...monthMap.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month
  )

  const total = [...counts.values()].reduce((acc, c) => acc + c.count, 0)

  return { bySource, byMonth, total }
}
