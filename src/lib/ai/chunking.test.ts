import { describe, it, expect } from "vitest"
import { truncateInput, MAX_INPUT_CHARS } from "./chunking"

describe("truncateInput", () => {
  it("leaves text below the limit intact", () => {
    const r = truncateInput("texto curto")
    expect(r.text).toBe("texto curto")
    expect(r.truncated).toBe(false)
  })

  it("truncates above the limit and flags truncated", () => {
    const long = "palavra ".repeat(5000) // ~40k chars
    const r = truncateInput(long)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(MAX_INPUT_CHARS)
  })

  it("cuts on a word boundary (no partial trailing word)", () => {
    const r = truncateInput("aaaa bbbb cccc dddd", 11)
    // 11 chars = "aaaa bbbb c"; back up to last whole word → "aaaa bbbb".
    expect(r.text).toBe("aaaa bbbb")
    expect(r.truncated).toBe(true)
  })

  it("never cuts a token [CPF_1] in half", () => {
    // Put a token right at the boundary.
    const text = "abc abc [CPF_1] resto resto"
    // Limit lands inside the token.
    const r = truncateInput(text, 12) // "abc abc [CPF"
    expect(r.text).not.toContain("[CPF")
    expect(r.truncated).toBe(true)
  })

  it("respects a custom limit", () => {
    const r = truncateInput("123456789", 5)
    expect(r.text.length).toBeLessThanOrEqual(5)
    expect(r.truncated).toBe(true)
  })
})
