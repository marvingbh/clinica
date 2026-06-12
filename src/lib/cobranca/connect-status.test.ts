import { describe, it, expect } from "vitest"
import { deriveConnectStatus } from "./connect-status"

describe("deriveConnectStatus", () => {
  it("returns ACTIVE when charges are enabled", () => {
    expect(deriveConnectStatus({ charges_enabled: true, details_submitted: true })).toBe("ACTIVE")
    // charges_enabled wins even if details_submitted somehow false
    expect(deriveConnectStatus({ charges_enabled: true, details_submitted: false })).toBe("ACTIVE")
  })

  it("returns RESTRICTED when details submitted but charges disabled", () => {
    expect(deriveConnectStatus({ charges_enabled: false, details_submitted: true })).toBe(
      "RESTRICTED"
    )
  })

  it("returns ONBOARDING when nothing submitted", () => {
    expect(deriveConnectStatus({ charges_enabled: false, details_submitted: false })).toBe(
      "ONBOARDING"
    )
  })
})
