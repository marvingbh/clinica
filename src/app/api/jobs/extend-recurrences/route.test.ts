import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockPrisma, calculateNextWindowDates } = vi.hoisted(() => {
  const mp: Record<string, unknown> = {
    appointmentRecurrence: { findMany: vi.fn(), update: vi.fn() },
    appointment: { findMany: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mp)),
  }
  return {
    mockPrisma: mp as {
      appointmentRecurrence: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
      appointment: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
      auditLog: { create: ReturnType<typeof vi.fn> }
      $transaction: ReturnType<typeof vi.fn>
    },
    calculateNextWindowDates: vi.fn().mockReturnValue([]),
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/appointments", () => ({ calculateNextWindowDates }))

import { GET } from "./route"

// ── Helpers ────────────────────────────────────────────────────────────────

const CRON_SECRET = "test-cron-secret"

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (secret !== undefined) {
    headers["authorization"] = `Bearer ${secret}`
  }
  return new Request("http://localhost/api/jobs/extend-recurrences", { headers })
}

function makeRecurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    clinicId: "clinic-1",
    professionalProfileId: "prof-1",
    patientId: "patient-1",
    startDate: "2026-01-05",
    startTime: "09:00",
    duration: 50,
    recurrenceType: "WEEKLY",
    dayOfWeek: 1,
    modality: "PRESENCIAL",
    exceptions: [],
    lastGeneratedDate: "2026-03-01",
    isActive: true,
    clinic: { id: "clinic-1", isActive: true },
    professionalProfile: { id: "prof-1", bufferBetweenSlots: 0 },
    ...overrides,
  }
}

