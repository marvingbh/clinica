import { normalizeDescription } from "@/lib/expense-matcher"
import type { StoredPattern } from "@/lib/expense-matcher"

interface OpenExpense {
  id: string
  amount: number
  dueDate: Date
  description: string
  recurrenceId: string | null
  status: string
}

interface DebitTransaction {
  id: string
  amount: number
  date: Date
  description: string
}

export interface AutoReconcileMatch {
  transactionId: string
  expenseId: string
  amount: number
  confidence: "auto" | "suggested"
  reason: string
}

/**
 * Find auto-reconcile matches between DEBIT transactions and open expenses.
 *
 * Auto-match requires:
 * 1. Exact amount match
 * 2. Known pattern linked to the same recurrence as the expense
 *
 * Suggested match requires:
 * 1. Exact amount match
 * 2. Transaction date near expense due date (±15 days)
 */
export function findAutoReconcileMatches(
  transactions: DebitTransaction[],
  openExpenses: OpenExpense[],
  patterns: (StoredPattern & { recurrenceId?: string | null })[]
): AutoReconcileMatch[] {
  const matches: AutoReconcileMatch[] = []
  const matchedExpenseIds = new Set<string>()
  const matchedTxIds = new Set<string>()

  // Build pattern lookup: normalizedDescription → pattern
  const patternMap = new Map<string, (typeof patterns)[number]>()
  for (const p of patterns) {
    patternMap.set(p.normalizedDescription, p)
  }

  for (const tx of transactions) {
    if (matchedTxIds.has(tx.id)) continue

    const normalized = normalizeDescription(tx.description)
    const pattern = patternMap.get(normalized)

    // Find expenses with exact amount match
    const amountMatches = openExpenses.filter(
      (e) =>
        !matchedExpenseIds.has(e.id) &&
        Math.abs(e.amount - tx.amount) < 0.01 &&
        (e.status === "OPEN" || e.status === "OVERDUE")
    )

    if (amountMatches.length === 0) continue

    // Try auto-match: pattern with recurrenceId matching expense's recurrenceId
    if (pattern?.recurrenceId) {
      const recurrenceMatch = amountMatches.find(
        (e) => e.recurrenceId === pattern.recurrenceId
      )
      if (recurrenceMatch) {
        matches.push({
          transactionId: tx.id,
          expenseId: recurrenceMatch.id,
          amount: tx.amount,
          confidence: "auto",
          reason: `Padrão conhecido: "${pattern.supplierName || normalized}" (${pattern.matchCount}x)`,
        })
        matchedExpenseIds.add(recurrenceMatch.id)
        matchedTxIds.add(tx.id)
        continue
      }
    }

    // Try suggested match: amount + date proximity
    const txDate = tx.date.getTime()
    const dateMatches = amountMatches
      .filter((e) => {
        const daysDiff = Math.abs(e.dueDate.getTime() - txDate) / (1000 * 60 * 60 * 24)
        return daysDiff <= 15
      })
      .sort((a, b) => {
        // Prefer closest due date
        const diffA = Math.abs(a.dueDate.getTime() - txDate)
        const diffB = Math.abs(b.dueDate.getTime() - txDate)
        return diffA - diffB
      })

    if (dateMatches.length > 0) {
      matches.push({
        transactionId: tx.id,
        expenseId: dateMatches[0].id,
        amount: tx.amount,
        confidence: "suggested",
        reason: `Valor igual + data próxima (${dateMatches[0].description})`,
      })
      matchedExpenseIds.add(dateMatches[0].id)
      matchedTxIds.add(tx.id)
    }
  }

  return matches
}
