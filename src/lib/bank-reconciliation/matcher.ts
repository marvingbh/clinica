import {
  TransactionForMatching,
  InvoiceForMatching,
  MatchResult,
  MatchCandidate,
  MatchConfidence,
} from "./types"

const VALID_STATUSES = ["PENDENTE", "ENVIADO", "PAGO", "PARCIAL"]

export interface InvoiceWithParent extends InvoiceForMatching {
  normalizedMother: string
  normalizedFather: string
}

/**
 * Normalize a string for comparison: lowercase, remove accents, collapse whitespace.
 */
export function normalizeForComparison(str: string | null | undefined): string {
  if (!str) return ""
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
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

/**
 * Check if the payer name contains the patient's surname (last word of name).
 * Returns true if the surname appears anywhere in the payer name.
 */
export function surnameMatches(payerName: string, patientName: string): boolean {
  const normalizedPayer = normalizeForComparison(payerName)
  const normalizedPatient = normalizeForComparison(patientName)
  if (!normalizedPayer || !normalizedPatient) return false

  const patientWords = normalizedPatient.split(" ")
  if (patientWords.length < 2) return false

  const surname = patientWords[patientWords.length - 1]
  // Ignore very short surnames (e.g., "da", "de", "dos") — use second-to-last if available
  const effectiveSurname = surname.length <= 3 && patientWords.length > 2
    ? patientWords[patientWords.length - 2]
    : surname

  return normalizedPayer.split(" ").includes(effectiveSurname)
}

/**
 * Check if all significant words (length > 2) of a name appear in the payer name.
 * Useful for short parent names like "Diego" matching "DIEGO CARLOS VERNASCHI DA SILVA".
 */
export function nameContainedIn(name: string, payerName: string): boolean {
  const nameWords = normalizeForComparison(name).split(" ").filter(w => w.length > 2)
  const payerWords = normalizeForComparison(payerName).split(" ")
  if (nameWords.length === 0) return false
  return nameWords.every(w => payerWords.includes(w))
}

/**
 * Find the shared parent name between two invoices (by normalized mother/father).
 */
export function getSharedParent(a: InvoiceWithParent, b: InvoiceWithParent): string | null {
  if (a.normalizedMother && a.normalizedMother === b.normalizedMother) return a.motherName
  if (a.normalizedFather && a.normalizedFather === b.normalizedFather) return a.fatherName
  if (a.normalizedMother && a.normalizedMother === b.normalizedFather) return a.motherName
  if (a.normalizedFather && a.normalizedFather === b.normalizedMother) return a.fatherName
  return null
}

/**
 * Find pairs of invoices from the same family that sum to the transaction amount.
 */
export function findGroupCandidates(
  txAmount: number,
  txPayerName: string | null,
  allInvoices: InvoiceWithParent[]
): Array<{ invoices: InvoiceWithParent[]; sharedParent: string | null }> {
  const groups: Array<{ invoices: InvoiceWithParent[]; sharedParent: string | null }> = []

  const payerWords = txPayerName
    ? normalizeForComparison(txPayerName).split(" ").filter(w => w.length > 2)
    : []

  for (let i = 0; i < allInvoices.length; i++) {
    for (let j = i + 1; j < allInvoices.length; j++) {
      const a = allInvoices[i]
      const b = allInvoices[j]
      if (Math.abs(a.remainingAmount + b.remainingAmount - txAmount) >= 0.01) continue

      const shared = getSharedParent(a, b)
      if (!shared) continue

      if (payerWords.length > 0) {
        const parentWords = normalizeForComparison(shared).split(" ").filter(w => w.length > 2)
        const hasOverlap = parentWords.some(w => payerWords.includes(w))
        if (!hasOverlap) continue
      }

      groups.push({ invoices: [a, b], sharedParent: shared })
    }
  }

  return groups
}

/**
 * Find groups of per-session invoices from the same patient that sum to the transaction amount.
 * Only groups invoices that share the same patientId.
 */
export function findSamePatientGroups(
  txAmount: number,
  txPayerName: string | null,
  invoices: InvoiceWithParent[]
): Array<{ invoices: InvoiceWithParent[]; sharedParent: string | null }> {
  const groups: Array<{ invoices: InvoiceWithParent[]; sharedParent: string | null }> = []

  const payerWords = txPayerName
    ? normalizeForComparison(txPayerName).split(" ").filter(w => w.length > 2)
    : []

  // Group invoices by patientId
  const byPatient = new Map<string, InvoiceWithParent[]>()
  for (const inv of invoices) {
    const existing = byPatient.get(inv.patientId) ?? []
    existing.push(inv)
    byPatient.set(inv.patientId, existing)
  }

  for (const [, patientInvoices] of byPatient) {
    if (patientInvoices.length < 2) continue

    const matchingGroups: InvoiceWithParent[][] = []

    // Check if ALL invoices for this patient sum to txAmount
    const totalSum = patientInvoices.reduce((s, inv) => s + inv.remainingAmount, 0)
    if (Math.abs(totalSum - txAmount) < 0.01) {
      matchingGroups.push(patientInvoices)
    } else {
      // Try greedy subset: sort by remainingAmount desc, accumulate until match
      const sorted = [...patientInvoices].sort((a, b) => b.remainingAmount - a.remainingAmount)
      const subset: InvoiceWithParent[] = []
      let runningSum = 0
      for (const inv of sorted) {
        if (runningSum + inv.remainingAmount > txAmount + 0.01) continue
        subset.push(inv)
        runningSum += inv.remainingAmount
        if (Math.abs(runningSum - txAmount) < 0.01) break
      }
      if (subset.length >= 2 && Math.abs(runningSum - txAmount) < 0.01) {
        matchingGroups.push(subset)
      }
    }

    for (const group of matchingGroups) {
      // Determine shared parent from first invoice (all same patient, so same parents)
      const first = group[0]
      const sharedParent = first.normalizedMother
        ? first.motherName
        : first.normalizedFather
          ? first.fatherName
          : null

      // If payer name provided, verify overlap with a parent name
      if (payerWords.length > 0 && sharedParent) {
        const parentWords = normalizeForComparison(sharedParent).split(" ").filter(w => w.length > 2)
        const hasOverlap = parentWords.some(w => payerWords.includes(w))
        if (!hasOverlap) continue
      } else if (payerWords.length > 0 && !sharedParent) {
        continue
      }

      groups.push({ invoices: group, sharedParent })
    }
  }

  return groups
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
  invoices: InvoiceForMatching[],
  usualPayersMap?: Map<string, Set<string>>
): MatchResult[] {
  const eligibleInvoices = invoices.filter(inv => VALID_STATUSES.includes(inv.status))

  return transactions.map(transaction => {
    const amountMatches = eligibleInvoices.filter(
      inv => Math.abs(inv.remainingAmount - transaction.amount) < 0.01
    )

    const candidates: MatchCandidate[] = amountMatches.map(invoice => {
      // Check usual payers first (highest priority)
      if (transaction.payerName && usualPayersMap) {
        const normalizedPayer = normalizeForComparison(transaction.payerName)
        const patientIds = usualPayersMap.get(normalizedPayer)
        if (patientIds?.has(invoice.patientId)) {
          return {
            invoice,
            confidence: "KNOWN" as MatchConfidence,
            nameScore: 2,
            matchedField: "usualPayer",
          }
        }
      }

      if (!transaction.payerName) {
        return {
          invoice,
          confidence: "LOW" as MatchConfidence,
          nameScore: 0,
          matchedField: null,
        }
      }

      const payer = transaction.payerName!

      // Combined signal: if payer shares words with BOTH a parent name AND the patient
      // name (via different words), it's a strong match → HIGH confidence
      const payerWords = normalizeForComparison(payer).split(" ").filter(w => w.length > 2)
      const motherWords = normalizeForComparison(invoice.motherName).split(" ").filter(w => w.length > 2)
      const fatherWords = normalizeForComparison(invoice.fatherName).split(" ").filter(w => w.length > 2)
      const parentWords = [...motherWords, ...fatherWords]
      const patientWords = normalizeForComparison(invoice.patientName).split(" ").filter(w => w.length > 2)

      const parentOverlap = parentWords.some(w => payerWords.includes(w))
      const patientUniqueOverlap = patientWords.some(w => payerWords.includes(w) && !parentWords.includes(w))

      if (parentOverlap && patientUniqueOverlap) {
        const motherMatch = motherWords.some(w => payerWords.includes(w))
        return {
          invoice,
          confidence: "HIGH" as MatchConfidence,
          nameScore: 1,
          matchedField: motherMatch ? "motherName" : "fatherName",
        }
      }

      // Individual field scoring
      const fieldNames: Array<{ field: string; name: string }> = [
        { field: "motherName", name: invoice.motherName ?? "" },
        { field: "fatherName", name: invoice.fatherName ?? "" },
        { field: "patientName", name: invoice.patientName },
      ]

      const scores = fieldNames.map(({ field, name }) => {
        let score = nameSimilarity(payer, name)
        // Boost short parent names fully contained in payer name (e.g. "Diego" in "DIEGO CARLOS...")
        if (score < 0.5 && name && nameContainedIn(name, payer)) {
          score = Math.max(score, 0.6)
        }
        return { field, score }
      })

      const best = scores.reduce((a, b) => (b.score > a.score ? b : a))

      // If no strong name match, check if patient surname appears in payer name
      if (best.score < 0.5 && surnameMatches(payer, invoice.patientName)) {
        return {
          invoice,
          confidence: "MEDIUM" as MatchConfidence,
          nameScore: 0.5,
          matchedField: "patientSurname",
        }
      }

      const confidence = getConfidence(best.score)

      return {
        invoice,
        confidence,
        nameScore: best.score,
        matchedField: best.score > 0 ? best.field : null,
      }
    })

    const order: Record<MatchConfidence, number> = { KNOWN: -1, HIGH: 0, MEDIUM: 1, LOW: 2 }
    candidates.sort((a, b) => {
      const diff = order[a.confidence] - order[b.confidence]
      if (diff !== 0) return diff
      return b.nameScore - a.nameScore
    })

    return { transaction, candidates }
  })
}
