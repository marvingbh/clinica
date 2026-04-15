import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mocks — vi.mock calls are hoisted, so factories must not reference
// outer `const` variables. Instead, we import the mocked modules after
// vi.mock and obtain references via vi.mocked().
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clinic: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
  processPendingNotifications: vi.fn().mockResolvedValue(0),
  getPatientPhoneNumbers: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/notifications/templates", () => ({
  getTemplate: vi.fn().mockResolvedValue({
    content: "Reminder for {{patientName}}",
    subject: "Lembrete",
  }),
  renderTemplate: vi.fn((tpl: string, vars: Record<string, string>) => {
    let result = tpl
    for (const [k, v] of Object.entries(vars))
      result = result.replace(`{{${k}}}`, v)
    return result
  }),
}))

vi.mock("@/lib/appointments/appointment-links", () => ({
  buildConfirmUrl: vi.fn().mockReturnValue("https://app/confirm?id=appt-1"),
  buildCancelUrl: vi.fn().mockReturnValue("https://app/cancel?id=appt-1"),
}))

// ---------------------------------------------------------------------------
// Import the handler and mocked modules
// ---------------------------------------------------------------------------
import { GET } from "./route"
import { prisma } from "@/lib/prisma"
import {
  createNotification,
  processPendingNotifications,
  getPatientPhoneNumbers,
} from "@/lib/notifications"

// Typed references to mocked functions
const mockClinicFindMany = vi.mocked(prisma.clinic.findMany)
const mockAppointmentFindMany = vi.mocked(prisma.appointment.findMany)
const mockAuditLogCreate = vi.mocked(prisma.auditLog.create)
const mockCreateNotification = vi.mocked(createNotification)
const mockProcessPending = vi.mocked(processPendingNotifications)
const mockGetPhoneNumbers = vi.mocked(getPatientPhoneNumbers)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (secret !== undefined) {
    headers.authorization = `Bearer ${secret}`
  }
  return new Request("http://localhost/api/jobs/send-reminders", { headers })
}

function makeClinic(overrides: Record<string, unknown> = {}) {
  return {
    id: "clinic-1",
    name: "Clinica Teste",
    timezone: "America/Sao_Paulo",
    reminderHours: [48, 2],
    ...overrides,
  }
}

