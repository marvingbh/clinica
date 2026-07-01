import { describe, it, expect } from "vitest"
import { findMatchingRecurrence } from "./match-recurrence"

const existing = [
  { id: "r1", description: "PAGAMENTO DE TITULO - GERENCIA ADM", amount: 1299.28, frequency: "MONTHLY" as const },
  { id: "r2", description: "PAGAMENTO DE TITULO - PACTO SEGUROS", amount: 481.46, frequency: "MONTHLY" as const },
  { id: "r3", description: "PAGAMENTO DE TITULO - PACTO SEGUROS", amount: 528.86, frequency: "MONTHLY" as const },
]

describe("findMatchingRecurrence", () => {
  it("matches on normalized description + amount + frequency", () => {
    const match = findMatchingRecurrence(
      { description: "Pagamento de titulo - gerencia adm", amount: 1299.28, frequency: "MONTHLY" },
      existing
    )
    expect(match?.id).toBe("r1")
  })

  it("keeps distinct amounts apart (same supplier, different obligations)", () => {
    const match = findMatchingRecurrence(
      { description: "PAGAMENTO DE TITULO - PACTO SEGUROS", amount: 528.86, frequency: "MONTHLY" },
      existing
    )
    expect(match?.id).toBe("r3")
  })

  it("does not match a different frequency", () => {
    const match = findMatchingRecurrence(
      { description: "PAGAMENTO DE TITULO - GERENCIA ADM", amount: 1299.28, frequency: "YEARLY" },
      existing
    )
    expect(match).toBeNull()
  })

  it("returns null when nothing matches", () => {
    const match = findMatchingRecurrence(
      { description: "ALUGUEL SALA 3", amount: 5000, frequency: "MONTHLY" },
      existing
    )
    expect(match).toBeNull()
  })

  it("tolerates tiny float differences in amount", () => {
    const match = findMatchingRecurrence(
      { description: "PAGAMENTO DE TITULO - GERENCIA ADM", amount: 1299.284, frequency: "MONTHLY" },
      existing
    )
    expect(match?.id).toBe("r1")
  })
})
