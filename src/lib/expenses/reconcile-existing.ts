export interface ReconcileCandidate {
  amount: number
  date: Date
}

export interface OpenExpenseForReconcile {
  id: string
  amount: number
  dueDate: Date
  recurrenceId: string | null
}

/**
 * When the user imports a bank transaction and creates it as an "avulsa" expense, an OPEN/OVERDUE
 * expense for the same payment may already exist (typically generated from a recurrence). This
 * finds the best existing expense to reconcile against instead of creating a duplicate.
 *
 * Requires an exact amount match (within R$0,01) and a due date within `windowDays` of the
 * transaction (default 15). Prefers a recurring expense, then the closest due date.
 * Returns the chosen expense, or null when nothing matches.
 *
 * `openExpenses` must already be scoped to the caller's clinic and to OPEN/OVERDUE status.
 */
export function findReconcilableExpense(
  candidate: ReconcileCandidate,
  openExpenses: OpenExpenseForReconcile[],
  windowDays = 15
): OpenExpenseForReconcile | null {
  const txTime = candidate.date.getTime()
  const windowMs = windowDays * 24 * 60 * 60 * 1000

  const matches = openExpenses
    .filter(
      (e) =>
        Math.abs(e.amount - candidate.amount) < 0.01 &&
        Math.abs(e.dueDate.getTime() - txTime) <= windowMs
    )
    .sort((a, b) => {
      // Prefer recurring expenses (the duplication the user reported), then closest due date.
      const recDiff = Number(!!b.recurrenceId) - Number(!!a.recurrenceId)
      if (recDiff !== 0) return recDiff
      return Math.abs(a.dueDate.getTime() - txTime) - Math.abs(b.dueDate.getTime() - txTime)
    })

  return matches[0] ?? null
}
