const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

export interface NfseDescriptionData {
  patientName: string
  billingResponsibleName?: string | null
  professionalName: string
  professionalCrp?: string | null
  referenceMonth: number // 1-12
  referenceYear: number
  sessionDates: Date[] // appointment dates
  sessionFee: number // unit price
  totalAmount?: number // net invoice total (after credits) — used to limit dates shown
  taxPercentage?: number | null // total tax % (Lei 12.741/2012)
}

export const DEFAULT_NFSE_DESCRIPTION_TEMPLATE =
  `Referente a {{consulta_label}} em psicoterapia de {{relacao}} {{paciente}}, {{dia_preposicao}} {{dias_completo}}, pela psicóloga {{profissional}} {{registro}}. {{valor_label}} de {{valor_sessao}}{{impostos}}`

/**
 * Build NFS-e service description from invoice/appointment data.
 */
export function buildNfseDescription(data: NfseDescriptionData, template?: string | null): string {
  const tmpl = template || DEFAULT_NFSE_DESCRIPTION_TEMPLATE

  const month = MONTH_NAMES[data.referenceMonth - 1] || ""
  const year = String(data.referenceYear)

  // Sort dates chronologically
  const sorted = [...data.sessionDates].sort((a, b) => a.getTime() - b.getTime())

  // When totalAmount is provided and less than all sessions, limit to the oldest N dates
  // that match the billed amount (credits reduce the count)
  let effectiveDates = sorted
  if (data.totalAmount !== undefined && data.sessionFee > 0) {
    const billedSessions = Math.round(data.totalAmount / data.sessionFee)
    if (billedSessions > 0 && billedSessions < sorted.length) {
      effectiveDates = sorted.slice(0, billedSessions)
    }
  }

  const days = effectiveDates.map(d => d.getDate()).sort((a, b) => a - b)

  // Build full date string: "14 e 23 de março e 07, 21 e 28 de abril de 2026"
  const fullDatesStr = formatDatesWithMonths(effectiveDates)

  // Simple days-only string for backwards compatibility: "07, 14, 21, 23 e 28"
  const diasStr = formatDaysList(days)

  // Determine relationship
  const relacao = data.billingResponsibleName ? "seu(a) filho(a)" : ""

  const valorSessao = formatBRL(data.sessionFee)

  const impostos = data.taxPercentage
    ? ` - Conforme Lei 12.741/2012, o percentual total de impostos incidentes neste serviço prestado é de aproximadamente ${data.taxPercentage.toFixed(2)}%`
    : ""

  const isSingle = days.length === 1

  let result = tmpl
    .replace(/\{\{consulta_label\}\}/g, isSingle ? "consulta" : "consultas")
    .replace(/\{\{dia_preposicao\}\}/g, isSingle ? "no dia" : "nos dias")
    .replace(/\{\{valor_label\}\}/g, isSingle ? "Valor" : "Cada sessão com valor unitário")

  // For old-style templates without new placeholders
  if (isSingle && !tmpl.includes("{{consulta_label}}")) {
    result = result
      .replace(/\bconsultas\b/g, "consulta")
      .replace(/\bnos dias\b/g, "no dia")
      .replace(/Cada sessão com valor unitário/g, "Valor")
  }

  return result
    .replace(/\{\{relacao\}\}/g, relacao)
    .replace(/\{\{paciente\}\}/g, data.patientName)
    .replace(/\{\{profissional\}\}/g, data.professionalName)
    .replace(/\{\{registro\}\}/g, data.professionalCrp || "")
    .replace(/\{\{dias_completo\}\}/g, fullDatesStr)
    .replace(/\{\{dias\}\}/g, diasStr)
    .replace(/\{\{mes\}\}/g, month)
    .replace(/\{\{ano\}\}/g, year)
    .replace(/\{\{valor_sessao\}\}/g, valorSessao)
    .replace(/\{\{impostos\}\}/g, impostos)
    .replace(/\{\{sessoes\}\}/g, String(days.length))
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Format dates grouped by year+month:
 *   Same month: "07, 14, 21 e 28 de abril de 2026"
 *   Cross-month: "14 e 23 de março e 07, 21 e 28 de abril de 2026"
 *   Cross-year: "15 e 22 de dezembro de 2025 e 05 e 12 de janeiro de 2026"
 */
function formatDatesWithMonths(sortedDates: Date[]): string {
  if (sortedDates.length === 0) return ""

  // Group by year+month (key: "YYYY-MM")
  const groups: Array<{ year: number; month: number; days: number[] }> = []
  for (const d of sortedDates) {
    const y = d.getFullYear()
    const m = d.getMonth()
    const last = groups[groups.length - 1]
    if (last && last.year === y && last.month === m) {
      last.days.push(d.getDate())
    } else {
      groups.push({ year: y, month: m, days: [d.getDate()] })
    }
  }

  if (groups.length === 1) {
    const g = groups[0]
    return `${formatDaysList(g.days)} de ${MONTH_NAMES[g.month]} de ${g.year}`
  }

  // Check if all groups share the same year
  const allSameYear = groups.every(g => g.year === groups[groups.length - 1].year)

  const parts = groups.map((g, idx) => {
    const daysStr = formatDaysList(g.days)
    const isLast = idx === groups.length - 1
    if (isLast) {
      return `${daysStr} de ${MONTH_NAMES[g.month]} de ${g.year}`
    }
    // Include year if it differs from the last group's year
    return allSameYear
      ? `${daysStr} de ${MONTH_NAMES[g.month]}`
      : `${daysStr} de ${MONTH_NAMES[g.month]} de ${g.year}`
  })

  return parts.join(" e ")
}

function formatDaysList(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 0) return ""
  if (sorted.length === 1) return String(sorted[0])
  const formatted = sorted.map(d => String(d).padStart(2, "0"))
  return formatted.slice(0, -1).join(", ") + " e " + formatted[formatted.length - 1]
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}
