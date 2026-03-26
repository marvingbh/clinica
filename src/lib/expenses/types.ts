import type { ExpenseStatus, ExpenseFrequency } from "@prisma/client"

export interface ExpenseForList {
  id: string
  description: string
  supplierName: string | null
  amount: number
  dueDate: Date
  paidAt: Date | null
  status: ExpenseStatus
  paymentMethod: string | null
  category: { id: string; name: string; color: string } | null
  recurrenceId: string | null
}

export interface ExpenseFilters {
  status?: ExpenseStatus[]
  categoryId?: string
  supplierName?: string
  startDate?: Date
  endDate?: Date
}

export interface CreateExpenseInput {
  clinicId: string
  description: string
  supplierName?: string | null
  categoryId?: string | null
  amount: number
  dueDate: Date
  status?: ExpenseStatus
  paymentMethod?: string | null
  notes?: string | null
  recurrenceId?: string | null
  createdByUserId?: string | null
}

export interface CreateRecurrenceInput {
  clinicId: string
  description: string
  supplierName?: string | null
  categoryId?: string | null
  amount: number
  paymentMethod?: string | null
  frequency: ExpenseFrequency
  dayOfMonth: number
  startDate: Date
  endDate?: Date | null
}
