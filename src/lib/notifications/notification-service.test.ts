import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("./providers/whatsapp-mock", () => ({
  whatsAppMockProvider: { channel: "WHATSAPP", send: vi.fn() },
}))

vi.mock("./providers/email-resend", () => ({
  emailResendProvider: { channel: "EMAIL", send: vi.fn() },
}))

import { prisma } from "@/lib/prisma"
import { whatsAppMockProvider } from "./providers/whatsapp-mock"
import { emailResendProvider } from "./providers/email-resend"
import {
  createNotification,
  sendNotification,
  createAndSendNotification,
  processPendingNotifications,
  getNotificationsByAppointment,
  getNotificationStats,
} from "./notification-service"
import type { NotificationPayload } from "./types"

const mockCreate = prisma.notification.create as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.notification.findUnique as ReturnType<
  typeof vi.fn
>
const mockFindMany = prisma.notification.findMany as ReturnType<typeof vi.fn>
const mockUpdate = prisma.notification.update as ReturnType<typeof vi.fn>
const mockCount = prisma.notification.count as ReturnType<typeof vi.fn>

const mockWhatsAppSend = whatsAppMockProvider.send as ReturnType<typeof vi.fn>
const mockEmailSend = emailResendProvider.send as ReturnType<typeof vi.fn>

function makeNotificationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-default",
    clinicId: "clinic-1",
    patientId: "patient-1",
    appointmentId: "appt-1",
    type: "APPOINTMENT_REMINDER",
    channel: "WHATSAPP",
    status: "PENDING",
    recipient: "+5511999990000",
    subject: null,
    content: "Lembrete de consulta",
    attempts: 0,
    maxAttempts: 3,
    nextRetryAt: new Date("2026-04-15T10:00:00Z"),
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    createdAt: new Date("2026-04-15T09:00:00Z"),
    updatedAt: new Date("2026-04-15T09:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-04-15T12:00:00Z"))
})

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------

