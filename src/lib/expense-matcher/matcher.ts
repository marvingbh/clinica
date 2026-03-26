import { normalizeDescription } from "./normalize"
import type { MatchSuggestion, MatchConfidence, StoredPattern } from "./types"

/**
 * Suggest a category and supplier for a transaction description
 * based on previously stored patterns.
 */
export function suggestCategory(
  rawDescription: string,
  patterns: StoredPattern[]
): MatchSuggestion | null {
  if (patterns.length === 0) return null

  const normalized = normalizeDescription(rawDescription)
  if (!normalized) return null

  // 1. Exact match
  const exact = patterns.find((p) => p.normalizedDescription === normalized)
  if (exact) {
    return {
      categoryId: exact.categoryId,
      categoryName: exact.categoryName ?? null,
      supplierName: exact.supplierName,
      confidence: confidenceFromCount(exact.matchCount),
      matchCount: exact.matchCount,
    }
  }

  // 2. Substring match — pattern contained in description or vice versa
  let bestMatch: StoredPattern | null = null
  let bestScore = 0

  for (const pattern of patterns) {
    const pDesc = pattern.normalizedDescription
    if (normalized.includes(pDesc) || pDesc.includes(normalized)) {
      // Score by overlap length * match count
      const overlapLen = Math.min(normalized.length, pDesc.length)
      const score = overlapLen * Math.log2(pattern.matchCount + 1)
      if (score > bestScore) {
        bestScore = score
        bestMatch = pattern
      }
    }
  }

  if (bestMatch) {
    return {
      categoryId: bestMatch.categoryId,
      categoryName: bestMatch.categoryName ?? null,
      supplierName: bestMatch.supplierName,
      confidence: "LOW",
      matchCount: bestMatch.matchCount,
    }
  }

  return null
}

function confidenceFromCount(count: number): MatchConfidence {
  if (count >= 3) return "HIGH"
  if (count >= 2) return "MEDIUM"
  return "LOW"
}
