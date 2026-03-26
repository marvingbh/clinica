import type {
  CashFlowEntry,
  CashFlowProjection,
  InvoiceForCashFlow,
  ExpenseForCashFlow,
  RepasseForCashFlow,
} from "./types"

/**
 * Calculate cash flow projection by bucketing invoices (inflow),
 * expenses (outflow), and repasse payments (outflow) into daily entries.
 */
export function calculateProjection(
  invoices: InvoiceForCashFlow[],
  expenses: ExpenseForCashFlow[],
  repasse: RepasseForCashFlow[],
  startDate: Date,
  endDate: Date,
  startingBalance: number = 0
): CashFlowProjection {
  const dayMap = new Map<string, {
    inflow: number
    outflow: number
    invoices: CashFlowEntry["details"]["invoices"]
    expenses: CashFlowEntry["details"]["expenses"]
    repasse: CashFlowEntry["details"]["repasse"]
  }>()

  const toKey = (d: Date) => d.toISOString().split("T")[0]

  // Initialize all days in range
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    dayMap.set(toKey(cursor), { inflow: 0, outflow: 0, invoices: [], expenses: [], repasse: [] })
    cursor.setDate(cursor.getDate() + 1)
  }

  // Bucket invoices as inflows
  for (const inv of invoices) {
    // Use paidAt for realized, dueDate for projected
    const effectiveDate = inv.paidAt ?? inv.dueDate
    const key = toKey(effectiveDate)
    const bucket = dayMap.get(key)
    if (!bucket) continue

    const amount = inv.totalAmount
    bucket.inflow += amount
    bucket.invoices.push({
      id: inv.id,
      description: inv.patientName ?? "Fatura",
      amount,
      status: inv.status,
    })
  }

  // Bucket expenses as outflows
  for (const exp of expenses) {
    const effectiveDate = exp.paidAt ?? exp.dueDate
    const key = toKey(effectiveDate)
    const bucket = dayMap.get(key)
    if (!bucket) continue

    bucket.outflow += exp.amount
    bucket.expenses.push({
      id: exp.id,
      description: exp.description,
      amount: exp.amount,
      status: exp.status,
    })
  }

  // Bucket repasse as outflows (use 15th of reference month as proxy date)
  for (const rep of repasse) {
    const effectiveDate = rep.paidAt ?? new Date(rep.referenceYear, rep.referenceMonth - 1, 15)
    const key = toKey(effectiveDate)
    const bucket = dayMap.get(key)
    if (!bucket) continue

    bucket.outflow += rep.repasseAmount
    bucket.repasse.push({
      id: rep.id,
      professionalName: rep.professionalName,
      amount: rep.repasseAmount,
    })
  }

  // Build entries with running balance
  const entries: CashFlowEntry[] = []
  let runningBalance = startingBalance
  let totalInflow = 0
  let totalOutflow = 0

  const sortedKeys = Array.from(dayMap.keys()).sort()
  for (const key of sortedKeys) {
    const bucket = dayMap.get(key)!
    const net = bucket.inflow - bucket.outflow
    runningBalance += net
    totalInflow += bucket.inflow
    totalOutflow += bucket.outflow

    entries.push({
      date: key,
      inflow: bucket.inflow,
      outflow: bucket.outflow,
      net,
      runningBalance,
      details: {
        invoices: bucket.invoices,
        expenses: bucket.expenses,
        repasse: bucket.repasse,
      },
    })
  }

  return {
    entries,
    summary: {
      totalInflow,
      totalOutflow,
      netFlow: totalInflow - totalOutflow,
      startingBalance,
      projectedEndBalance: runningBalance,
    },
  }
}
