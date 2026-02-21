// src/app/agenda/lib/utils.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  formatTime,
  formatDateHeader,
  formatPhone,
  toDateString,
  addMonthsToDate,
  canCancelAppointment,
  hasNotificationConsent,
  canMarkStatus,
  canResendConfirmation,
  isRecurrenceModified,
  isDateException,
  getWeekStart,
  getWeekEnd,
  getWeekDays,
  formatWeekRange,
  formatDayHeader,
  isSameDay,
  isWeekend,
  toDisplayDate,
  toIsoDate,
  toLocalDateTime,
  calculateEndTime,
  toDisplayDateFromDate,
  isSlotInPast,
} from "./utils"
import type { Appointment } from "./types"

// ---------------------------------------------------------------------------
// Helpers to build minimal Appointment objects
// ---------------------------------------------------------------------------
function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt-1",
    scheduledAt: "2026-02-20T10:00:00.000Z",
    endAt: "2026-02-20T11:00:00.000Z",
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
    patient: {
      id: "p-1",
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "11999887766",
      consentWhatsApp: true,
      consentEmail: true,
    },
    professionalProfile: {
      id: "prof-1",
      user: { name: "Dr. Carlos" },
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------
describe("formatTime", () => {
  it("returns first 5 chars from HH:mm:ss", () => {
    expect(formatTime("09:30:00")).toBe("09:30")
  })

  it("returns HH:mm unchanged", () => {
    expect(formatTime("14:15")).toBe("14:15")
  })
})

// ---------------------------------------------------------------------------
// formatDateHeader
// ---------------------------------------------------------------------------
describe("formatDateHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 1, 20, 12, 0)) // 2026-02-20
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows 'Hoje' for today", () => {
    const result = formatDateHeader(new Date(2026, 1, 20))
    expect(result).toMatch(/^Hoje/)
  })

  it("shows 'Amanha' for tomorrow", () => {
    const result = formatDateHeader(new Date(2026, 1, 21))
    expect(result).toMatch(/^Amanha/)
  })

  it("shows 'Ontem' for yesterday", () => {
    const result = formatDateHeader(new Date(2026, 1, 19))
    expect(result).toMatch(/^Ontem/)
  })

  it("shows weekday name for other dates", () => {
    const result = formatDateHeader(new Date(2026, 1, 25)) // Wednesday
    expect(result).not.toMatch(/^Hoje|^Amanha|^Ontem/)
    expect(result).toContain("25/02/2026")
  })
})

// ---------------------------------------------------------------------------
// formatPhone
// ---------------------------------------------------------------------------
describe("formatPhone", () => {
  it("formats 11-digit phone (mobile)", () => {
    expect(formatPhone("11999887766")).toBe("(11) 99988-7766")
  })

  it("formats 10-digit phone (landline)", () => {
    expect(formatPhone("1133445566")).toBe("(11) 3344-5566")
  })

  it("returns original for other lengths", () => {
    expect(formatPhone("123")).toBe("123")
  })

  it("strips non-digit chars before formatting", () => {
    expect(formatPhone("(11) 99988-7766")).toBe("(11) 99988-7766")
  })
})

