export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const MONTH_NAMES_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || ""
}

export function getMonthNameShort(month: number): string {
  return MONTH_NAMES_SHORT[month - 1] || ""
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/\u00A0/g, " ")
}

export function formatInvoiceReference(month: number, year: number): string {
  return `${getMonthName(month)}/${year}`
}

/** Format a date string as DD/MM/YYYY without timezone shift.
 *  `new Date("2026-04-10T00:00:00Z")` in UTC-3 shows day 9 — this avoids that. */
export function formatDateBR(dateStr: string): string {
  const [date] = dateStr.split("T")
  const [y, m, d] = date.split("-")
  return `${d}/${m}/${y}`
}
