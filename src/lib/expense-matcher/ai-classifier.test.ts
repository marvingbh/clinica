import { describe, it, expect, vi } from "vitest"
import { classifyTransaction } from "./ai-classifier"
import type { StoredPattern } from "./types"

// Mock the Anthropic SDK module
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(),
}))

describe("classifyTransaction", () => {
  const categories = [
    { id: "cat-energy", name: "Energia" },
    { id: "cat-rent", name: "Aluguel" },
  ]

  const patterns: StoredPattern[] = [
    { normalizedDescription: "copel energia", categoryId: "cat-energy", categoryName: "Energia", supplierName: "COPEL", matchCount: 5 },
  ]

  it("returns HIGH confidence pattern match without calling AI", async () => {
    const result = await classifyTransaction(
      "PIX ENVIO COPEL ENERGIA 123456",
      categories,
      patterns,
      { apiKey: undefined }
    )

    expect(result.source).toBe("pattern")
    expect(result.confidence).toBe(0.95)
    expect(result.categoryId).toBe("cat-energy")
    expect(result.supplierName).toBe("COPEL")
  })

  it("falls back to unknown when no API key and no pattern match", async () => {
    const result = await classifyTransaction(
      "TAXA BANCARIA MENSAL",
      categories,
      [],
      { apiKey: undefined }
    )

    expect(result.source).toBe("pattern")
    expect(result.confidence).toBe(0)
    expect(result.categoryId).toBeNull()
  })

  it("returns pattern match fallback when no API key but partial match exists", async () => {
    const lowPatterns: StoredPattern[] = [
      { normalizedDescription: "copel energia", categoryId: "cat-energy", categoryName: "Energia", supplierName: "COPEL", matchCount: 2 },
    ]

    const result = await classifyTransaction(
      "PIX COPEL ENERGIA",
      categories,
      lowPatterns,
      { apiKey: undefined }
    )

    // matchCount=2 → MEDIUM confidence in pattern matcher, but HIGH confidence pattern match
    // Actually copel energia is exact match with matchCount=2 → MEDIUM confidence
    // But it's still a direct pattern match, not AI
    expect(result.source).toBe("pattern")
    expect(result.categoryId).toBe("cat-energy")
  })
})
