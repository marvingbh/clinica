export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW"

export interface MatchSuggestion {
  categoryId: string | null
  categoryName: string | null
  supplierName: string | null
  confidence: MatchConfidence
  matchCount: number
}

export interface StoredPattern {
  normalizedDescription: string
  categoryId: string | null
  categoryName?: string | null
  supplierName: string | null
  matchCount: number
}
