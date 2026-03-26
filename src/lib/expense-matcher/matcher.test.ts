import { describe, it, expect } from "vitest"
import { suggestCategory } from "./matcher"
import type { StoredPattern } from "./types"

describe("suggestCategory", () => {
  const patterns: StoredPattern[] = [
    { normalizedDescription: "copel energia", categoryId: "cat-energy", categoryName: "Energia", supplierName: "COPEL", matchCount: 5 },
    { normalizedDescription: "net virtua", categoryId: "cat-internet", categoryName: "Internet", supplierName: "NET", matchCount: 2 },
    { normalizedDescription: "aluguel escritorio", categoryId: "cat-rent", categoryName: "Aluguel", supplierName: "Imobiliária", matchCount: 1 },
  ]

  it("returns exact match with HIGH confidence for 5+ matches", () => {
    const result = suggestCategory("PIX ENVIO COPEL ENERGIA 123456", patterns)
    expect(result).not.toBeNull()
    expect(result!.categoryId).toBe("cat-energy")
    expect(result!.supplierName).toBe("COPEL")
    expect(result!.confidence).toBe("HIGH")
  })

  it("returns exact match with MEDIUM confidence for 2 matches", () => {
    const result = suggestCategory("TED ENVIADA NET VIRTUA", patterns)
    expect(result).not.toBeNull()
    expect(result!.categoryId).toBe("cat-internet")
    expect(result!.confidence).toBe("MEDIUM")
  })

  it("returns exact match with LOW confidence for 1 match", () => {
    const result = suggestCategory("PGTO ALUGUEL ESCRITORIO", patterns)
    expect(result).not.toBeNull()
    expect(result!.categoryId).toBe("cat-rent")
    expect(result!.confidence).toBe("LOW")
  })

  it("returns substring match when no exact match", () => {
    // "copel energia" is contained in the normalized form "copel energia paranaense"
    const result = suggestCategory("PIX COPEL ENERGIA PARANAENSE", patterns)
    expect(result).not.toBeNull()
    expect(result!.categoryId).toBe("cat-energy")
    expect(result!.confidence).toBe("LOW") // Substring matches are always LOW
  })

  it("returns null when no patterns match", () => {
    const result = suggestCategory("BANCO DO BRASIL TAXA MENSAL", patterns)
    expect(result).toBeNull()
  })

  it("returns null for empty patterns list", () => {
    const result = suggestCategory("COPEL ENERGIA", [])
    expect(result).toBeNull()
  })
})
