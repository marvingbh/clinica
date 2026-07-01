import type { ExpenseFrequency } from "@prisma/client"
import { normalizeDescription } from "@/lib/expense-matcher"

export interface RecurrenceCandidate {
  description: string
  amount: number
  frequency: ExpenseFrequency
}

export interface ExistingRecurrence {
  id: string
  description: string
  amount: number
  frequency: ExpenseFrequency
}

/**
 * Find an existing active recurrence that represents the same recurring payment as `candidate`,
 * so callers can reuse it instead of creating a duplicate template.
 *
 * Matches on normalized description + exact amount + frequency. The amount check keeps genuinely
 * distinct obligations apart (e.g. two policies from the same supplier at R$481,46 vs R$528,86).
 * Returns the first match, or null when none exists.
 */
export function findMatchingRecurrence(
  candidate: RecurrenceCandidate,
  existing: ExistingRecurrence[]
): ExistingRecurrence | null {
  const normalized = normalizeDescription(candidate.description)

  return (
    existing.find(
      (r) =>
        r.frequency === candidate.frequency &&
        Math.abs(r.amount - candidate.amount) < 0.01 &&
        normalizeDescription(r.description) === normalized
    ) ?? null
  )
}
