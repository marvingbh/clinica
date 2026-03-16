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
  taxPercentage?: number | null // total tax % (Lei 12.741/2012)
}

export const DEFAULT_NFSE_DESCRIPTION_TEMPLATE =
  `Referente a consultas em psicoterapia de {{relacao}} {{paciente}}, nos dias {{dias}} de {{mes}} de {{ano}}, pela psicóloga {{profissional}}. Cada sessão com valor unitário de {{valor_sessao}}{{impostos}}`

/**
 * Build NFS-e service description from invoice/appointment data.
 */
export function buildNfseDescription(data: NfseDescriptionData, template?: string | null): string {
  const tmpl = template || DEFAULT_NFSE_DESCRIPTION_TEMPLATE

  const month = MONTH_NAMES[data.referenceMonth - 1] || ""
  const year = String(data.referenceYear)

  // Format session dates: "02, 12, 19 e 26"
  const days = data.sessionDates
    .map(d => d.getDate())
    .sort((a, b) => a - b)
  const diasStr = formatDaysList(days)

  // Determine relationship: if billingResponsible differs from patient, use "seu(a) filho(a)"
  const relacao = data.billingResponsibleName ? "seu(a) filho(a)" : ""

  // Format session fee
  const valorSessao = formatBRL(data.sessionFee)

  // Tax info (Lei 12.741/2012)
  const impostos = data.taxPercentage
    ? ` - Conforme Lei 12.741/2012, o percentual total de impostos incidentes neste serviço prestado é de aproximadamente ${data.taxPercentage.toFixed(2)}%`
    : ""

  return tmpl
    .replace(/\{\{relacao\}\}/g, relacao)
    .replace(/\{\{paciente\}\}/g, data.patientName)
    .replace(/\{\{profissional\}\}/g, data.professionalName + (data.professionalCrp ? ` (${data.professionalCrp})` : ""))
    .replace(/\{\{dias\}\}/g, diasStr)
    .replace(/\{\{mes\}\}/g, month)
    .replace(/\{\{ano\}\}/g, year)
    .replace(/\{\{valor_sessao\}\}/g, valorSessao)
    .replace(/\{\{impostos\}\}/g, impostos)
    .replace(/\{\{sessoes\}\}/g, String(days.length))
    .replace(/\s+/g, " ")
    .trim()
}

function formatDaysList(days: number[]): string {
  if (days.length === 0) return ""
  if (days.length === 1) return String(days[0])
  const formatted = days.map(d => String(d).padStart(2, "0"))
  return formatted.slice(0, -1).join(", ") + " e " + formatted[formatted.length - 1]
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}
