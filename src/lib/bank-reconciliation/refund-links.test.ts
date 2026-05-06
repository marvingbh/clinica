import { describe, it, expect } from "vitest"
import {
  computeRemainingAmount,
  isTransactionFullyResolved,
  sumAmounts,
  rankRefundCandidates,
} from "./refund-links"

describe("computeRemainingAmount", () => {
  it("returns the full amount when nothing is allocated", () => {
    expect(computeRemainingAmount(250, 0, 0)).toBe(250)
  })

  it("subtracts both reconciled and refunded amounts", () => {
    expect(computeRemainingAmount(250, 200, 50)).toBe(0)
  })

  it("snaps to 0 when remainder is within tolerance", () => {
    expect(computeRemainingAmount(250, 200, 49.999)).toBe(0)
  })

  it("returns positive remainder beyond tolerance", () => {
    expect(computeRemainingAmount(250, 200, 30)).toBe(20)
  })
})

describe("isTransactionFullyResolved", () => {
  it("is true when dismissed regardless of allocation", () => {
    expect(
      isTransactionFullyResolved({ amount: 100, reconciledTotal: 0, refundedTotal: 0, isDismissed: true }),
    ).toBe(true)
  })

  it("is true when fully covered by reconciled + refunded", () => {
    expect(
      isTransactionFullyResolved({ amount: 250, reconciledTotal: 200, refundedTotal: 50, isDismissed: false }),
    ).toBe(true)
  })

  it("is false when still has remainder beyond tolerance", () => {
    expect(
      isTransactionFullyResolved({ amount: 250, reconciledTotal: 200, refundedTotal: 0, isDismissed: false }),
    ).toBe(false)
  })
})

describe("sumAmounts", () => {
  it("sums numeric amounts", () => {
    expect(sumAmounts([{ amount: 10 }, { amount: 20.5 }])).toBe(30.5)
  })

  it("handles Decimal-like objects via toNumber()", () => {
    const decimal = (n: number) => ({ amount: { toNumber: () => n } })
    expect(sumAmounts([decimal(10), decimal(20)])).toBe(30)
  })

  it("handles string amounts", () => {
    expect(sumAmounts([{ amount: "10.50" }, { amount: "20.50" }])).toBe(31)
  })
})

describe("rankRefundCandidates", () => {
  const baseArgs = {
    remainingAmount: 50,
    sourcePayerName: "MIRELA CORREIA LIMA CAVALCANTE",
    relatedNames: ["Mirela Correia"],
    sourceDate: new Date("2026-05-06"),
  }

  it("ranks an exact-amount + same-name candidate at the top", () => {
    const ranked = rankRefundCandidates({
      ...baseArgs,
      candidates: [
        {
          id: "spam",
          amount: 200,
          date: new Date("2026-05-01"),
          payerName: "FORNECEDOR DE LIMPEZA SA",
          description: null,
        },
        {
          id: "match",
          amount: 50,
          date: new Date("2026-05-07"),
          payerName: "MIRELA CORREIA LIMA CAVALCANTE",
          description: null,
        },
      ],
    })

    expect(ranked[0].id).toBe("match")
    expect(ranked[0].reasons).toEqual(expect.arrayContaining(["Valor exato"]))
  })

  it("includes 'Nome idêntico' when the candidate's payer matches", () => {
    const ranked = rankRefundCandidates({
      ...baseArgs,
      candidates: [
        {
          id: "match",
          amount: 50,
          date: new Date("2026-05-07"),
          payerName: "MIRELA CORREIA LIMA CAVALCANTE",
          description: null,
        },
      ],
    })
    expect(ranked[0].reasons).toEqual(
      expect.arrayContaining(["Valor exato", "Nome idêntico", "Data próxima"]),
    )
  })

  it("scores out-of-window candidates with date=0 but still ranks them", () => {
    const ranked = rankRefundCandidates({
      ...baseArgs,
      windowDays: 3, // Tight window
      candidates: [
        {
          id: "stale",
          amount: 50,
          date: new Date("2026-04-01"), // ~5 weeks old
          payerName: "MIRELA",
          description: null,
        },
      ],
    })
    // Still has amount + name signal, so above the 0.1 threshold.
    expect(ranked[0].id).toBe("stale")
  })

  it("returns ranked entries sorted desc by score", () => {
    const ranked = rankRefundCandidates({
      ...baseArgs,
      candidates: [
        { id: "weak", amount: 80, date: new Date("2026-05-06"), payerName: "outro", description: null },
        { id: "strong", amount: 50, date: new Date("2026-05-06"), payerName: "MIRELA", description: null },
      ],
    })
    expect(ranked[0].id).toBe("strong")
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })

  it("drops near-zero-score entries when at least one match has signal", () => {
    const ranked = rankRefundCandidates({
      ...baseArgs,
      candidates: [
        { id: "noise", amount: 9999, date: new Date("2026-04-01"), payerName: "ZZZ COMPLETELY UNRELATED", description: null },
        { id: "good", amount: 50, date: new Date("2026-05-06"), payerName: "MIRELA", description: null },
      ],
      windowDays: 14,
    })
    expect(ranked.find((r) => r.id === "noise")).toBeUndefined()
    expect(ranked[0].id).toBe("good")
  })

  it("falls back to top 5 even when nothing scores ≥ 0.1 (gives operator something to look at)", () => {
    const ranked = rankRefundCandidates({
      ...baseArgs,
      windowDays: 1,
      candidates: [
        { id: "a", amount: 9999, date: new Date("2025-01-01"), payerName: "ZZZ", description: null },
        { id: "b", amount: 8888, date: new Date("2025-01-02"), payerName: "YYY", description: null },
      ],
    })
    expect(ranked.length).toBeGreaterThan(0)
  })
})
