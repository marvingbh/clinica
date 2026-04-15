import { describe, it, expect } from "vitest"
import {
  calculateReminderWindow,
  hasPatientConsent,
  hasRecentReminder,
  buildReminderTemplateVariables,
  getDefaultReminderHours,
} from "./send-reminders"

// ---------------------------------------------------------------------------
// calculateReminderWindow
// ---------------------------------------------------------------------------

describe("calculateReminderWindow", () => {
  const now = new Date("2026-04-14T10:00:00.000Z")

  it("returns a window starting hoursBeforeAppointment from now", () => {
    const { windowStart } = calculateReminderWindow(now, 48)
    expect(windowStart).toEqual(new Date("2026-04-16T10:00:00.000Z"))
  })

  it("returns a window that spans exactly 1 hour", () => {
    const { windowStart, windowEnd } = calculateReminderWindow(now, 48)
    expect(windowEnd.getTime() - windowStart.getTime()).toBe(60 * 60 * 1000)
  })

  it("handles small hour values (e.g. 2 hours)", () => {
    const { windowStart, windowEnd } = calculateReminderWindow(now, 2)
    expect(windowStart).toEqual(new Date("2026-04-14T12:00:00.000Z"))
    expect(windowEnd).toEqual(new Date("2026-04-14T13:00:00.000Z"))
  })

  it("handles zero hours (immediate window)", () => {
    const { windowStart, windowEnd } = calculateReminderWindow(now, 0)
    expect(windowStart).toEqual(now)
    expect(windowEnd).toEqual(new Date("2026-04-14T11:00:00.000Z"))
  })

  it("handles fractional hours", () => {
    const { windowStart } = calculateReminderWindow(now, 1.5)
    expect(windowStart).toEqual(new Date("2026-04-14T11:30:00.000Z"))
  })
})

// ---------------------------------------------------------------------------
// hasPatientConsent
// ---------------------------------------------------------------------------

describe("hasPatientConsent", () => {
  it("returns both true when patient has full consent and contact info", () => {
    const result = hasPatientConsent({
      consentWhatsApp: true,
      phone: "5511999990000",
      consentEmail: true,
      email: "joao@example.com",
    })
    expect(result).toEqual({ whatsapp: true, email: true })
  })

  it("returns both false when patient has no consent", () => {
    const result = hasPatientConsent({
      consentWhatsApp: false,
      phone: "5511999990000",
      consentEmail: false,
      email: "joao@example.com",
    })
    expect(result).toEqual({ whatsapp: false, email: false })
  })

  it("returns whatsapp false when consent is true but phone is null", () => {
    const result = hasPatientConsent({
      consentWhatsApp: true,
      phone: null,
      consentEmail: false,
      email: null,
    })
    expect(result).toEqual({ whatsapp: false, email: false })
  })

  it("returns email false when consent is true but email is null", () => {
    const result = hasPatientConsent({
      consentWhatsApp: false,
      phone: null,
      consentEmail: true,
      email: null,
    })
    expect(result).toEqual({ whatsapp: false, email: false })
  })

  it("returns whatsapp true, email false for WhatsApp-only consent", () => {
    const result = hasPatientConsent({
      consentWhatsApp: true,
      phone: "5511999990000",
      consentEmail: false,
      email: null,
    })
    expect(result).toEqual({ whatsapp: true, email: false })
  })

  it("returns whatsapp false, email true for email-only consent", () => {
    const result = hasPatientConsent({
      consentWhatsApp: false,
      phone: null,
      consentEmail: true,
      email: "joao@example.com",
    })
    expect(result).toEqual({ whatsapp: false, email: true })
  })
})

// ---------------------------------------------------------------------------
// hasRecentReminder
// ---------------------------------------------------------------------------

