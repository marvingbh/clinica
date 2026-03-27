import type { CashFlowProjection, CashFlowAlert } from "./types"

const LARGE_EXPENSE_THRESHOLD = 5000 // R$ 5,000

/**
 * Detect cash flow alerts from a projection.
 * @param mode - "realizado" or "projetado" to adjust alert wording
 * @param hasBankIntegration - when true in realizado mode, suppresses NEGATIVE_BALANCE
 *   because invoice/expense paidAt dates may not match actual bank transaction dates
 */
export function detectAlerts(
  projection: CashFlowProjection,
  mode: "realizado" | "projetado" = "projetado",
  hasBankIntegration: boolean = false
): CashFlowAlert[] {
  const alerts: CashFlowAlert[] = []

  // 1. Negative balance warning
  // Skip in realizado mode with bank integration — invoice/expense paidAt dates
  // don't perfectly match bank transaction dates, causing false negative dips.
  const suppressNegativeAlert = mode === "realizado" && hasBankIntegration
  if (!suppressNegativeAlert) {
    const negativeEntry = projection.entries.find((e) => e.runningBalance < 0)
    if (negativeEntry) {
      const label = mode === "realizado" ? "Saldo negativo" : "Saldo projetado negativo"
      alerts.push({
        type: "NEGATIVE_BALANCE",
        message: `${label} em ${formatDateBR(negativeEntry.date)}: ${formatCurrency(negativeEntry.runningBalance)}`,
        date: negativeEntry.date,
        amount: negativeEntry.runningBalance,
      })
    }
  }

  // 2. Large upcoming expenses (single-day outflow > threshold)
  for (const entry of projection.entries) {
    if (entry.outflow >= LARGE_EXPENSE_THRESHOLD && new Date(entry.date) > new Date()) {
      alerts.push({
        type: "LARGE_UPCOMING_EXPENSE",
        message: `Despesa(s) de ${formatCurrency(entry.outflow)} prevista(s) para ${formatDateBR(entry.date)}`,
        date: entry.date,
        amount: entry.outflow,
      })
    }
  }

  // 3. Overdue concentration (more than 3 overdue expenses in projection)
  let overdueCount = 0
  let overdueTotal = 0
  for (const entry of projection.entries) {
    for (const exp of entry.details.expenses) {
      if (exp.status === "OVERDUE") {
        overdueCount++
        overdueTotal += exp.amount
      }
    }
  }
  if (overdueCount >= 3) {
    alerts.push({
      type: "OVERDUE_CONCENTRATION",
      message: `${overdueCount} despesas vencidas totalizando ${formatCurrency(overdueTotal)}`,
      amount: overdueTotal,
    })
  }

  return alerts
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  return `${d}/${m}/${y}`
}
