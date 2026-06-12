import { describe, it, expect } from "vitest"
import { computeOpenBalance } from "./open-balance"

describe("computeOpenBalance", () => {
  it("returns the full total when there are no links", () => {
    expect(computeOpenBalance(300, [])).toBe(300)
  })

  it("subtracts a partial payment", () => {
    expect(computeOpenBalance(300, [100])).toBe(200)
    expect(computeOpenBalance(300, [100, 50])).toBe(150)
  })

  it("returns 0 when fully paid", () => {
    expect(computeOpenBalance(300, [300])).toBe(0)
    expect(computeOpenBalance(300, [150, 150])).toBe(0)
  })

  it("clamps overpayment to 0", () => {
    expect(computeOpenBalance(300, [400])).toBe(0)
    expect(computeOpenBalance(300, [200, 200])).toBe(0)
  })

  it("rounds to 2 decimal places", () => {
    expect(computeOpenBalance(100, [33.33, 33.33])).toBe(33.34)
    expect(computeOpenBalance(0.3, [0.1, 0.1])).toBe(0.1)
  })
})
