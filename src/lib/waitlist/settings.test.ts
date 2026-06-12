import { describe, it, expect } from "vitest"
import { resolveWaitlistSettings, DEFAULT_WAITLIST_SETTINGS } from "./settings"

describe("resolveWaitlistSettings", () => {
  it("returns defaults for empty object", () => {
    expect(resolveWaitlistSettings({})).toEqual(DEFAULT_WAITLIST_SETTINGS)
  })

  it("returns defaults for null/undefined", () => {
    expect(resolveWaitlistSettings(null)).toEqual(DEFAULT_WAITLIST_SETTINGS)
    expect(resolveWaitlistSettings(undefined)).toEqual(DEFAULT_WAITLIST_SETTINGS)
  })

  it("defaults are TRIAGEM, SEQUENCIAL, 2h hold, 3h minNotice", () => {
    expect(DEFAULT_WAITLIST_SETTINGS).toEqual({
      mode: "TRIAGEM",
      strategy: "SEQUENCIAL",
      holdHours: 2,
      minNoticeHours: 3,
    })
  })

  it("merges a partial object with defaults", () => {
    const result = resolveWaitlistSettings({ mode: "OFERTA_AUTOMATICA" })
    expect(result).toEqual({
      mode: "OFERTA_AUTOMATICA",
      strategy: "SEQUENCIAL",
      holdHours: 2,
      minNoticeHours: 3,
    })
  })

  it("accepts a full valid object", () => {
    const result = resolveWaitlistSettings({
      mode: "OFERTA_AUTOMATICA",
      strategy: "BROADCAST",
      holdHours: 4,
      minNoticeHours: 6,
    })
    expect(result).toEqual({
      mode: "OFERTA_AUTOMATICA",
      strategy: "BROADCAST",
      holdHours: 4,
      minNoticeHours: 6,
    })
  })

  it("coerces invalid individual values back to default", () => {
    const result = resolveWaitlistSettings({
      mode: "BOGUS",
      strategy: "WHATEVER",
      holdHours: -5,
      minNoticeHours: 9999,
    })
    expect(result).toEqual(DEFAULT_WAITLIST_SETTINGS)
  })

  it("returns defaults for non-object input", () => {
    expect(resolveWaitlistSettings("nope")).toEqual(DEFAULT_WAITLIST_SETTINGS)
    expect(resolveWaitlistSettings(42)).toEqual(DEFAULT_WAITLIST_SETTINGS)
  })
})