describe("hasRecentReminder", () => {
  const now = new Date("2026-04-14T10:00:00.000Z")

  it("returns false when notifications array is empty", () => {
    expect(hasRecentReminder([], now)).toBe(false)
  })

  it("returns true when a notification was created 2 hours ago", () => {
    const notifications = [
      { createdAt: new Date("2026-04-14T08:00:00.000Z") }, // 2h ago
    ]
    expect(hasRecentReminder(notifications, now)).toBe(true)
  })

  it("returns false when notification is older than 12 hours", () => {
    const notifications = [
      { createdAt: new Date("2026-04-13T10:00:00.000Z") }, // 24h ago
    ]
    expect(hasRecentReminder(notifications, now)).toBe(false)
  })

  it("returns true when notification is exactly at the boundary (11h59m ago)", () => {
    const almostTwelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000 - 60 * 1000))
    const notifications = [{ createdAt: almostTwelveHoursAgo }]
    expect(hasRecentReminder(notifications, now)).toBe(true)
  })

  it("returns false when notification is exactly 12 hours old", () => {
    const exactlyTwelveHours = new Date(now.getTime() - 12 * 60 * 60 * 1000)
    const notifications = [{ createdAt: exactlyTwelveHours }]
    expect(hasRecentReminder(notifications, now)).toBe(false)
  })

  it("handles string dates (from JSON serialization)", () => {
    const notifications = [
      { createdAt: "2026-04-14T09:00:00.000Z" }, // 1h ago as string
    ]
    expect(hasRecentReminder(notifications, now)).toBe(true)
  })

  it("accepts a custom deduplication window", () => {
    const sixHoursAgo = new Date("2026-04-14T04:00:00.000Z")
    const notifications = [{ createdAt: sixHoursAgo }]

    // 4-hour window: 6h ago is outside
    expect(hasRecentReminder(notifications, now, 4 * 60 * 60 * 1000)).toBe(false)

    // 8-hour window: 6h ago is inside
    expect(hasRecentReminder(notifications, now, 8 * 60 * 60 * 1000)).toBe(true)
  })

  it("returns true if any notification is recent among multiple", () => {
    const notifications = [
      { createdAt: new Date("2026-04-13T10:00:00.000Z") }, // 24h ago
      { createdAt: new Date("2026-04-14T09:30:00.000Z") }, // 30min ago
    ]
    expect(hasRecentReminder(notifications, now)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildReminderTemplateVariables
// ---------------------------------------------------------------------------

describe("buildReminderTemplateVariables", () => {
  const appointment = {
    id: "appt-1",
    scheduledAt: new Date("2026-04-15T14:30:00.000Z"),
    modality: "PRESENCIAL",
    professionalProfile: { user: { name: "Dra. Maria" } },
    clinic: { name: "Clinica Teste" },
  }
  const patient = { name: "João Silva" }
  const clinic = { name: "Clinica Teste" }
  const baseUrl = "https://app.example.com"

  it("includes all required template variable keys", () => {
    const vars = buildReminderTemplateVariables(
      appointment, patient, clinic, baseUrl,
      "https://app/confirm", "https://app/cancel"
    )
    expect(vars).toHaveProperty("patientName")
    expect(vars).toHaveProperty("professionalName")
    expect(vars).toHaveProperty("date")
    expect(vars).toHaveProperty("time")
    expect(vars).toHaveProperty("confirmLink")
    expect(vars).toHaveProperty("cancelLink")
    expect(vars).toHaveProperty("clinicName")
    expect(vars).toHaveProperty("modality")
  })

  it("maps patient and professional names correctly", () => {
    const vars = buildReminderTemplateVariables(
      appointment, patient, clinic, baseUrl,
      "https://app/confirm", "https://app/cancel"
    )
    expect(vars.patientName).toBe("João Silva")
    expect(vars.professionalName).toBe("Dra. Maria")
    expect(vars.clinicName).toBe("Clinica Teste")
  })

  it("formats modality as Presencial for non-ONLINE", () => {
    const vars = buildReminderTemplateVariables(
      appointment, patient, clinic, baseUrl,
      "https://app/confirm", "https://app/cancel"
    )
    expect(vars.modality).toBe("Presencial")
  })

  it("formats modality as Online for ONLINE", () => {
    const onlineAppt = { ...appointment, modality: "ONLINE" }
    const vars = buildReminderTemplateVariables(
      onlineAppt, patient, clinic, baseUrl,
      "https://app/confirm", "https://app/cancel"
    )
    expect(vars.modality).toBe("Online")
  })

  it("passes confirm and cancel links through", () => {
    const vars = buildReminderTemplateVariables(
      appointment, patient, clinic, baseUrl,
      "https://app/confirm?id=appt-1", "https://app/cancel?id=appt-1"
    )
    expect(vars.confirmLink).toBe("https://app/confirm?id=appt-1")
    expect(vars.cancelLink).toBe("https://app/cancel?id=appt-1")
  })

  it("handles string scheduledAt (from JSON/Prisma)", () => {
    const apptWithString = { ...appointment, scheduledAt: "2026-04-15T14:30:00.000Z" }
    const vars = buildReminderTemplateVariables(
      apptWithString, patient, clinic, baseUrl,
      "https://app/confirm", "https://app/cancel"
    )
    expect(vars.date).toBeTruthy()
    expect(vars.time).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// getDefaultReminderHours
// ---------------------------------------------------------------------------

describe("getDefaultReminderHours", () => {
  it("returns clinic hours when array is non-empty", () => {
    expect(getDefaultReminderHours([24])).toEqual([24])
  })

  it("returns clinic hours preserving order and all values", () => {
    expect(getDefaultReminderHours([72, 48, 24, 2])).toEqual([72, 48, 24, 2])
  })

  it("returns [48, 2] when clinic hours array is empty", () => {
    expect(getDefaultReminderHours([])).toEqual([48, 2])
  })
})
