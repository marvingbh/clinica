/**
 * Format helpers for DANFSE PDF generation.
 * CNPJ, CPF, currency, and date formatting for Brazilian fiscal documents.
 */

/** Format CNPJ: XX.XXX.XXX/XXXX-XX */
export function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "").padStart(14, "0")
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
}

/** Format CPF: XXX.XXX.XXX-XX */
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "").padStart(11, "0")
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

/** Format currency as R$ X.XXX,XX */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/\u00A0/g, " ")
}

/** Format date as DD/MM/YYYY HH:mm */
export function formatDateTimeBR(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

/** Format CEP: XXXXX-XXX */
export function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, "").padStart(8, "0")
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`
}
