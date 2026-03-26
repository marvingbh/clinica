export interface CashFlowEntry {
  date: string // YYYY-MM-DD
  inflow: number
  outflow: number
  net: number
  runningBalance: number
  isProjected?: boolean // true for dates after today in projetado mode
  details: {
    invoices: { id: string; description: string; amount: number; status: string }[]
    expenses: { id: string; description: string; amount: number; status: string }[]
    repasse: { id: string; professionalName: string; amount: number }[]
  }
}

export interface CashFlowProjection {
  entries: CashFlowEntry[]
  summary: {
    totalInflow: number
    totalOutflow: number
    netFlow: number
    startingBalance: number
    projectedEndBalance: number
  }
}

export type CashFlowAlertType =
  | "NEGATIVE_BALANCE"
  | "LARGE_UPCOMING_EXPENSE"
  | "OVERDUE_CONCENTRATION"

export interface CashFlowAlert {
  type: CashFlowAlertType
  message: string
  date?: string
  amount?: number
}

export type Granularity = "daily" | "weekly" | "monthly"

export interface InvoiceForCashFlow {
  id: string
  totalAmount: number
  dueDate: Date
  paidAt: Date | null
  status: string
  patientName?: string
}

export interface ExpenseForCashFlow {
  id: string
  description: string
  amount: number
  dueDate: Date
  paidAt: Date | null
  status: string
}

export interface RepasseForCashFlow {
  id: string
  repasseAmount: number
  referenceMonth: number
  referenceYear: number
  paidAt: Date | null
  professionalName: string
}
