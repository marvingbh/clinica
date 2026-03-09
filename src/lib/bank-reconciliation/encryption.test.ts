import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("encryption", () => {
  const TEST_KEY = "a".repeat(64) // 32 bytes hex

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("encrypts and decrypts a string roundtrip", async () => {
    const { encrypt, decrypt } = await import("./encryption")
    const plaintext = "my-secret-value"
    const encrypted = encrypt(plaintext)
    expect(encrypted).not.toBe(plaintext)
    expect(encrypted).toContain(":") // iv:authTag:ciphertext format
    const decrypted = decrypt(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it("produces different ciphertext for same input (random IV)", async () => {
    const { encrypt } = await import("./encryption")
    const a = encrypt("same")
    const b = encrypt("same")
    expect(a).not.toBe(b)
  })

  it("throws on tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("./encryption")
    const encrypted = encrypt("secret")
    const parts = encrypted.split(":")
    parts[2] = "ff" + parts[2].slice(2) // tamper ciphertext
    expect(() => decrypt(parts.join(":"))).toThrow()
  })

  it("encrypts multiline PEM content", async () => {
    const { encrypt, decrypt } = await import("./encryption")
    const pem = "-----BEGIN CERTIFICATE-----\nMIIBxx...\n-----END CERTIFICATE-----"
    const encrypted = encrypt(pem)
    expect(decrypt(encrypted)).toBe(pem)
  })
})
