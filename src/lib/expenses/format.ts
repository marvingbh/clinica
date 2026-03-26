import type { ExpenseStatus, ExpenseFrequency } from "@prisma/client"

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  DRAFT: "Rascunho",
  OPEN: "Em aberto",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
}

const FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  MONTHLY: "Mensal",
  YEARLY: "Anual",
}

export function formatExpenseStatus(status: ExpenseStatus): string {
  return STATUS_LABELS[status] ?? status
}

export function formatFrequency(frequency: ExpenseFrequency): string {
  return FREQUENCY_LABELS[frequency] ?? frequency
}
