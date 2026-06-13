import { describe, it, expect } from "vitest"
import { generateKeyPairSync } from "crypto"
import { countersignHash, verifyCountersign } from "./countersign"

describe("countersign", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString()
  const hash = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

  it("signs and verifies round-trip", () => {
    const sig = countersignHash(hash, privPem)
    expect(typeof sig).toBe("string")
    expect(sig.length).toBeGreaterThan(0)
    expect(verifyCountersign(hash, sig, pubPem)).toBe(true)
  })

  it("fails verification when the hash is altered", () => {
    const sig = countersignHash(hash, privPem)
    expect(verifyCountersign(hash.replace("dead", "beef"), sig, pubPem)).toBe(false)
  })

  it("verify returns false on malformed signature instead of throwing", () => {
    expect(verifyCountersign(hash, "not-base64-sig!!", pubPem)).toBe(false)
  })
})
