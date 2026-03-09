import {
  TransactionForMatching,
  InvoiceForMatching,
  MatchResult,
  MatchCandidate,
  MatchConfidence,
} from "./types"

const VALID_STATUSES = ["PENDENTE", "ENVIADO"]

/**
 * Normalize a string for comparison: lowercase, remove accents, collapse whitespace.
 */
export function normalizeForComparison(str: string | null | undefined): string {
  if (!str) return ""
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Calculate name similarity between two strings.
 * Returns 0-1 where 1 is exact match.
 * Uses word overlap approach.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeForComparison(a)
  const nb = normalizeForComparison(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const wordsA = na.split(" ")
  const wordsB = nb.split(" ")
  const matchingWords = wordsA.filter(w => wordsB.includes(w))

  if (matchingWords.length === 0) return 0

  const maxWords = Math.max(wordsA.length, wordsB.length)
  return matchingWords.length / maxWords
}

function getConfidence(nameScore: number): MatchConfidence {
  if (nameScore >= 1) return "HIGH"
  if (nameScore >= 0.5) return "MEDIUM"
  return "LOW"
}

/**
 * Match transactions to invoices.
 * For each transaction, find invoices with matching amount,
 * then rank by name similarity (payerName vs motherName/fatherName/patientName).
 */
export function matchTransactions(
  transactions: TransactionForMatching[],
  invoices: InvoiceForMatching[]
): MatchResult[] {
  const eligibleInvoices = invoices.filter(inv => VALID_STATUSES.includes(inv.status))

  return transactions.map(transaction => {
    const amountMatches = eligibleInvoices.filter(
      inv => Math.abs(inv.totalAmount - transaction.amount) < 0.01
    )

    const candidates: MatchCandidate[] = amountMatches.map(invoice => {
      if (!transaction.payerName) {
        return {
          invoice,
          confidence: "LOW" as MatchConfidence,
          nameScore: 0,
          matchedField: null,
        }
      }

      const scores = [
        { field: "motherName", score: nameSimilarity(transaction.payerName, invoice.motherName ?? "") },
        { field: "fatherName", score: nameSimilarity(transaction.payerName, invoice.fatherName ?? "") },
        { field: "patientName", score: nameSimilarity(transaction.payerName, invoice.patientName) },
      ]

      const best = scores.reduce((a, b) => (b.score > a.score ? b : a))
      const confidence = getConfidence(best.score)

      return {
        invoice,
        confidence,
        nameScore: best.score,
        matchedField: best.score > 0 ? best.field : null,
      }
    })

    const order: Record<MatchConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    candidates.sort((a, b) => {
      const diff = order[a.confidence] - order[b.confidence]
      if (diff !== 0) return diff
      return b.nameScore - a.nameScore
    })

    return { transaction, candidates }
  })
}
