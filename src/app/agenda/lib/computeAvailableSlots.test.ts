import { describe, it, expect } from "vitest"
import { computeSlotsForDay } from "./computeAvailableSlots"
import type { Appointment, AvailabilityRule, AvailabilityException, BiweeklyHint } from "./types"

// Helper to create a minimal appointment for tests
function makeAppointment(overrides: Partial<Appointment> & { scheduledAt: string; endAt: string }): Appointment {
  return {
    id: "apt-1",
    status: "AGENDADO",
    type: "CONSULTA",
    title: null,
    blocksTime: true,
    modality: "PRESENCIAL",
    notes: null,
    price: null,
    cancellationReason: null,
    cancelledAt: null,
    groupId: null,
    recurrence: null,
    patient: { id: "p1", name: "Test Patient", email: null, phone: "11999999999" },
    professionalProfile: { id: "prof-1", user: { name: "Dr. Test" } },
    ...overrides,
  }
}

function makeRule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: "rule-1",
    dayOfWeek: 1, // Monday
    startTime: "08:00",
    endTime: "12:00",
    isActive: true,
    ...overrides,
  }
}

describe("computeSlotsForDay", () => {
  // Monday 2026-02-23
  const monday = new Date("2026-02-23T12:00:00")

  it("returns empty slots when no rules and no appointments", () => {
    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [],
      availabilityExceptions: [],
      appointments: [],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    expect(result.slots).toEqual([])
    expect(result.fullDayBlock).toBeNull()
  })

  it("generates slots from availability rules", () => {
    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    // 08:00-10:00 with 50min slots: 08:00, 08:50 (next would be 09:40+50=10:30 > 10:00)
    expect(result.slots).toHaveLength(2)
    expect(result.slots[0].time).toBe("08:00")
    expect(result.slots[0].isAvailable).toBe(true)
    expect(result.slots[1].time).toBe("08:50")
    expect(result.slots[1].isAvailable).toBe(true)
  })

  it("marks slot as unavailable when appointment exists", () => {
    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [
        makeAppointment({
          scheduledAt: "2026-02-23T08:00:00",
          endAt: "2026-02-23T08:50:00",
        }),
      ],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    expect(result.slots[0].time).toBe("08:00")
    expect(result.slots[0].isAvailable).toBe(false)
    expect(result.slots[0].appointments).toHaveLength(1)
    // Second slot should still be available
    expect(result.slots[1].isAvailable).toBe(true)
  })

  it("cancelled appointments do not block the slot", () => {
    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [
        makeAppointment({
          scheduledAt: "2026-02-23T08:00:00",
          endAt: "2026-02-23T08:50:00",
          status: "CANCELADO_ACORDADO",
        }),
      ],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    expect(result.slots[0].isAvailable).toBe(true)
    expect(result.slots[0].appointments).toHaveLength(1) // still listed
  })

  it("returns full day block when exception exists", () => {
    const exception: AvailabilityException = {
      id: "ex-1",
      date: "2026-02-23",
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: null,
      endTime: null,
      reason: "Feriado",
      isClinicWide: true,
      professionalName: null,
    }

    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule()],
      availabilityExceptions: [exception],
      appointments: [],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    expect(result.slots).toEqual([])
    expect(result.fullDayBlock).toEqual({
      reason: "Feriado",
      isClinicWide: true,
    })
  })

  it("marks slot as blocked when time-specific exception exists", () => {
    const exception: AvailabilityException = {
      id: "ex-1",
      date: "2026-02-23",
      dayOfWeek: null,
      isRecurring: false,
      isAvailable: false,
      startTime: "08:00",
      endTime: "09:00",
      reason: "Reuniao interna",
      isClinicWide: false,
      professionalName: null,
    }

    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [exception],
      appointments: [],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    expect(result.slots[0].time).toBe("08:00")
    expect(result.slots[0].isAvailable).toBe(false)
    expect(result.slots[0].isBlocked).toBe(true)
    expect(result.slots[0].blockReason).toBe("Reuniao interna")
    // Second slot (08:50) is within exception range 08:00-09:00, also blocked
    expect(result.slots[1].time).toBe("08:50")
    expect(result.slots[1].isBlocked).toBe(true)
  })

  it("attaches biweekly hints to available empty slots", () => {
    const hints: BiweeklyHint[] = [
      {
        time: "08:00",
        professionalProfileId: "prof-1",
        patientName: "Maria",
        appointmentId: "adj-1",
      },
    ]

    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [],
      biweeklyHints: hints,
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    expect(result.slots[0].biweeklyHint).toBeDefined()
    expect(result.slots[0].biweeklyHint!.patientName).toBe("Maria")
  })

  it("does not attach biweekly hint to occupied slot", () => {
    const hints: BiweeklyHint[] = [
      {
        time: "08:00",
        professionalProfileId: "prof-1",
        patientName: "Maria",
        appointmentId: "adj-1",
      },
    ]

    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [
        makeAppointment({
          scheduledAt: "2026-02-23T08:00:00",
          endAt: "2026-02-23T08:50:00",
        }),
      ],
      biweeklyHints: hints,
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    expect(result.slots[0].biweeklyHint).toBeUndefined()
  })

  it("non-blocking appointments do not block the slot", () => {
    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [
        makeAppointment({
          scheduledAt: "2026-02-23T08:00:00",
          endAt: "2026-02-23T08:15:00",
          type: "LEMBRETE",
          blocksTime: false,
        }),
      ],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    // Slot has the appointment listed but is still available (non-blocking)
    expect(result.slots[0].isAvailable).toBe(true)
    expect(result.slots[0].appointments).toHaveLength(1)
  })

  it("includes appointments at non-standard times", () => {
    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [
        makeAppointment({
          id: "apt-offgrid",
          scheduledAt: "2026-02-23T09:15:00",
          endAt: "2026-02-23T10:05:00",
        }),
      ],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    // Should have 08:00, 08:50 from rules + 09:15 extra slot
    const times = result.slots.map(s => s.time)
    expect(times).toContain("09:15")
    const extraSlot = result.slots.find(s => s.time === "09:15")
    expect(extraSlot?.isAvailable).toBe(false)
    expect(extraSlot?.appointments).toHaveLength(1)
  })

  it("handles group sessions occupying slots", () => {
    const result = computeSlotsForDay({
      date: monday,
      availabilityRules: [makeRule({ startTime: "08:00", endTime: "10:00" })],
      availabilityExceptions: [],
      appointments: [],
      groupSessions: [{
        groupId: "g1",
        groupName: "Group 1",
        scheduledAt: "2026-02-23T07:30:00",
        endAt: "2026-02-23T09:00:00",
        professionalProfileId: "prof-1",
        professionalName: "Dr. Test",
        participants: [],
      }],
      appointmentDuration: 50,
      selectedProfessionalId: "prof-1",
    })

    // 08:00 (480 min) — group starts at 7:30 (450) and ends at 9:00 (540). 450 < 480 < 540 → occupied
    expect(result.slots[0].time).toBe("08:00")
    expect(result.slots[0].isAvailable).toBe(false)
    // 08:50 (530 min) — 450 < 530 < 540 → occupied
    expect(result.slots[1].time).toBe("08:50")
    expect(result.slots[1].isAvailable).toBe(false)
  })
})
