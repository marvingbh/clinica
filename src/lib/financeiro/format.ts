const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || ""
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/\u00A0/g, " ")
}

export function formatInvoiceReference(month: number, year: number): string {
  return `${getMonthName(month)}/${year}`
}
