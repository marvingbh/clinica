import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getTelehealthConfig, getVideoProvider } from "./config"

const ENV_KEYS = ["TELEHEALTH_PROVIDER", "TELEHEALTH_JITSI_DOMAIN", "NODE_ENV"] as const

describe("getTelehealthConfig", () => {
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = {}
    for (const k of ENV_KEYS) saved[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it("jitsi without a domain is not configured", () => {
    process.env.TELEHEALTH_PROVIDER = "jitsi"
    delete process.env.TELEHEALTH_JITSI_DOMAIN
    const cfg = getTelehealthConfig()
    expect(cfg.provider).toBe("jitsi")
    expect(cfg.configured).toBe(false)
  })

  it("jitsi with a domain is configured", () => {
    process.env.TELEHEALTH_PROVIDER = "jitsi"
    process.env.TELEHEALTH_JITSI_DOMAIN = "meet.x.com"
    const cfg = getTelehealthConfig()
    expect(cfg.configured).toBe(true)
    expect(cfg.jitsiDomain).toBe("meet.x.com")
  })

  it("mock is always configured", () => {
    process.env.TELEHEALTH_PROVIDER = "mock"
    delete process.env.TELEHEALTH_JITSI_DOMAIN
    expect(getTelehealthConfig().configured).toBe(true)
  })

  it("defaults to mock under NODE_ENV=test", () => {
    delete process.env.TELEHEALTH_PROVIDER
    process.env.NODE_ENV = "test"
    expect(getTelehealthConfig().provider).toBe("mock")
  })

  it("defaults to jitsi when NODE_ENV is not test", () => {
    delete process.env.TELEHEALTH_PROVIDER
    process.env.NODE_ENV = "production"
    expect(getTelehealthConfig().provider).toBe("jitsi")
  })
})

describe("getVideoProvider", () => {
  it("returns the mock provider for mock config", () => {
    expect(getVideoProvider({ provider: "mock", jitsiDomain: null, configured: true }).id).toBe(
      "mock"
    )
  })

  it("returns the jitsi provider for jitsi config", () => {
    expect(
      getVideoProvider({ provider: "jitsi", jitsiDomain: "x.com", configured: true }).id
    ).toBe("jitsi")
  })
})