// ---------------------------------------------------------------------------
// toDateString
// ---------------------------------------------------------------------------
describe("toDateString", () => {
  it("converts Date to YYYY-MM-DD", () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  it("pads single-digit month and day", () => {
    expect(toDateString(new Date(2026, 2, 3))).toBe("2026-03-03")
  })
})

// ---------------------------------------------------------------------------
// addMonthsToDate
// ---------------------------------------------------------------------------
describe("addMonthsToDate", () => {
  it("adds months keeping same day", () => {
    const result = addMonthsToDate(new Date(2026, 0, 15), 2)
    expect(result.getMonth()).toBe(2) // March
    expect(result.getDate()).toBe(15)
  })

  it("clamps to end of month when day overflows", () => {
    // Jan 31 + 1 month → Feb 28 (2026 is not a leap year)
    const result = addMonthsToDate(new Date(2026, 0, 31), 1)
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(28)
  })
})

// ---------------------------------------------------------------------------
// canCancelAppointment
// ---------------------------------------------------------------------------
describe("canCancelAppointment", () => {
  it("returns false for null", () => {
    expect(canCancelAppointment(null)).toBe(false)
  })

  it("returns true for AGENDADO", () => {
    expect(canCancelAppointment(makeAppointment({ status: "AGENDADO" }))).toBe(true)
  })

  it("returns true for CONFIRMADO", () => {
    expect(canCancelAppointment(makeAppointment({ status: "CONFIRMADO" }))).toBe(true)
  })

  it("returns false for FINALIZADO", () => {
    expect(canCancelAppointment(makeAppointment({ status: "FINALIZADO" }))).toBe(false)
  })

  it("returns false for CANCELADO_ACORDADO", () => {
    expect(canCancelAppointment(makeAppointment({ status: "CANCELADO_ACORDADO" }))).toBe(false)
  })

  it("returns false for CANCELADO_FALTA", () => {
    expect(canCancelAppointment(makeAppointment({ status: "CANCELADO_FALTA" }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// hasNotificationConsent
// ---------------------------------------------------------------------------
describe("hasNotificationConsent", () => {
  it("returns false for null", () => {
    expect(hasNotificationConsent(null)).toBe(false)
  })

  it("returns false for non-CONSULTA types", () => {
    expect(hasNotificationConsent(makeAppointment({ type: "TAREFA" }))).toBe(false)
  })

  it("returns false when patient is null", () => {
    expect(hasNotificationConsent(makeAppointment({ patient: null }))).toBe(false)
  })

  it("returns true when patient has WhatsApp consent", () => {
    expect(hasNotificationConsent(makeAppointment({
      patient: { id: "p-1", name: "Maria", email: null, phone: "11999", consentWhatsApp: true, consentEmail: false },
    }))).toBe(true)
  })

  it("returns true when patient has email consent", () => {
    expect(hasNotificationConsent(makeAppointment({
      patient: { id: "p-1", name: "Maria", email: "a@b.com", phone: "11999", consentWhatsApp: false, consentEmail: true },
    }))).toBe(true)
  })

  it("returns false when no consent", () => {
    expect(hasNotificationConsent(makeAppointment({
      patient: { id: "p-1", name: "Maria", email: null, phone: "11999", consentWhatsApp: false, consentEmail: false },
    }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canMarkStatus
// ---------------------------------------------------------------------------
describe("canMarkStatus", () => {
  it("returns false for null", () => {
    expect(canMarkStatus(null)).toBe(false)
  })

  it("returns true for AGENDADO", () => {
    expect(canMarkStatus(makeAppointment({ status: "AGENDADO" }))).toBe(true)
  })

  it("returns false for FINALIZADO", () => {
    expect(canMarkStatus(makeAppointment({ status: "FINALIZADO" }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canResendConfirmation
// ---------------------------------------------------------------------------
describe("canResendConfirmation", () => {
  it("returns false for null", () => {
    expect(canResendConfirmation(null)).toBe(false)
  })

  it("returns false for non-CONSULTA", () => {
    expect(canResendConfirmation(makeAppointment({ type: "TAREFA" }))).toBe(false)
  })

  it("returns false for cancelled status", () => {
    expect(canResendConfirmation(makeAppointment({ status: "CANCELADO_ACORDADO" }))).toBe(false)
  })

  it("returns true for AGENDADO with consent + phone", () => {
    expect(canResendConfirmation(makeAppointment({
      status: "AGENDADO",
      patient: { id: "p-1", name: "Maria", email: null, phone: "11999", consentWhatsApp: true, consentEmail: false },
    }))).toBe(true)
  })

  it("returns true for CONFIRMADO with consent + email", () => {
    expect(canResendConfirmation(makeAppointment({
      status: "CONFIRMADO",
      patient: { id: "p-1", name: "Maria", email: "a@b.com", phone: "", consentWhatsApp: false, consentEmail: true },
    }))).toBe(true)
  })

  it("returns false when no consent channels available", () => {
    expect(canResendConfirmation(makeAppointment({
      patient: { id: "p-1", name: "Maria", email: null, phone: "", consentWhatsApp: false, consentEmail: false },
    }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isRecurrenceModified
// ---------------------------------------------------------------------------
describe("isRecurrenceModified", () => {
  it("returns false when no recurrence", () => {
    expect(isRecurrenceModified(makeAppointment({ recurrence: null }))).toBe(false)
  })

  it("returns false when recurrence has no startTime", () => {
    expect(isRecurrenceModified(makeAppointment({
      recurrence: {
        id: "rec-1",
        recurrenceType: "WEEKLY",
        recurrenceEndType: "INDEFINITE",
        dayOfWeek: 5,
        startTime: "",
        endTime: "11:00",
        duration: 60,
        occurrences: null,
        endDate: null,
        isActive: true,
        exceptions: [],
      },
    }))).toBe(false)
  })

  it("returns false when appointment time matches recurrence startTime", () => {
    // scheduledAt is 10:00 local, recurrence startTime is "10:00"
    const localDate = new Date(2026, 1, 20, 10, 0, 0)
    expect(isRecurrenceModified(makeAppointment({
      scheduledAt: localDate.toISOString(),
      recurrence: {
        id: "rec-1",
        recurrenceType: "WEEKLY",
        recurrenceEndType: "INDEFINITE",
        dayOfWeek: 5,
        startTime: `${String(localDate.getHours()).padStart(2, "0")}:${String(localDate.getMinutes()).padStart(2, "0")}`,
        endTime: "11:00",
        duration: 60,
        occurrences: null,
        endDate: null,
        isActive: true,
        exceptions: [],
      },
    }))).toBe(false)
  })

  it("returns true when appointment time differs from recurrence startTime", () => {
    // Create appointment at 14:30 local time but recurrence says 10:00
    const localDate = new Date(2026, 1, 20, 14, 30, 0)
    expect(isRecurrenceModified(makeAppointment({
      scheduledAt: localDate.toISOString(),
      recurrence: {
        id: "rec-1",
        recurrenceType: "WEEKLY",
        recurrenceEndType: "INDEFINITE",
        dayOfWeek: 5,
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        occurrences: null,
        endDate: null,
        isActive: true,
        exceptions: [],
      },
    }))).toBe(true)
  })

  it("returns true when time differs by minutes only", () => {
    const localDate = new Date(2026, 1, 20, 10, 15, 0)
    expect(isRecurrenceModified(makeAppointment({
      scheduledAt: localDate.toISOString(),
      recurrence: {
        id: "rec-1",
        recurrenceType: "WEEKLY",
        recurrenceEndType: "INDEFINITE",
        dayOfWeek: 5,
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        occurrences: null,
        endDate: null,
        isActive: true,
        exceptions: [],
      },
    }))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isDateException
// ---------------------------------------------------------------------------
describe("isDateException", () => {
  it("returns false for null appointment", () => {
    expect(isDateException(null)).toBe(false)
  })

  it("returns false when no recurrence", () => {
    expect(isDateException(makeAppointment({ recurrence: null }))).toBe(false)
  })

  it("returns true when date is in exceptions list", () => {
    const apt = makeAppointment({
      scheduledAt: new Date(2026, 1, 20, 10, 0).toISOString(),
      recurrence: {
        id: "rec-1",
        recurrenceType: "WEEKLY",
        recurrenceEndType: "INDEFINITE",
        dayOfWeek: 5,
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        occurrences: null,
        endDate: null,
        isActive: true,
        exceptions: ["2026-02-20"],
      },
    })
    expect(isDateException(apt)).toBe(true)
  })

  it("returns false when date is not in exceptions list", () => {
    const apt = makeAppointment({
      scheduledAt: new Date(2026, 1, 20, 10, 0).toISOString(),
      recurrence: {
        id: "rec-1",
        recurrenceType: "WEEKLY",
        recurrenceEndType: "INDEFINITE",
        dayOfWeek: 5,
        startTime: "10:00",
        endTime: "11:00",
        duration: 60,
        occurrences: null,
        endDate: null,
        isActive: true,
        exceptions: ["2026-02-13"],
      },
    })
    expect(isDateException(apt)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getWeekStart / getWeekEnd / getWeekDays
// ---------------------------------------------------------------------------
describe("getWeekStart", () => {
  it("returns Monday for a Wednesday", () => {
    const wed = new Date(2026, 1, 18) // Wed Feb 18
    const start = getWeekStart(wed)
    expect(start.getDay()).toBe(1) // Monday
    expect(start.getDate()).toBe(16)
  })

  it("returns Monday for a Sunday", () => {
    const sun = new Date(2026, 1, 22) // Sun Feb 22
    const start = getWeekStart(sun)
    expect(start.getDay()).toBe(1) // Monday
    expect(start.getDate()).toBe(16)
  })

  it("returns same day for a Monday", () => {
    const mon = new Date(2026, 1, 16)
    const start = getWeekStart(mon)
    expect(start.getDate()).toBe(16)
  })
})

describe("getWeekEnd", () => {
  it("returns Sunday of the same week", () => {
    const wed = new Date(2026, 1, 18)
    const end = getWeekEnd(wed)
    expect(end.getDay()).toBe(0) // Sunday
    expect(end.getDate()).toBe(22)
  })
})

describe("getWeekDays", () => {
  it("returns 7 consecutive days", () => {
    const monday = getWeekStart(new Date(2026, 1, 20))
    const days = getWeekDays(monday)
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1) // Monday
    expect(days[6].getDay()).toBe(0) // Sunday
  })
})

// ---------------------------------------------------------------------------
// formatWeekRange
// ---------------------------------------------------------------------------
describe("formatWeekRange", () => {
  it("same month range", () => {
    const start = new Date(2026, 1, 16)
    const end = new Date(2026, 1, 22)
    expect(formatWeekRange(start, end)).toBe("16 - 22 Fev 2026")
  })

  it("cross-month range", () => {
    const start = new Date(2026, 1, 23)
    const end = new Date(2026, 2, 1)
    expect(formatWeekRange(start, end)).toBe("23 Fev - 01 Mar 2026")
  })

  it("cross-year range", () => {
    const start = new Date(2025, 11, 29)
    const end = new Date(2026, 0, 4)
    expect(formatWeekRange(start, end)).toBe("29 Dez 2025 - 04 Jan 2026")
  })
})

// ---------------------------------------------------------------------------
// formatDayHeader
// ---------------------------------------------------------------------------
describe("formatDayHeader", () => {
  it("returns Portuguese day abbreviation and padded number", () => {
    const monday = new Date(2026, 1, 16)
    expect(formatDayHeader(monday)).toEqual({ dayName: "Seg", dayNumber: "16" })
  })

  it("returns Dom for Sunday", () => {
    const sunday = new Date(2026, 1, 22)
    expect(formatDayHeader(sunday)).toEqual({ dayName: "Dom", dayNumber: "22" })
  })

  it("pads single-digit day", () => {
    const day = new Date(2026, 2, 1)
    expect(formatDayHeader(day).dayNumber).toBe("01")
  })
})

// ---------------------------------------------------------------------------
// isSameDay
// ---------------------------------------------------------------------------
describe("isSameDay", () => {
  it("returns true for same day", () => {
    expect(isSameDay(new Date(2026, 1, 20, 8, 0), new Date(2026, 1, 20, 22, 0))).toBe(true)
  })

  it("returns false for different days", () => {
    expect(isSameDay(new Date(2026, 1, 20), new Date(2026, 1, 21))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isWeekend
// ---------------------------------------------------------------------------
describe("isWeekend", () => {
  it("returns true for Saturday", () => {
    expect(isWeekend(new Date(2026, 1, 21))).toBe(true) // Sat
  })

  it("returns true for Sunday", () => {
    expect(isWeekend(new Date(2026, 1, 22))).toBe(true) // Sun
  })

  it("returns false for weekdays", () => {
    expect(isWeekend(new Date(2026, 1, 20))).toBe(false) // Fri
  })
})

// ---------------------------------------------------------------------------
// toDisplayDate / toIsoDate
// ---------------------------------------------------------------------------
describe("toDisplayDate", () => {
  it("converts YYYY-MM-DD to DD/MM/YYYY", () => {
    expect(toDisplayDate("2026-02-20")).toBe("20/02/2026")
  })

  it("returns invalid input unchanged", () => {
    expect(toDisplayDate("not-a-date")).toBe("not-a-date")
  })

  it("returns empty string unchanged", () => {
    expect(toDisplayDate("")).toBe("")
  })
})

describe("toIsoDate", () => {
  it("converts DD/MM/YYYY to YYYY-MM-DD", () => {
    expect(toIsoDate("20/02/2026")).toBe("2026-02-20")
  })

  it("returns ISO format unchanged", () => {
    expect(toIsoDate("2026-02-20")).toBe("2026-02-20")
  })

  it("returns empty string for empty input", () => {
    expect(toIsoDate("")).toBe("")
  })
})

// ---------------------------------------------------------------------------
// toLocalDateTime
// ---------------------------------------------------------------------------
describe("toLocalDateTime", () => {
  it("creates Date from ISO date + time", () => {
    const result = toLocalDateTime("2026-02-20", "14:30")
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(20)
    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(30)
  })

  it("creates Date from DD/MM/YYYY + time", () => {
    const result = toLocalDateTime("20/02/2026", "09:00")
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(20)
    expect(result.getHours()).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// calculateEndTime
// ---------------------------------------------------------------------------
describe("calculateEndTime", () => {
  it("calculates end time", () => {
    expect(calculateEndTime("10:00", 60)).toBe("11:00")
  })

  it("handles minute overflow", () => {
    expect(calculateEndTime("10:45", 30)).toBe("11:15")
  })

  it("wraps past midnight", () => {
    expect(calculateEndTime("23:30", 60)).toBe("00:30")
  })

  it("returns null for empty start time", () => {
    expect(calculateEndTime("", 60)).toBeNull()
  })

  it("returns null for no duration", () => {
    expect(calculateEndTime("10:00", null)).toBeNull()
    expect(calculateEndTime("10:00", undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// toDisplayDateFromDate
// ---------------------------------------------------------------------------
describe("toDisplayDateFromDate", () => {
  it("converts Date to DD/MM/YYYY", () => {
    expect(toDisplayDateFromDate(new Date(2026, 1, 20))).toBe("20/02/2026")
  })

  it("pads single-digit day and month", () => {
    expect(toDisplayDateFromDate(new Date(2026, 2, 3))).toBe("03/03/2026")
  })
})

// ---------------------------------------------------------------------------
// isSlotInPast
// ---------------------------------------------------------------------------
describe("isSlotInPast", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 1, 20, 14, 0)) // 2026-02-20 14:00
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns true for past slot", () => {
    expect(isSlotInPast("2026-02-20", "10:00")).toBe(true)
  })

  it("returns false for future slot", () => {
    expect(isSlotInPast("2026-02-20", "15:00")).toBe(false)
  })

  it("returns true for past date", () => {
    expect(isSlotInPast("2026-02-19", "16:00")).toBe(true)
  })

  it("returns false for future date", () => {
    expect(isSlotInPast("2026-02-21", "08:00")).toBe(false)
  })
})
