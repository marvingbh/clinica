import { supplierKey } from "./supplier-key"

export interface ReconcileCandidate {
  amount: number
  date: Date
  description: string
}

export interface OpenExpenseForReconcile {
  id: string
  amount: number
  dueDate: Date
  recurrenceId: string | null
  description: string
}

export interface ReconcileMatch {
  expense: OpenExpenseForReconcile
  /**
   * True when the imported transaction amount should overwrite the expense amount.
   * The imported transaction is the source of truth — for a variable bill (e.g. a utility
   * whose amount changes monthly) the recurrence's estimated amount is just a placeholder.
   */
  adoptAmount: boolean
}

/**
 * When the user imports a bank transaction and would create it as an "avulsa" expense, an
 * OPEN/OVERDUE expense for the same payment often already exists (generated from a recurrence).
 * This finds the best existing expense to reconcile against instead of creating a duplicate.
 *
 * Matching is by supplier (normalized description) within `windowDays` of the transaction:
 *  - If an expense with the exact amount exists, reconcile to it (keep its amount). This keeps
 *    distinct fixed obligations from the same supplier apart (e.g. two insurance policies).
 *  - Otherwise, if there is exactly ONE candidate for that supplier in the window, reconcile to
 *    it and adopt the imported amount (the variable-bill case). Ambiguous (2+ non-exact
 *    candidates) → no match, so the caller creates a fresh avulsa.
 *
 * `openExpenses` must already be scoped to the caller's clinic and to OPEN/OVERDUE status.
 */
export function findReconcilableExpense(
  candidate: ReconcileCandidate,
  openExpenses: OpenExpenseForReconcile[],
  windowDays = 15
): ReconcileMatch | null {
  const txTime = candidate.date.getTime()
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  const key = supplierKey(candidate.description)

  const sameSupplier = openExpenses.filter(
    (e) => supplierKey(e.description) === key && Math.abs(e.dueDate.getTime() - txTime) <= windowMs
  )
  if (sameSupplier.length === 0) return null

  // Prefer an exact amount match; among those prefer recurring, then closest due date.
  const exact = sameSupplier
    .filter((e) => Math.abs(e.amount - candidate.amount) < 0.01)
    .sort((a, b) => {
      const recDiff = Number(!!b.recurrenceId) - Number(!!a.recurrenceId)
      if (recDiff !== 0) return recDiff
      return Math.abs(a.dueDate.getTime() - txTime) - Math.abs(b.dueDate.getTime() - txTime)
    })[0]
  if (exact) return { expense: exact, adoptAmount: false }

  // No exact amount: only reconcile when there is a single unambiguous candidate — then the
  // imported transaction wins and its amount is adopted (variable bill).
  if (sameSupplier.length === 1) return { expense: sameSupplier[0], adoptAmount: true }

  return null
}
