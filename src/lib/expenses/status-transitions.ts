import type { ExpenseStatus } from "@prisma/client"

const VALID_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["PAID", "OVERDUE", "CANCELLED"],
  PAID: [],
  OVERDUE: ["PAID", "CANCELLED"],
  CANCELLED: [],
}

export function isValidTransition(
  from: ExpenseStatus,
  to: ExpenseStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getValidTransitions(status: ExpenseStatus): ExpenseStatus[] {
  return VALID_TRANSITIONS[status] ?? []
}
