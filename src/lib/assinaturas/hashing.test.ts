import { describe, it, expect } from "vitest"
import { sha256Hex, hashesMatch } from "./hashing"

describe("hashing", () => {
  it("computes sha256 of a known vector", () => {
    // sha256("abc")
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })

  it("computes sha256 of empty input", () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
  })

  it("matches hashes case-insensitively and ignoring surrounding space", () => {
    expect(hashesMatch("ABCD", "abcd")).toBe(true)
    expect(hashesMatch(" abcd ", "ABCD")).toBe(true)
    expect(hashesMatch("abcd", "abce")).toBe(false)
  })
})