describe("createNotification", () => {
  it("creates a notification with PENDING status and attempts=0", async () => {
    const payload: NotificationPayload = {
      clinicId: "clinic-create-1",
      patientId: "patient-create-1",
      appointmentId: "appt-create-1",
      type: "APPOINTMENT_REMINDER" as never,
      channel: "WHATSAPP" as never,
      recipient: "+5511999990001",
      subject: "Lembrete",
      content: "Sua consulta e amanha",
    }

    const expected = makeNotificationRecord({
      id: "notif-create-1",
      ...payload,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 3,
    })
    mockCreate.mockResolvedValueOnce(expected)

    const result = await createNotification(payload)

    expect(mockCreate).toHaveBeenCalledOnce()
    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.data).toMatchObject({
      clinicId: "clinic-create-1",
      patientId: "patient-create-1",
      appointmentId: "appt-create-1",
      type: "APPOINTMENT_REMINDER",
      channel: "WHATSAPP",
      status: "PENDING",
      recipient: "+5511999990001",
      subject: "Lembrete",
      content: "Sua consulta e amanha",
      attempts: 0,
      maxAttempts: 3,
    })
    expect(createArg.data.nextRetryAt).toBeInstanceOf(Date)
    expect(result).toBe(expected)
  })

  it("passes all payload fields including optional ones", async () => {
    const payload: NotificationPayload = {
      clinicId: "clinic-create-2",
      type: "APPOINTMENT_REMINDER" as never,
      channel: "EMAIL" as never,
      recipient: "paciente@example.com",
      content: "Sua consulta e amanha",
      // patientId and appointmentId omitted (optional)
    }

    mockCreate.mockResolvedValueOnce(
      makeNotificationRecord({ id: "notif-create-2", ...payload })
    )

    await createNotification(payload)

    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.data.clinicId).toBe("clinic-create-2")
    expect(createArg.data.patientId).toBeUndefined()
    expect(createArg.data.appointmentId).toBeUndefined()
    expect(createArg.data.subject).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// sendNotification
// ---------------------------------------------------------------------------

describe("sendNotification", () => {
  it("returns error when notification does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const result = await sendNotification("notif-missing-1")

    expect(result).toEqual({ success: false, error: "Notification not found" })
  })

  it("returns success with already-sent externalId when status is SENT", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeNotificationRecord({
        id: "notif-already-sent",
        status: "SENT",
        sentAt: new Date("2026-04-15T11:00:00Z"),
      })
    )

    const result = await sendNotification("notif-already-sent")

    expect(result).toEqual({ success: true, externalId: "already-sent" })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("returns error when status is FAILED", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeNotificationRecord({
        id: "notif-perm-failed",
        status: "FAILED",
        failedAt: new Date("2026-04-15T11:00:00Z"),
        failureReason: "Max attempts exceeded",
      })
    )

    const result = await sendNotification("notif-perm-failed")

    expect(result).toEqual({
      success: false,
      error: "Notification permanently failed",
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("returns error for unknown channel", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeNotificationRecord({
        id: "notif-unknown-chan",
        channel: "SMS",
      })
    )

    const result = await sendNotification("notif-unknown-chan")

    expect(result).toEqual({
      success: false,
      error: "No provider for channel: SMS",
    })
  })

  it("updates status to SENT on successful WhatsApp send", async () => {
    const notif = makeNotificationRecord({
      id: "notif-send-ok-1",
      channel: "WHATSAPP",
      attempts: 0,
      maxAttempts: 3,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockWhatsAppSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-whatsapp-123",
    })
    mockUpdate.mockResolvedValueOnce({})

    const result = await sendNotification("notif-send-ok-1")

    expect(result).toEqual({ success: true, externalId: "ext-whatsapp-123" })
    expect(mockWhatsAppSend).toHaveBeenCalledWith(
      "+5511999990000",
      "Lembrete de consulta",
      undefined
    )
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "notif-send-ok-1" },
      data: {
        status: "SENT",
        sentAt: expect.any(Date),
        attempts: 1,
        nextRetryAt: null,
        failureReason: null,
      },
    })
  })

  it("updates status to SENT on successful Email send", async () => {
    const notif = makeNotificationRecord({
      id: "notif-send-email-ok",
      channel: "EMAIL",
      recipient: "paciente@example.com",
      subject: "Lembrete",
      content: "Consulta amanha",
      attempts: 1,
      maxAttempts: 3,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockEmailSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-email-456",
    })
    mockUpdate.mockResolvedValueOnce({})

    const result = await sendNotification("notif-send-email-ok")

    expect(result).toEqual({ success: true, externalId: "ext-email-456" })
    expect(mockEmailSend).toHaveBeenCalledWith(
      "paciente@example.com",
      "Consulta amanha",
      "Lembrete"
    )
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "notif-send-email-ok" },
      data: expect.objectContaining({
        status: "SENT",
        attempts: 2,
      }),
    })
  })

  it("keeps PENDING and schedules retry on non-final failed attempt", async () => {
    const notif = makeNotificationRecord({
      id: "notif-retry-1",
      channel: "WHATSAPP",
      attempts: 0,
      maxAttempts: 3,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockWhatsAppSend.mockResolvedValueOnce({
      success: false,
      error: "Provider timeout",
    })
    mockUpdate.mockResolvedValueOnce({})

    const result = await sendNotification("notif-retry-1")

    expect(result).toEqual({ success: false, error: "Provider timeout" })

    const updateArg = mockUpdate.mock.calls[0][0]
    expect(updateArg.where).toEqual({ id: "notif-retry-1" })
    // Should NOT set status to FAILED — remains PENDING implicitly (no status field in update)
    expect(updateArg.data.status).toBeUndefined()
    expect(updateArg.data.attempts).toBe(1)
    expect(updateArg.data.failureReason).toBe("Provider timeout")
    expect(updateArg.data.nextRetryAt).toBeInstanceOf(Date)

    // Exponential backoff: attempt 1 -> baseDelay * 2^0 = 60000ms
    const expectedRetryAt = new Date(
      new Date("2026-04-15T12:00:00Z").getTime() + 60000
    )
    expect(updateArg.data.nextRetryAt).toEqual(expectedRetryAt)
  })

  it("applies exponential backoff for second retry", async () => {
    const notif = makeNotificationRecord({
      id: "notif-retry-2",
      channel: "WHATSAPP",
      attempts: 1,
      maxAttempts: 3,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockWhatsAppSend.mockResolvedValueOnce({
      success: false,
      error: "Network error",
    })
    mockUpdate.mockResolvedValueOnce({})

    await sendNotification("notif-retry-2")

    const updateArg = mockUpdate.mock.calls[0][0]
    expect(updateArg.data.attempts).toBe(2)
    // Exponential backoff: attempt 2 -> baseDelay * 2^1 = 120000ms
    const expectedRetryAt = new Date(
      new Date("2026-04-15T12:00:00Z").getTime() + 120000
    )
    expect(updateArg.data.nextRetryAt).toEqual(expectedRetryAt)
  })

  it("sets status to FAILED on final attempt", async () => {
    const notif = makeNotificationRecord({
      id: "notif-final-fail",
      channel: "WHATSAPP",
      attempts: 2,
      maxAttempts: 3,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockWhatsAppSend.mockResolvedValueOnce({
      success: false,
      error: "Recipient unreachable",
    })
    mockUpdate.mockResolvedValueOnce({})

    const result = await sendNotification("notif-final-fail")

    expect(result).toEqual({
      success: false,
      error: "Recipient unreachable",
    })

    const updateArg = mockUpdate.mock.calls[0][0]
    expect(updateArg.where).toEqual({ id: "notif-final-fail" })
    expect(updateArg.data).toEqual({
      status: "FAILED",
      failedAt: expect.any(Date),
      failureReason: "Recipient unreachable",
      attempts: 3,
      nextRetryAt: null,
    })
  })

  it("marks FAILED when maxAttempts is 1 and first send fails", async () => {
    const notif = makeNotificationRecord({
      id: "notif-single-attempt",
      channel: "EMAIL",
      attempts: 0,
      maxAttempts: 1,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockEmailSend.mockResolvedValueOnce({
      success: false,
      error: "Invalid email",
    })
    mockUpdate.mockResolvedValueOnce({})

    const result = await sendNotification("notif-single-attempt")

    expect(result).toEqual({ success: false, error: "Invalid email" })

    const updateArg = mockUpdate.mock.calls[0][0]
    expect(updateArg.data.status).toBe("FAILED")
    expect(updateArg.data.failedAt).toBeInstanceOf(Date)
    expect(updateArg.data.nextRetryAt).toBeNull()
  })

  it("respects custom retry config for backoff calculation", async () => {
    const notif = makeNotificationRecord({
      id: "notif-custom-config",
      channel: "WHATSAPP",
      attempts: 0,
      maxAttempts: 3,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockWhatsAppSend.mockResolvedValueOnce({
      success: false,
      error: "Timeout",
    })
    mockUpdate.mockResolvedValueOnce({})

    const customConfig = {
      maxAttempts: 5,
      baseDelayMs: 30000,
      maxDelayMs: 600000,
    }

    await sendNotification("notif-custom-config", customConfig)

    const updateArg = mockUpdate.mock.calls[0][0]
    // Custom config: attempt 1 -> 30000 * 2^0 = 30000ms
    const expectedRetryAt = new Date(
      new Date("2026-04-15T12:00:00Z").getTime() + 30000
    )
    expect(updateArg.data.nextRetryAt).toEqual(expectedRetryAt)
  })

  it("passes subject to provider when present", async () => {
    const notif = makeNotificationRecord({
      id: "notif-with-subject",
      channel: "EMAIL",
      subject: "Consulta Amanha",
      content: "Voce tem uma consulta amanha as 10h",
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockEmailSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-email-789",
    })
    mockUpdate.mockResolvedValueOnce({})

    await sendNotification("notif-with-subject")

    expect(mockEmailSend).toHaveBeenCalledWith(
      "+5511999990000",
      "Voce tem uma consulta amanha as 10h",
      "Consulta Amanha"
    )
  })

  it("passes undefined subject to provider when subject is null", async () => {
    const notif = makeNotificationRecord({
      id: "notif-no-subject",
      channel: "WHATSAPP",
      subject: null,
    })
    mockFindUnique.mockResolvedValueOnce(notif)
    mockWhatsAppSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-wa-no-subj",
    })
    mockUpdate.mockResolvedValueOnce({})

    await sendNotification("notif-no-subject")

    expect(mockWhatsAppSend).toHaveBeenCalledWith(
      "+5511999990000",
      "Lembrete de consulta",
      undefined
    )
  })
})

// ---------------------------------------------------------------------------
// createAndSendNotification
// ---------------------------------------------------------------------------

describe("createAndSendNotification", () => {
  it("creates and sends a notification in one call", async () => {
    const payload: NotificationPayload = {
      clinicId: "clinic-cas-1",
      patientId: "patient-cas-1",
      appointmentId: "appt-cas-1",
      type: "APPOINTMENT_REMINDER" as never,
      channel: "WHATSAPP" as never,
      recipient: "+5511999990002",
      content: "Lembrete via createAndSend",
    }

    const createdNotif = makeNotificationRecord({
      id: "notif-cas-1",
      ...payload,
    })
    const updatedNotif = makeNotificationRecord({
      id: "notif-cas-1",
      ...payload,
      status: "SENT",
      sentAt: new Date("2026-04-15T12:00:00Z"),
      attempts: 1,
    })

    // createNotification -> prisma.notification.create
    mockCreate.mockResolvedValueOnce(createdNotif)
    // sendNotification -> prisma.notification.findUnique
    mockFindUnique.mockResolvedValueOnce(createdNotif)
    // provider send
    mockWhatsAppSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-cas-1",
    })
    // sendNotification -> prisma.notification.update
    mockUpdate.mockResolvedValueOnce(updatedNotif)
    // createAndSendNotification -> prisma.notification.findUnique (reload)
    mockFindUnique.mockResolvedValueOnce(updatedNotif)

    const result = await createAndSendNotification(payload)

    expect(result.notification).toBe(updatedNotif)
    expect(result.sendResult).toEqual({
      success: true,
      externalId: "ext-cas-1",
    })
    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockWhatsAppSend).toHaveBeenCalledOnce()
  })

  it("returns original notification if reload returns null", async () => {
    const payload: NotificationPayload = {
      clinicId: "clinic-cas-2",
      type: "APPOINTMENT_REMINDER" as never,
      channel: "EMAIL" as never,
      recipient: "test@example.com",
      content: "Lembrete",
    }

    const createdNotif = makeNotificationRecord({
      id: "notif-cas-2",
      ...payload,
    })

    mockCreate.mockResolvedValueOnce(createdNotif)
    mockFindUnique.mockResolvedValueOnce(createdNotif)
    mockEmailSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-cas-2",
    })
    mockUpdate.mockResolvedValueOnce({})
    // reload returns null
    mockFindUnique.mockResolvedValueOnce(null)

    const result = await createAndSendNotification(payload)

    expect(result.notification).toBe(createdNotif)
  })
})

// ---------------------------------------------------------------------------
// processPendingNotifications
// ---------------------------------------------------------------------------

describe("processPendingNotifications", () => {
  it("queries PENDING notifications where nextRetryAt <= now, ordered asc", async () => {
    mockFindMany.mockResolvedValueOnce([])

    await processPendingNotifications(5)

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        nextRetryAt: { lte: expect.any(Date) },
      },
      orderBy: { nextRetryAt: "asc" },
      take: 5,
    })
  })

  it("uses default limit of 10 when not provided", async () => {
    mockFindMany.mockResolvedValueOnce([])

    await processPendingNotifications()

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    )
  })

  it("calls sendNotification for each pending notification", async () => {
    const notif1 = makeNotificationRecord({
      id: "notif-proc-1",
      channel: "WHATSAPP",
    })
    const notif2 = makeNotificationRecord({
      id: "notif-proc-2",
      channel: "EMAIL",
    })

    mockFindMany.mockResolvedValueOnce([notif1, notif2])

    // sendNotification for notif1
    mockFindUnique.mockResolvedValueOnce(notif1)
    mockWhatsAppSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-proc-1",
    })
    mockUpdate.mockResolvedValueOnce({})

    // sendNotification for notif2
    mockFindUnique.mockResolvedValueOnce(notif2)
    mockEmailSend.mockResolvedValueOnce({
      success: true,
      externalId: "ext-proc-2",
    })
    mockUpdate.mockResolvedValueOnce({})

    const processed = await processPendingNotifications(10)

    expect(processed).toBe(2)
    expect(mockFindUnique).toHaveBeenCalledTimes(2)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "notif-proc-1" },
    })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "notif-proc-2" },
    })
  })

  it("returns 0 when no pending notifications exist", async () => {
    mockFindMany.mockResolvedValueOnce([])

    const processed = await processPendingNotifications()

    expect(processed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getNotificationsByAppointment
// ---------------------------------------------------------------------------

describe("getNotificationsByAppointment", () => {
  it("queries notifications by appointmentId ordered by createdAt desc", async () => {
    const notifs = [
      makeNotificationRecord({ id: "notif-appt-1" }),
      makeNotificationRecord({ id: "notif-appt-2" }),
    ]
    mockFindMany.mockResolvedValueOnce(notifs)

    const result = await getNotificationsByAppointment("appt-query-1")

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { appointmentId: "appt-query-1" },
      orderBy: { createdAt: "desc" },
    })
    expect(result).toBe(notifs)
  })

  it("returns empty array when no notifications found", async () => {
    mockFindMany.mockResolvedValueOnce([])

    const result = await getNotificationsByAppointment("appt-empty")

    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getNotificationStats
// ---------------------------------------------------------------------------

describe("getNotificationStats", () => {
  it("counts PENDING, SENT, and FAILED notifications for a clinic", async () => {
    mockCount
      .mockResolvedValueOnce(5) // PENDING
      .mockResolvedValueOnce(42) // SENT
      .mockResolvedValueOnce(3) // FAILED

    const stats = await getNotificationStats("clinic-stats-1")

    expect(stats).toEqual({ pending: 5, sent: 42, failed: 3 })

    expect(mockCount).toHaveBeenCalledTimes(3)
    expect(mockCount).toHaveBeenCalledWith({
      where: { clinicId: "clinic-stats-1", status: "PENDING" },
    })
    expect(mockCount).toHaveBeenCalledWith({
      where: { clinicId: "clinic-stats-1", status: "SENT" },
    })
    expect(mockCount).toHaveBeenCalledWith({
      where: { clinicId: "clinic-stats-1", status: "FAILED" },
    })
  })

  it("returns zeros when clinic has no notifications", async () => {
    mockCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)

    const stats = await getNotificationStats("clinic-stats-empty")

    expect(stats).toEqual({ pending: 0, sent: 0, failed: 0 })
  })
})
