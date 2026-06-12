import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { signOAuthState, verifyOAuthState, buildGoogleAuthUrl } from "./oauth"

describe("oauth state", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-secret-key")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("signs and verifies a round-trip", () => {
    const state = signOAuthState("user-1", "clinic-1", Date.now())
    const result = verifyOAuthState(state)
    expect(result.valid).toBe(true)
    expect(result.userId).toBe("user-1")
    expect(result.clinicId).toBe("clinic-1")
  })

  it("rejects a tampered state", () => {
    const state = signOAuthState("user-1", "clinic-1", Date.now())
    const [payload, sig] = state.split(".")
    const tampered = `${payload}.${"f".repeat(sig.length)}`
    expect(verifyOAuthState(tampered).valid).toBe(false)
  })

  it("rejects a state with mismatched payload", () => {
    const state = signOAuthState("user-1", "clinic-1", Date.now())
    const [, sig] = state.split(".")
    const otherPayload = Buffer.from(
      JSON.stringify({ userId: "evil", clinicId: "evil", issuedAt: Date.now() })
    ).toString("base64url")
    expect(verifyOAuthState(`${otherPayload}.${sig}`).valid).toBe(false)
  })

  it("rejects an expired state (older than 10 min)", () => {
    const issuedAt = Date.now()
    const state = signOAuthState("user-1", "clinic-1", issuedAt)
    vi.setSystemTime(new Date("2026-06-15T12:11:00Z")) // +11 min
    expect(verifyOAuthState(state).valid).toBe(false)
  })

  it("rejects malformed state", () => {
    expect(verifyOAuthState("not-a-valid-state").valid).toBe(false)
  })
})

describe("buildGoogleAuthUrl", () => {
  it("includes events scope, offline access, consent prompt and encoded state", () => {
    const url = buildGoogleAuthUrl({
      clientId: "cid",
      redirectUri: "https://app.example.com/api/calendar-sync/google/callback",
      state: "abc.def",
      includeFreeBusyScope: false,
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get("scope")).toContain("calendar.events")
    expect(parsed.searchParams.get("scope")).not.toContain("calendar.readonly")
    expect(parsed.searchParams.get("access_type")).toBe("offline")
    expect(parsed.searchParams.get("prompt")).toBe("consent")
    expect(parsed.searchParams.get("state")).toBe("abc.def")
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/calendar-sync/google/callback"
    )
  })

  it("adds the readonly (freeBusy) scope when requested", () => {
    const url = buildGoogleAuthUrl({
      clientId: "cid",
      redirectUri: "https://app.example.com/cb",
      state: "s",
      includeFreeBusyScope: true,
    })
    expect(new URL(url).searchParams.get("scope")).toContain("calendar.readonly")
  })
})
