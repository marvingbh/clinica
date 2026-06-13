import { describe, it, expect } from "vitest"
import {
  signVideoToken,
  buildVideoToken,
  parseVideoToken,
  verifyVideoToken,
} from "./video-tokens"

const SECRET = "test-secret"
const APPT = "clxabc123"

describe("video-tokens round-trip", () => {
  it("sign → build → parse → verify succeeds", () => {
    const token = buildVideoToken(APPT, SECRET)
    const parsed = parseVideoToken(token)
    expect(parsed).not.toBeNull()
    expect(parsed!.appointmentId).toBe(APPT)
    expect(verifyVideoToken(parsed!.appointmentId, parsed!.sig, SECRET)).toBe(true)
  })

  it("token format is `${appointmentId}.${sig}`", () => {
    const token = buildVideoToken(APPT, SECRET)
    expect(token).toBe(`${APPT}.${signVideoToken(APPT, SECRET)}`)
  })
})

describe("verifyVideoToken", () => {
  it("rejects a tampered signature", () => {
    const sig = signVideoToken(APPT, SECRET)
    const tampered = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a")
    expect(verifyVideoToken(APPT, tampered, SECRET)).toBe(false)
  })

  it("rejects a token signed for another appointment", () => {
    const sig = signVideoToken("other-appt", SECRET)
    expect(verifyVideoToken(APPT, sig, SECRET)).toBe(false)
  })

  it("rejects a signature of wrong length without throwing", () => {
    expect(verifyVideoToken(APPT, "abc", SECRET)).toBe(false)
  })
})

describe("parseVideoToken", () => {
  it("returns null for a token without a dot", () => {
    expect(parseVideoToken("noseparator")).toBeNull()
  })

  it("returns null for an empty token", () => {
    expect(parseVideoToken("")).toBeNull()
  })

  it("returns null for a token with two dots", () => {
    expect(parseVideoToken("a.b.c")).toBeNull()
  })

  it("returns null when either part is empty", () => {
    expect(parseVideoToken(".sig")).toBeNull()
    expect(parseVideoToken("appt.")).toBeNull()
  })
})

describe("token stability (RN-03)", () => {
  it("token does not depend on schedule — same id yields same token", () => {
    expect(buildVideoToken(APPT, SECRET)).toBe(buildVideoToken(APPT, SECRET))
  })
})