function makeAppointment(overrides: Record<string, unknown> = {}) {
  const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000 + 30 * 60 * 1000)
  return {
    id: "appt-1",
    clinicId: "clinic-1",
    type: "CONSULTA",
    status: "AGENDADO",
    scheduledAt,
    modality: "PRESENCIAL",
    patient: {
      id: "patient-1",
      name: "João Silva",
      email: "joao@example.com",
      phone: "5511999990000",
      consentWhatsApp: true,
      consentEmail: true,
    },
    professionalProfile: {
      user: { name: "Dra. Maria" },
    },
    clinic: { name: "Clinica Teste" },
    notifications: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/jobs/send-reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "test-secret"
    process.env.AUTH_SECRET = "auth-secret-for-links"
    process.env.NEXT_PUBLIC_APP_URL = "https://app"

    // Defaults: no clinics, no appointments
    mockClinicFindMany.mockResolvedValue([])
    mockAppointmentFindMany.mockResolvedValue([])
    mockAuditLogCreate.mockResolvedValue({} as never)
    mockProcessPending.mockResolvedValue(0)
  })

  // -----------------------------------------------------------------------
  // 1. Auth
  // -----------------------------------------------------------------------
  it("returns 401 without valid CRON_SECRET header", async () => {
    const res = await GET(makeRequest("wrong-secret"))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 401 when no authorization header is provided", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  // -----------------------------------------------------------------------
  // 2. Successful empty run
  // -----------------------------------------------------------------------
  it("returns 200 with valid CRON_SECRET", async () => {
    const res = await GET(makeRequest("test-secret"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it("returns success with no clinics (empty array)", async () => {
    mockClinicFindMany.mockResolvedValue([])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.clinicsProcessed).toBe(0)
    expect(body.appointmentsFound).toBe(0)
    expect(body.remindersCreated).toBe(0)
  })

  // -----------------------------------------------------------------------
  // 3. Appointment window query
  // -----------------------------------------------------------------------
  it("finds appointments within correct time window for each reminderHours value", async () => {
    const clinic = makeClinic({ reminderHours: [24] })
    mockClinicFindMany.mockResolvedValue([clinic])
    mockAppointmentFindMany.mockResolvedValue([])

    const beforeCall = Date.now()
    await GET(makeRequest("test-secret"))
    const afterCall = Date.now()

    expect(mockAppointmentFindMany).toHaveBeenCalledTimes(1)
    const call = mockAppointmentFindMany.mock.calls[0][0]

    // The window should start ~24 hours from now
    const windowStart = new Date(call.where.scheduledAt.gte).getTime()
    const windowEnd = new Date(call.where.scheduledAt.lt).getTime()

    const expectedStart = beforeCall + 24 * 60 * 60 * 1000
    const expectedEnd = expectedStart + 60 * 60 * 1000

    // Allow a tolerance of 1 second for execution time
    expect(windowStart).toBeGreaterThanOrEqual(expectedStart - 1000)
    expect(windowStart).toBeLessThanOrEqual(afterCall + 24 * 60 * 60 * 1000)
    expect(windowEnd - windowStart).toBe(60 * 60 * 1000) // exactly 1 hour
  })

  // -----------------------------------------------------------------------
  // 4. Default reminderHours
  // -----------------------------------------------------------------------
  it("uses default reminderHours [48, 2] when clinic has empty array", async () => {
    const clinic = makeClinic({ reminderHours: [] })
    mockClinicFindMany.mockResolvedValue([clinic])
    mockAppointmentFindMany.mockResolvedValue([])

    await GET(makeRequest("test-secret"))

    // Should query twice: once for 48h window, once for 2h window
    expect(mockAppointmentFindMany).toHaveBeenCalledTimes(2)
  })

  // -----------------------------------------------------------------------
  // 5. No consent
  // -----------------------------------------------------------------------
  it("skips appointments without patient consent (no WhatsApp, no Email)", async () => {
    const clinic = makeClinic({ reminderHours: [48] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const appt = makeAppointment({
      patient: {
        id: "patient-1",
        name: "João Silva",
        email: "joao@example.com",
        phone: "5511999990000",
        consentWhatsApp: false,
        consentEmail: false,
      },
    })
    mockAppointmentFindMany.mockResolvedValue([appt])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.skippedNoConsent).toBe(1)
    expect(body.remindersCreated).toBe(0)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 6. Recent reminder dedup
  // -----------------------------------------------------------------------
  it("skips when recent reminder exists (within 12 hours)", async () => {
    const clinic = makeClinic({ reminderHours: [48] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const appt = makeAppointment({
      notifications: [
        {
          id: "notif-1",
          channel: "WHATSAPP",
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
      ],
    })
    mockAppointmentFindMany.mockResolvedValue([appt])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.skippedAlreadySent).toBe(1)
    expect(body.remindersCreated).toBe(0)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 7. WhatsApp notification
  // -----------------------------------------------------------------------
  it("creates WhatsApp notification when patient has consent + phone", async () => {
    const clinic = makeClinic({ reminderHours: [48] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const appt = makeAppointment({
      patient: {
        id: "patient-1",
        name: "João Silva",
        email: null,
        phone: "5511999990000",
        consentWhatsApp: true,
        consentEmail: false,
      },
    })
    mockAppointmentFindMany.mockResolvedValue([appt])
    mockGetPhoneNumbers.mockResolvedValue([{ phone: "5511999990000" }])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.remindersCreated).toBe(1)
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: "clinic-1",
        patientId: "patient-1",
        appointmentId: "appt-1",
        type: "APPOINTMENT_REMINDER",
        channel: "WHATSAPP",
        recipient: "5511999990000",
      })
    )
  })

  // -----------------------------------------------------------------------
  // 8. Email notification
  // -----------------------------------------------------------------------
  it("creates Email notification when patient has consent + email", async () => {
    const clinic = makeClinic({ reminderHours: [48] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const appt = makeAppointment({
      patient: {
        id: "patient-1",
        name: "João Silva",
        email: "joao@example.com",
        phone: null,
        consentWhatsApp: false,
        consentEmail: true,
      },
    })
    mockAppointmentFindMany.mockResolvedValue([appt])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.remindersCreated).toBe(1)
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: "clinic-1",
        patientId: "patient-1",
        appointmentId: "appt-1",
        type: "APPOINTMENT_REMINDER",
        channel: "EMAIL",
        recipient: "joao@example.com",
        subject: "Lembrete",
      })
    )
  })

  // -----------------------------------------------------------------------
  // 9. Both WhatsApp and Email
  // -----------------------------------------------------------------------
  it("creates both WhatsApp and Email when patient has both consents", async () => {
    const clinic = makeClinic({ reminderHours: [48] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const appt = makeAppointment() // default has both consents
    mockAppointmentFindMany.mockResolvedValue([appt])
    mockGetPhoneNumbers.mockResolvedValue([{ phone: "5511999990000" }])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.remindersCreated).toBe(2) // 1 WhatsApp + 1 Email
    expect(mockCreateNotification).toHaveBeenCalledTimes(2)

    const channels = mockCreateNotification.mock.calls.map(
      (call: unknown[]) => (call[0] as Record<string, unknown>).channel
    )
    expect(channels).toContain("WHATSAPP")
    expect(channels).toContain("EMAIL")
  })

  // -----------------------------------------------------------------------
  // 10. Result counts
  // -----------------------------------------------------------------------
  it("counts results correctly across multiple appointments", async () => {
    const clinic = makeClinic({ reminderHours: [48] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const apptWithConsent = makeAppointment({ id: "appt-1" })
    const apptNoConsent = makeAppointment({
      id: "appt-2",
      patient: {
        id: "patient-2",
        name: "Maria",
        email: null,
        phone: null,
        consentWhatsApp: false,
        consentEmail: false,
      },
    })
    const apptAlreadySent = makeAppointment({
      id: "appt-3",
      patient: {
        id: "patient-3",
        name: "Carlos",
        email: "carlos@example.com",
        phone: "5511888880000",
        consentWhatsApp: true,
        consentEmail: true,
      },
      notifications: [
        {
          id: "notif-existing",
          channel: "WHATSAPP",
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        },
      ],
    })

    mockAppointmentFindMany.mockResolvedValue([
      apptWithConsent,
      apptNoConsent,
      apptAlreadySent,
    ])
    mockGetPhoneNumbers.mockResolvedValue([{ phone: "5511999990000" }])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.appointmentsFound).toBe(3)
    expect(body.skippedNoConsent).toBe(1)
    expect(body.skippedAlreadySent).toBe(1)
    expect(body.remindersCreated).toBe(2) // WhatsApp + Email for appt-1
  })

  // -----------------------------------------------------------------------
  // 11. AuditLog
  // -----------------------------------------------------------------------
  it("logs execution to AuditLog for each clinic", async () => {
    const clinic1 = makeClinic({ id: "clinic-1", name: "Clinica A" })
    const clinic2 = makeClinic({ id: "clinic-2", name: "Clinica B" })
    mockClinicFindMany.mockResolvedValue([clinic1, clinic2])
    mockAppointmentFindMany.mockResolvedValue([])

    await GET(makeRequest("test-secret"))

    expect(mockAuditLogCreate).toHaveBeenCalledTimes(2)

    const firstLogCall = mockAuditLogCreate.mock.calls[0][0]
    expect(firstLogCall.data.clinicId).toBe("clinic-1")
    expect(firstLogCall.data.action).toBe("REMINDER_JOB_EXECUTED")
    expect(firstLogCall.data.entityType).toBe("CronJob")
    expect(firstLogCall.data.entityId).toBe("send-reminders")
    expect(firstLogCall.data.userId).toBeNull()

    const secondLogCall = mockAuditLogCreate.mock.calls[1][0]
    expect(secondLogCall.data.clinicId).toBe("clinic-2")
  })

  // -----------------------------------------------------------------------
  // 12. Per-clinic error handling
  // -----------------------------------------------------------------------
  it("handles errors for individual clinics without failing entire job", async () => {
    const clinic1 = makeClinic({ id: "clinic-1" })
    const clinic2 = makeClinic({ id: "clinic-2" })
    mockClinicFindMany.mockResolvedValue([clinic1, clinic2])

    // First clinic throws, second clinic succeeds
    let callCount = 0
    mockAppointmentFindMany.mockImplementation(() => {
      callCount++
      if (callCount <= 1) {
        // clinic-1's first reminderHours window
        throw new Error("DB connection lost")
      }
      return Promise.resolve([])
    })

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]).toContain("clinic-1")
    expect(body.errors[0]).toContain("DB connection lost")
    // clinic-2 should have been processed successfully
    expect(body.clinicsProcessed).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 13. processPendingNotifications
  // -----------------------------------------------------------------------
  it("calls processPendingNotifications at the end", async () => {
    mockProcessPending.mockResolvedValue(5)

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(mockProcessPending).toHaveBeenCalledWith(50)
    expect(body.remindersSent).toBe(5)
  })

  // -----------------------------------------------------------------------
  // 14. Multiple phone numbers for WhatsApp
  // -----------------------------------------------------------------------
  it("creates WhatsApp notification for each phone number returned", async () => {
    const clinic = makeClinic({ reminderHours: [48] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const appt = makeAppointment({
      patient: {
        id: "patient-1",
        name: "João Silva",
        email: null,
        phone: "5511999990000",
        consentWhatsApp: true,
        consentEmail: false,
      },
    })
    mockAppointmentFindMany.mockResolvedValue([appt])
    mockGetPhoneNumbers.mockResolvedValue([
      { phone: "5511999990000" },
      { phone: "5511888880000" },
    ])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.remindersCreated).toBe(2)
    expect(mockCreateNotification).toHaveBeenCalledTimes(2)

    const recipients = mockCreateNotification.mock.calls.map(
      (call: unknown[]) => (call[0] as Record<string, unknown>).recipient
    )
    expect(recipients).toContain("5511999990000")
    expect(recipients).toContain("5511888880000")
  })

  // -----------------------------------------------------------------------
  // 15. Old notification does NOT trigger dedup
  // -----------------------------------------------------------------------
  it("does not skip when existing reminder is older than 12 hours", async () => {
    const clinic = makeClinic({ reminderHours: [2] })
    mockClinicFindMany.mockResolvedValue([clinic])

    const appt = makeAppointment({
      patient: {
        id: "patient-1",
        name: "João Silva",
        email: "joao@example.com",
        phone: null,
        consentWhatsApp: false,
        consentEmail: true,
      },
      notifications: [
        {
          id: "notif-old",
          channel: "EMAIL",
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      ],
    })
    mockAppointmentFindMany.mockResolvedValue([appt])

    const res = await GET(makeRequest("test-secret"))
    const body = await res.json()

    expect(body.skippedAlreadySent).toBe(0)
    expect(body.remindersCreated).toBe(1)
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
  })
})
