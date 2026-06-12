import { describe, it, expect } from "vitest"
import { publicBookingSchema, isWithinBookingWindow } from "./validation"

const validBase = {
  professionalSlug: "ana-muller",
  start: "2026-06-15T17:00:00.000Z",
  modality: "ONLINE" as const,
  name: "João da Silva",
  phone: "(11) 99999-9999",
  email: "joao@example.com",
  consent: true as const,
}

describe("publicBookingSchema", () => {
  it("accepts a valid Brazilian payload", () => {
    const result = publicBookingSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  it("accepts a valid international phone (+351…)", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, phone: "+351912345678" })
    expect(result.success).toBe(true)
  })

  it("accepts an optional CPF", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, cpf: "12345678900" })
    expect(result.success).toBe(true)
  })

  it("rejects when consent is not true", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, consent: false })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid phone", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, phone: "123" })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid email", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, email: "not-an-email" })
    expect(result.success).toBe(false)
  })

  it("rejects a too-short name", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, name: "Jo" })
    expect(result.success).toBe(false)
  })

  it("rejects a filled honeypot (website non-empty)", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, website: "spam" })
    expect(result.success).toBe(false)
  })

  it("accepts an empty honeypot", () => {
    const result = publicBookingSchema.safeParse({ ...validBase, website: "" })
    expect(result.success).toBe(true)
  })
})

describe("isWithinBookingWindow", () => {
  const now = new Date("2026-06-15T00:00:00.000Z")

  it("rejects a start before now + minAdvance", () => {
    const start = new Date(now.getTime() + 11 * 60 * 60 * 1000) // 11h ahead, min 12h
    expect(isWithinBookingWindow(start, now, 12, 30)).toBe(false)
  })

  it("accepts the exact minimum-advance boundary", () => {
    const start = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    expect(isWithinBookingWindow(start, now, 12, 30)).toBe(true)
  })

  it("accepts the exact horizon boundary", () => {
    const start = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(isWithinBookingWindow(start, now, 12, 30)).toBe(true)
  })

  it("rejects a start beyond the horizon", () => {
    const start = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000)
    expect(isWithinBookingWindow(start, now, 12, 30)).toBe(false)
  })
})