/** Creates a RecurrenceDate-shaped object. Times use local timezone (no Z suffix). */
function makeDateInfo(dateStr: string, hour: number = 9, durationMin: number = 50) {
  const scheduledAt = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`)
  const endAt = new Date(scheduledAt.getTime() + durationMin * 60 * 1000)
  return { date: dateStr, scheduledAt, endAt }
}

/** Creates an existing appointment for conflict checking (same local timezone). */
function makeExisting(dateStr: string, startHour: number, startMin: number, endHour: number, endMin: number) {
  return {
    scheduledAt: new Date(`${dateStr}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00`),
    endAt: new Date(`${dateStr}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`),
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-04-14T10:00:00"))
  vi.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET

  // Safe defaults
  mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([])
  mockPrisma.appointmentRecurrence.update.mockResolvedValue({})
  mockPrisma.appointment.findMany.mockResolvedValue([])
  mockPrisma.appointment.createMany.mockResolvedValue({ count: 0 })
  mockPrisma.auditLog.create.mockResolvedValue({})
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma))
  calculateNextWindowDates.mockReturnValue([])
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.CRON_SECRET
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/jobs/extend-recurrences", () => {
  // 1
  it("returns 401 without valid CRON_SECRET", async () => {
    const res = await GET(makeRequest("wrong-secret"))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 401 when no authorization header is provided", async () => {
    const res = await GET(new Request("http://localhost/api/jobs/extend-recurrences"))
    expect(res.status).toBe(401)
  })

  // 2
  it("returns 200 with valid CRON_SECRET and empty recurrences", async () => {
    const res = await GET(makeRequest(CRON_SECRET))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.recurrencesProcessed).toBe(0)
    expect(body.appointmentsCreated).toBe(0)
  })

  // 3
  it("skips recurrences where clinic is inactive", async () => {
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([
      makeRecurrence({ clinic: { id: "clinic-1", isActive: false } }),
    ])

    const res = await GET(makeRequest(CRON_SECRET))
    const body = await res.json()

    expect(body.recurrencesSkipped).toBe(1)
    expect(body.recurrencesProcessed).toBe(0)
    expect(calculateNextWindowDates).not.toHaveBeenCalled()
  })

  // 4
  it("skips when lastGeneratedDate is more than 2 months in the future", async () => {
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([
      makeRecurrence({ lastGeneratedDate: "2026-07-01" }),
    ])

    const res = await GET(makeRequest(CRON_SECRET))
    const body = await res.json()

    expect(body.recurrencesSkipped).toBe(1)
    expect(calculateNextWindowDates).not.toHaveBeenCalled()
  })

  // 5
  it("uses startDate as fallback when lastGeneratedDate is null", async () => {
    const recurrence = makeRecurrence({
      lastGeneratedDate: null,
      startDate: "2026-03-01",
    })
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue([makeDateInfo("2026-04-20")])
    mockPrisma.appointment.findMany.mockResolvedValue([])

    await GET(makeRequest(CRON_SECRET))

    expect(calculateNextWindowDates).toHaveBeenCalledWith(
      expect.any(Date),
      "09:00",
      50,
      "WEEKLY",
      1,
      3
    )
    // The fallback date should come from startDate
    const passedDate = calculateNextWindowDates.mock.calls[0][0] as Date
    expect(passedDate.toISOString()).toContain("2026-03-01")
  })

  // 6
  it("calls calculateNextWindowDates with correct params", async () => {
    const recurrence = makeRecurrence({
      lastGeneratedDate: "2026-04-01",
      startTime: "14:30",
      duration: 60,
      recurrenceType: "BIWEEKLY",
      dayOfWeek: 3,
    })
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue([makeDateInfo("2026-04-20", 14, 60)])
    mockPrisma.appointment.findMany.mockResolvedValue([])

    await GET(makeRequest(CRON_SECRET))

    expect(calculateNextWindowDates).toHaveBeenCalledWith(
      expect.any(Date),
      "14:30",
      60,
      "BIWEEKLY",
      3,
      3
    )
  })

  // 7
  it("filters out exception dates", async () => {
    const recurrence = makeRecurrence({
      exceptions: ["2026-04-20", "2026-05-04"],
    })
    const dates = [
      makeDateInfo("2026-04-20"),
      makeDateInfo("2026-04-27"),
      makeDateInfo("2026-05-04"),
      makeDateInfo("2026-05-11"),
    ]
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue(dates)
    mockPrisma.appointment.findMany.mockResolvedValue([])

    await GET(makeRequest(CRON_SECRET))

    // createMany should only receive the 2 non-exception dates (04-27 and 05-11)
    const createCall = mockPrisma.appointment.createMany.mock.calls[0][0]
    expect(createCall.data).toHaveLength(2)
    expect(createCall.data[0].scheduledAt).toEqual(dates[1].scheduledAt)
    expect(createCall.data[1].scheduledAt).toEqual(dates[3].scheduledAt)
  })

  // 8
  it("skips when all dates are exceptions", async () => {
    const recurrence = makeRecurrence({
      exceptions: ["2026-04-20", "2026-04-27"],
    })
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue([
      makeDateInfo("2026-04-20"),
      makeDateInfo("2026-04-27"),
    ])

    const res = await GET(makeRequest(CRON_SECRET))
    const body = await res.json()

    expect(body.recurrencesSkipped).toBe(1)
    expect(mockPrisma.appointment.createMany).not.toHaveBeenCalled()
  })

  // 9
  it("detects conflicts with existing appointments (time overlap)", async () => {
    const recurrence = makeRecurrence()
    const dates = [
      makeDateInfo("2026-04-20", 9, 50), // 09:00-09:50
      makeDateInfo("2026-04-27", 9, 50), // 09:00-09:50
    ]
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue(dates)

    // Existing appointment overlaps with first date (09:30-10:20 overlaps 09:00-09:50)
    mockPrisma.appointment.findMany.mockResolvedValue([
      makeExisting("2026-04-20", 9, 30, 10, 20),
    ])

    await GET(makeRequest(CRON_SECRET))

    const createCall = mockPrisma.appointment.createMany.mock.calls[0][0]
    expect(createCall.data).toHaveLength(1)
    expect(createCall.data[0].scheduledAt).toEqual(dates[1].scheduledAt)
  })

  // 10
  it("respects bufferBetweenSlots for conflict detection", async () => {
    const recurrence = makeRecurrence({
      professionalProfile: { id: "prof-1", bufferBetweenSlots: 15 },
    })
    // New appointment: 09:00-09:50
    const dates = [makeDateInfo("2026-04-20", 9, 50)]
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue(dates)

    // Existing: 10:00-10:50. Without buffer no conflict (09:50 <= 10:00).
    // With 15min buffer: existingStart-buffer=09:45, existingEnd+buffer=11:05
    // New 09:00-09:50: newStart(09:00) < existingEnd+buffer(11:05) AND newEnd(09:50) > existingStart-buffer(09:45) => conflict
    mockPrisma.appointment.findMany.mockResolvedValue([
      makeExisting("2026-04-20", 10, 0, 10, 50),
    ])

    await GET(makeRequest(CRON_SECRET))

    // All dates conflict, so createMany is NOT called (goes through the update-only path)
    expect(mockPrisma.appointment.createMany).not.toHaveBeenCalled()
    // But lastGeneratedDate should still be updated
    expect(mockPrisma.appointmentRecurrence.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { lastGeneratedDate: new Date("2026-04-20") },
    })
  })

  // 11
  it("creates appointments with correct fields", async () => {
    const recurrence = makeRecurrence({
      id: "rec-42",
      clinicId: "clinic-7",
      professionalProfileId: "prof-3",
      patientId: "patient-5",
      modality: "ONLINE",
    })
    const dates = [makeDateInfo("2026-04-20", 9, 50)]
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue(dates)
    mockPrisma.appointment.findMany.mockResolvedValue([])

    await GET(makeRequest(CRON_SECRET))

    expect(mockPrisma.appointment.createMany).toHaveBeenCalledWith({
      data: [
        {
          clinicId: "clinic-7",
          professionalProfileId: "prof-3",
          patientId: "patient-5",
          recurrenceId: "rec-42",
          scheduledAt: dates[0].scheduledAt,
          endAt: dates[0].endAt,
          modality: "ONLINE",
          status: "AGENDADO",
        },
      ],
    })
  })

  // 12
  it("updates lastGeneratedDate to the last generated date", async () => {
    const recurrence = makeRecurrence()
    const dates = [
      makeDateInfo("2026-04-20"),
      makeDateInfo("2026-04-27"),
      makeDateInfo("2026-05-04"),
    ]
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue(dates)
    mockPrisma.appointment.findMany.mockResolvedValue([])

    await GET(makeRequest(CRON_SECRET))

    // Inside the transaction, update is called with last date
    expect(mockPrisma.appointmentRecurrence.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: {
        lastGeneratedDate: new Date("2026-05-04"),
      },
    })
  })

  // 13
  it("still updates lastGeneratedDate when all dates conflict", async () => {
    const recurrence = makeRecurrence()
    const dates = [makeDateInfo("2026-04-20", 9, 50)]
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([recurrence])
    calculateNextWindowDates.mockReturnValue(dates)

    // Exact overlap: existing 09:00-09:50 conflicts with new 09:00-09:50
    mockPrisma.appointment.findMany.mockResolvedValue([
      makeExisting("2026-04-20", 9, 0, 9, 50),
    ])

    await GET(makeRequest(CRON_SECRET))

    // Should update lastGeneratedDate even though no appointments created
    expect(mockPrisma.appointmentRecurrence.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: {
        lastGeneratedDate: new Date("2026-04-20"),
      },
    })
    // createMany should NOT be called (all-conflict path skips the transaction)
    expect(mockPrisma.appointment.createMany).not.toHaveBeenCalled()
  })

  // 14
  it("handles errors for individual recurrences without failing entire job", async () => {
    const badRecurrence = makeRecurrence({ id: "rec-bad", clinicId: "clinic-2" })
    const goodRecurrence = makeRecurrence({ id: "rec-good", clinicId: "clinic-1" })

    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue([
      badRecurrence,
      goodRecurrence,
    ])

    let callCount = 0
    calculateNextWindowDates.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        throw new Error("Something broke")
      }
      return [makeDateInfo("2026-04-20")]
    })
    mockPrisma.appointment.findMany.mockResolvedValue([])

    const res = await GET(makeRequest(CRON_SECRET))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]).toContain("rec-bad")
    expect(body.errors[0]).toContain("Something broke")
    expect(body.recurrencesProcessed).toBe(1)
  })

  // 15
  it("logs to AuditLog with execution results for each clinic", async () => {
    const recurrences = [
      makeRecurrence({ id: "rec-1", clinicId: "clinic-A" }),
      makeRecurrence({ id: "rec-2", clinicId: "clinic-B" }),
      makeRecurrence({ id: "rec-3", clinicId: "clinic-A" }),
    ]
    mockPrisma.appointmentRecurrence.findMany.mockResolvedValue(recurrences)
    calculateNextWindowDates.mockReturnValue([makeDateInfo("2026-04-20")])
    mockPrisma.appointment.findMany.mockResolvedValue([])

    await GET(makeRequest(CRON_SECRET))

    // Should create audit log for each unique clinic (clinic-A and clinic-B)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2)

    const auditCalls = mockPrisma.auditLog.create.mock.calls.map(
      (c: Array<{ data: Record<string, unknown> }>) => c[0].data
    )
    const clinicIds = auditCalls.map((d: Record<string, unknown>) => d.clinicId)
    expect(clinicIds).toContain("clinic-A")
    expect(clinicIds).toContain("clinic-B")

    // Verify audit log structure
    const firstLog = auditCalls[0] as Record<string, unknown>
    expect(firstLog.userId).toBeNull()
    expect(firstLog.action).toBe("EXTEND_RECURRENCES_JOB_EXECUTED")
    expect(firstLog.entityType).toBe("CronJob")
    expect(firstLog.entityId).toBe("extend-recurrences")
    expect(firstLog.newValues).toEqual(
      expect.objectContaining({
        executionTime: expect.any(Number),
        results: expect.objectContaining({
          recurrencesProcessed: expect.any(Number),
          appointmentsCreated: expect.any(Number),
          recurrencesSkipped: expect.any(Number),
          errorsCount: expect.any(Number),
        }),
      })
    )
  })
})
