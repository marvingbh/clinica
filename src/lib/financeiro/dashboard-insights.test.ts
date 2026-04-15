import { describe, it, expect, vi } from "vitest"
import { _internal } from "./dashboard-insights"

const {
  buildInadimplencia,
  buildPagamentoAtraso,
  buildCollectionTime,
  buildTicketMedio,
  buildCancelamento,
  buildConcentracao,
  buildCreditsAging,
  buildComparativo,
  buildRevenueByWeekday,
  periodDates,
  prevPeriod,
} = _internal

// ---------------------------------------------------------------------------
// Helpers to build test fixtures
// ---------------------------------------------------------------------------

function makeInvoice(overrides: Partial<{
  status: string
  totalAmount: number
  totalSessions: number
  patientId: string
  professionalProfileId: string
  dueDate: Date | null
  paidAt: Date | null
  createdAt: Date
  patientName: string
  profName: string
}> = {}) {
  return {
    status: overrides.status ?? "PENDENTE",
    totalAmount: overrides.totalAmount ?? 100,
    totalSessions: overrides.totalSessions ?? 1,
    patientId: overrides.patientId ?? "p1",
    professionalProfileId: overrides.professionalProfileId ?? "prof1",
    dueDate: overrides.dueDate ?? null,
    paidAt: overrides.paidAt ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-15"),
    patient: { name: overrides.patientName ?? "Patient A" },
    professionalProfile: { user: { name: overrides.profName ?? "Dr. Silva" } },
  }
}

function makeAppt(overrides: Partial<{
  status: string
  price: number
  scheduledAt: Date
}> = {}) {
  return {
    status: overrides.status ?? "FINALIZADO",
    price: overrides.price ?? 150,
    scheduledAt: overrides.scheduledAt ?? new Date("2026-03-02T10:00:00"), // Monday
  }
}

// ---------------------------------------------------------------------------
// periodDates
// ---------------------------------------------------------------------------

describe("periodDates", () => {
  it("returns month range when month is provided", () => {
    const { start, end } = periodDates(2026, 3)
    expect(start).toEqual(new Date(2026, 2, 1))
    expect(end).toEqual(new Date(2026, 3, 1))
  })

  it("returns full year range when month is null", () => {
    const { start, end } = periodDates(2026, null)
    expect(start).toEqual(new Date(2026, 0, 1))
    expect(end).toEqual(new Date(2027, 0, 1))
  })
})

// ---------------------------------------------------------------------------
// prevPeriod
// ---------------------------------------------------------------------------

describe("prevPeriod", () => {
  it("returns previous month in same year", () => {
    expect(prevPeriod(2026, 5)).toEqual({ year: 2026, month: 4 })
  })

  it("wraps January to December of previous year", () => {
    expect(prevPeriod(2026, 1)).toEqual({ year: 2025, month: 12 })
  })

  it("returns previous year when month is null", () => {
    expect(prevPeriod(2026, null)).toEqual({ year: 2025, month: null })
  })
})

// ---------------------------------------------------------------------------
// buildInadimplencia
// ---------------------------------------------------------------------------

describe("buildInadimplencia", () => {
  it("returns zeros for empty array", () => {
    const result = buildInadimplencia([])
    expect(result).toEqual({ unpaidCount: 0, unpaidAmount: 0, unpaidRate: 0 })
  })

  it("returns zeros when all invoices are PAGO", () => {
    const invoices = [
      makeInvoice({ status: "PAGO", totalAmount: 200 }),
      makeInvoice({ status: "PAGO", totalAmount: 300 }),
    ]
    const result = buildInadimplencia(invoices)
    expect(result.unpaidCount).toBe(0)
    expect(result.unpaidAmount).toBe(0)
    expect(result.unpaidRate).toBe(0)
  })

  it("excludes CANCELADO invoices from non-cancelled set", () => {
    const invoices = [
      makeInvoice({ status: "CANCELADO", totalAmount: 500 }),
      makeInvoice({ status: "CANCELADO", totalAmount: 500 }),
    ]
    const result = buildInadimplencia(invoices)
    // All cancelled -> nonCancelled.length = 0, so rate = 0
    expect(result.unpaidCount).toBe(0)
    expect(result.unpaidAmount).toBe(0)
    expect(result.unpaidRate).toBe(0)
  })

  it("calculates unpaid count, amount, and rate for mixed invoices", () => {
    const invoices = [
      makeInvoice({ status: "PAGO", totalAmount: 100 }),
      makeInvoice({ status: "PENDENTE", totalAmount: 200 }),
      makeInvoice({ status: "ENVIADO", totalAmount: 300 }),
      makeInvoice({ status: "CANCELADO", totalAmount: 999 }),
    ]
    const result = buildInadimplencia(invoices)
    // nonCancelled = 3 (PAGO, PENDENTE, ENVIADO)
    // unpaid = 2 (PENDENTE, ENVIADO)
    expect(result.unpaidCount).toBe(2)
    expect(result.unpaidAmount).toBe(500)
    expect(result.unpaidRate).toBe(Math.round((2 / 3) * 1000) / 1000)
  })

  it("handles division by zero when all are cancelled", () => {
    const invoices = [makeInvoice({ status: "CANCELADO" })]
    const result = buildInadimplencia(invoices)
    expect(result.unpaidRate).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildPagamentoAtraso
// ---------------------------------------------------------------------------

describe("buildPagamentoAtraso", () => {
  it("returns zeros for empty array", () => {
    const result = buildPagamentoAtraso([])
    expect(result).toEqual({
      lateCount: 0, totalPaid: 0, lateAmount: 0, lateRate: 0, avgDaysLate: 0,
    })
  })

  it("returns zeros when no invoices are PAGO", () => {
    const invoices = [makeInvoice({ status: "PENDENTE" })]
    const result = buildPagamentoAtraso(invoices)
    expect(result.totalPaid).toBe(0)
    expect(result.lateCount).toBe(0)
  })

  it("counts only PAGO invoices with both paidAt and dueDate", () => {
    const invoices = [
      makeInvoice({ status: "PAGO", paidAt: new Date("2026-02-01"), dueDate: null }),
      makeInvoice({ status: "PAGO", paidAt: null, dueDate: new Date("2026-01-31") }),
      makeInvoice({
        status: "PAGO",
        paidAt: new Date("2026-02-01"),
        dueDate: new Date("2026-01-31"),
        totalAmount: 100,
      }),
    ]
    const result = buildPagamentoAtraso(invoices)
    expect(result.totalPaid).toBe(1) // only the one with both dates
  })

  it("identifies late payments (paidAt > dueDate)", () => {
    const invoices = [
      makeInvoice({
        status: "PAGO",
        paidAt: new Date("2026-02-05"),
        dueDate: new Date("2026-01-31"),
        totalAmount: 200,
      }),
      makeInvoice({
        status: "PAGO",
        paidAt: new Date("2026-01-30"),
        dueDate: new Date("2026-01-31"),
        totalAmount: 100,
      }),
    ]
    const result = buildPagamentoAtraso(invoices)
    expect(result.lateCount).toBe(1)
    expect(result.lateAmount).toBe(200)
    expect(result.lateRate).toBe(Math.round((1 / 2) * 1000) / 1000) // 0.5
  })

  it("calculates avgDaysLate correctly", () => {
    // 10 days late and 20 days late -> avg = 15
    const invoices = [
      makeInvoice({
        status: "PAGO",
        paidAt: new Date("2026-02-10"),
        dueDate: new Date("2026-01-31"),
        totalAmount: 100,
      }),
      makeInvoice({
        status: "PAGO",
        paidAt: new Date("2026-02-20"),
        dueDate: new Date("2026-01-31"),
        totalAmount: 100,
      }),
    ]
    const result = buildPagamentoAtraso(invoices)
    expect(result.lateCount).toBe(2)
    expect(result.avgDaysLate).toBe(15)
  })

  it("returns avgDaysLate 0 when all paid on time", () => {
    const invoices = [
      makeInvoice({
        status: "PAGO",
        paidAt: new Date("2026-01-29"),
        dueDate: new Date("2026-01-31"),
      }),
    ]
    const result = buildPagamentoAtraso(invoices)
    expect(result.lateCount).toBe(0)
    expect(result.avgDaysLate).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildCollectionTime
// ---------------------------------------------------------------------------

describe("buildCollectionTime", () => {
  it("returns null for both when arrays are empty", () => {
    const result = buildCollectionTime([], [])
    expect(result).toEqual({ avgCollectionDays: null, prevAvgCollectionDays: null })
  })

  it("calculates avg collection days for a single invoice", () => {
    const current = [{
      createdAt: new Date("2026-01-01"),
      paidAt: new Date("2026-01-11"), // 10 days
    }]
    const result = buildCollectionTime(current, [])
    expect(result.avgCollectionDays).toBe(10)
    expect(result.prevAvgCollectionDays).toBeNull()
  })

  it("averages multiple invoices", () => {
    const current = [
      { createdAt: new Date("2026-01-01"), paidAt: new Date("2026-01-11") }, // 10 days
      { createdAt: new Date("2026-01-01"), paidAt: new Date("2026-01-21") }, // 20 days
    ]
    const previous = [
      { createdAt: new Date("2025-12-01"), paidAt: new Date("2025-12-31") }, // 30 days
    ]
    const result = buildCollectionTime(current, previous)
    expect(result.avgCollectionDays).toBe(15) // (10+20)/2
    expect(result.prevAvgCollectionDays).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// buildTicketMedio
// ---------------------------------------------------------------------------

describe("buildTicketMedio", () => {
  it("returns 0 ticket when no invoices", () => {
    const result = buildTicketMedio([])
    expect(result.avgTicket).toBe(0)
    expect(result.avgTicketByProfessional).toEqual([])
  })

  it("excludes CANCELADO invoices", () => {
    const invoices = [
      makeInvoice({ status: "CANCELADO", totalAmount: 999, totalSessions: 5 }),
      makeInvoice({ status: "PAGO", totalAmount: 200, totalSessions: 2 }),
    ]
    const result = buildTicketMedio(invoices)
    expect(result.avgTicket).toBe(100) // 200/2
  })

  it("returns 0 when total sessions is 0", () => {
    const invoices = [
      makeInvoice({ status: "PAGO", totalAmount: 200, totalSessions: 0 }),
    ]
    const result = buildTicketMedio(invoices)
    expect(result.avgTicket).toBe(0)
  })

  it("breaks down by professional", () => {
    const invoices = [
      makeInvoice({
        status: "PAGO", totalAmount: 300, totalSessions: 3,
        professionalProfileId: "prof1", profName: "Dr. A",
      }),
      makeInvoice({
        status: "PAGO", totalAmount: 400, totalSessions: 2,
        professionalProfileId: "prof2", profName: "Dr. B",
      }),
    ]
    const result = buildTicketMedio(invoices)
    expect(result.avgTicket).toBe(140) // 700/5
    expect(result.avgTicketByProfessional).toHaveLength(2)

    const profA = result.avgTicketByProfessional.find(p => p.professionalId === "prof1")!
    expect(profA.avgTicket).toBe(100) // 300/3

    const profB = result.avgTicketByProfessional.find(p => p.professionalId === "prof2")!
    expect(profB.avgTicket).toBe(200) // 400/2
  })

  it("aggregates multiple invoices for the same professional", () => {
    const invoices = [
      makeInvoice({
        status: "PAGO", totalAmount: 100, totalSessions: 1,
        professionalProfileId: "prof1", profName: "Dr. A",
      }),
      makeInvoice({
        status: "PAGO", totalAmount: 200, totalSessions: 2,
        professionalProfileId: "prof1", profName: "Dr. A",
      }),
    ]
    const result = buildTicketMedio(invoices)
    expect(result.avgTicketByProfessional).toHaveLength(1)
    expect(result.avgTicketByProfessional[0].avgTicket).toBe(100) // 300/3
  })
})

// ---------------------------------------------------------------------------
// buildCancelamento
// ---------------------------------------------------------------------------

describe("buildCancelamento", () => {
  it("returns zeros for empty array", () => {
    const result = buildCancelamento([])
    expect(result).toEqual({
      totalAppointments: 0, cancelledCount: 0, faltaCount: 0, cancellationRate: 0,
    })
  })

  it("counts all three cancelled statuses", () => {
    const appointments = [
      makeAppt({ status: "CANCELADO_ACORDADO" }),
      makeAppt({ status: "CANCELADO_FALTA" }),
      makeAppt({ status: "CANCELADO_PROFISSIONAL" }),
      makeAppt({ status: "FINALIZADO" }),
    ]
    const result = buildCancelamento(appointments)
    expect(result.totalAppointments).toBe(4)
    expect(result.cancelledCount).toBe(3)
    expect(result.cancellationRate).toBe(0.75)
  })

  it("counts falta subset separately", () => {
    const appointments = [
      makeAppt({ status: "CANCELADO_FALTA" }),
      makeAppt({ status: "CANCELADO_FALTA" }),
      makeAppt({ status: "CANCELADO_ACORDADO" }),
      makeAppt({ status: "FINALIZADO" }),
    ]
    const result = buildCancelamento(appointments)
    expect(result.faltaCount).toBe(2)
    expect(result.cancelledCount).toBe(3)
  })

  it("returns rate 0 when no appointments are cancelled", () => {
    const appointments = [
      makeAppt({ status: "FINALIZADO" }),
      makeAppt({ status: "CONFIRMADO" }),
    ]
    const result = buildCancelamento(appointments)
    expect(result.cancelledCount).toBe(0)
    expect(result.cancellationRate).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildConcentracao
// ---------------------------------------------------------------------------

describe("buildConcentracao", () => {
  it("returns empty for no invoices", () => {
    const result = buildConcentracao([])
    expect(result.topPatients).toEqual([])
    expect(result.top3Concentration).toBe(0)
  })

  it("returns single patient as 100% concentration", () => {
    const invoices = [makeInvoice({ patientId: "p1", totalAmount: 500, status: "PAGO" })]
    const result = buildConcentracao(invoices)
    expect(result.topPatients).toHaveLength(1)
    expect(result.top3Concentration).toBe(1) // 100%
  })

  it("excludes CANCELADO invoices", () => {
    const invoices = [
      makeInvoice({ patientId: "p1", totalAmount: 500, status: "CANCELADO" }),
      makeInvoice({ patientId: "p2", totalAmount: 200, status: "PAGO" }),
    ]
    const result = buildConcentracao(invoices)
    expect(result.topPatients).toHaveLength(1)
    expect(result.topPatients[0].patientId).toBe("p2")
  })

  it("limits to top 5 patients sorted by amount", () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      makeInvoice({
        patientId: `p${i}`,
        patientName: `Patient ${i}`,
        totalAmount: (i + 1) * 100,
        status: "PAGO",
      }),
    )
    const result = buildConcentracao(invoices)
    expect(result.topPatients).toHaveLength(5)
    // Highest amount first: p5 (600), p4 (500), p3 (400), p2 (300), p1 (200)
    expect(result.topPatients[0].patientId).toBe("p5")
    expect(result.topPatients[4].patientId).toBe("p1")
  })

  it("computes top3Concentration as fraction of total revenue", () => {
    // p1=400, p2=300, p3=200, p4=100 => total=1000
    // top3 = 400+300+200 = 900  => 0.9
    const invoices = [
      makeInvoice({ patientId: "p1", totalAmount: 400, status: "PAGO", patientName: "A" }),
      makeInvoice({ patientId: "p2", totalAmount: 300, status: "PAGO", patientName: "B" }),
      makeInvoice({ patientId: "p3", totalAmount: 200, status: "PAGO", patientName: "C" }),
      makeInvoice({ patientId: "p4", totalAmount: 100, status: "PAGO", patientName: "D" }),
    ]
    const result = buildConcentracao(invoices)
    expect(result.top3Concentration).toBe(0.9)
  })

  it("returns 0 concentration when total revenue is 0", () => {
    const invoices = [
      makeInvoice({ patientId: "p1", totalAmount: 0, status: "PAGO" }),
    ]
    const result = buildConcentracao(invoices)
    expect(result.top3Concentration).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildCreditsAging
// ---------------------------------------------------------------------------

describe("buildCreditsAging", () => {
  it("returns zeroed buckets for empty array", () => {
    const result = buildCreditsAging([], new Date())
    expect(result.credits0to30).toEqual({ count: 0, totalDays: 0 })
    expect(result.credits31to60).toEqual({ count: 0, totalDays: 0 })
    expect(result.credits61to90).toEqual({ count: 0, totalDays: 0 })
    expect(result.creditsOver90).toEqual({ count: 0, totalDays: 0 })
  })

  it("places a 10-day-old credit in 0-30 bucket", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-14"))
    const now = new Date()
    const credits = [{ createdAt: new Date("2026-04-04") }] // 10 days ago
    const result = buildCreditsAging(credits, now)
    expect(result.credits0to30.count).toBe(1)
    expect(result.credits0to30.totalDays).toBe(10) // avgDays since count=1
    vi.useRealTimers()
  })

  it("places a 45-day-old credit in 31-60 bucket", () => {
    const now = new Date("2026-04-14")
    // 45 days before Apr 14 = Feb 28
    const credits = [{ createdAt: new Date("2026-02-28") }]
    const result = buildCreditsAging(credits, now)
    expect(result.credits31to60.count).toBe(1)
  })

  it("places a 75-day-old credit in 61-90 bucket", () => {
    const now = new Date("2026-04-14")
    // 75 days before Apr 14 = Jan 29
    const credits = [{ createdAt: new Date("2026-01-29") }]
    const result = buildCreditsAging(credits, now)
    expect(result.credits61to90.count).toBe(1)
  })

  it("places a 100-day-old credit in over-90 bucket", () => {
    const now = new Date("2026-04-14")
    // 100 days before Apr 14 = Jan 4
    const credits = [{ createdAt: new Date("2026-01-04") }]
    const result = buildCreditsAging(credits, now)
    expect(result.creditsOver90.count).toBe(1)
  })

  it("calculates average days per bucket", () => {
    const now = new Date("2026-04-14")
    const credits = [
      { createdAt: new Date("2026-04-04") }, // 10 days
      { createdAt: new Date("2026-03-25") }, // 20 days
    ]
    const result = buildCreditsAging(credits, now)
    expect(result.credits0to30.count).toBe(2)
    expect(result.credits0to30.totalDays).toBe(15) // (10+20)/2
  })

  it("distributes credits across multiple buckets", () => {
    const now = new Date("2026-04-14")
    const credits = [
      { createdAt: new Date("2026-04-10") },  // 4 days -> 0-30
      { createdAt: new Date("2026-03-01") },  // 44 days -> 31-60
      { createdAt: new Date("2026-01-01") },  // 103 days -> 90+
    ]
    const result = buildCreditsAging(credits, now)
    expect(result.credits0to30.count).toBe(1)
    expect(result.credits31to60.count).toBe(1)
    expect(result.credits61to90.count).toBe(0)
    expect(result.creditsOver90.count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// buildComparativo
// ---------------------------------------------------------------------------

describe("buildComparativo", () => {
  it("returns nulls when previous period has zero revenue", () => {
    const current = [makeInvoice({ status: "PAGO", totalAmount: 100, totalSessions: 5 })]
    const previous: ReturnType<typeof makeInvoice>[] = []
    const result = buildComparativo(current, previous)
    expect(result.deltaFaturado).toBeNull()
    expect(result.deltaPago).toBeNull()
    expect(result.deltaSessions).toBeNull()
  })

  it("returns null deltas when both periods are zero", () => {
    const result = buildComparativo([], [])
    expect(result.deltaFaturado).toBeNull()
    expect(result.prevFaturado).toBe(0)
  })

  it("calculates positive delta percentage", () => {
    const current = [makeInvoice({ status: "PAGO", totalAmount: 200, totalSessions: 4 })]
    const previous = [makeInvoice({ status: "PAGO", totalAmount: 100, totalSessions: 2 })]
    const result = buildComparativo(current, previous)
    // delta = (200 - 100) / 100 * 100 = 100%
    expect(result.deltaFaturado).toBe(100)
    expect(result.deltaPago).toBe(100)
    expect(result.deltaSessions).toBe(100)
  })

  it("calculates negative delta percentage", () => {
    const current = [makeInvoice({ status: "PAGO", totalAmount: 50, totalSessions: 1 })]
    const previous = [makeInvoice({ status: "PAGO", totalAmount: 200, totalSessions: 4 })]
    const result = buildComparativo(current, previous)
    // delta = (50 - 200) / 200 * 100 = -75%
    expect(result.deltaFaturado).toBe(-75)
  })

  it("excludes CANCELADO invoices from both periods", () => {
    const current = [
      makeInvoice({ status: "PAGO", totalAmount: 100, totalSessions: 1 }),
      makeInvoice({ status: "CANCELADO", totalAmount: 999, totalSessions: 10 }),
    ]
    const previous = [
      makeInvoice({ status: "PAGO", totalAmount: 100, totalSessions: 1 }),
    ]
    const result = buildComparativo(current, previous)
    expect(result.deltaFaturado).toBe(0) // 100 vs 100
    expect(result.deltaSessions).toBe(0)
  })

  it("provides previous period totals", () => {
    const previous = [
      makeInvoice({ status: "PAGO", totalAmount: 300, totalSessions: 5 }),
      makeInvoice({ status: "PENDENTE", totalAmount: 200, totalSessions: 3 }),
    ]
    const result = buildComparativo([], previous)
    expect(result.prevFaturado).toBe(500)
    expect(result.prevPago).toBe(300)
    expect(result.prevSessions).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// buildRevenueByWeekday
// ---------------------------------------------------------------------------

describe("buildRevenueByWeekday", () => {
  it("returns 7 weekdays with zero revenue for empty array", () => {
    const result = buildRevenueByWeekday([])
    expect(result).toHaveLength(7)
    expect(result[0].day).toBe("Dom")
    expect(result[1].day).toBe("Seg")
    expect(result[6].day).toBe("Sáb")
    for (const w of result) {
      expect(w.revenue).toBe(0)
      expect(w.sessions).toBe(0)
    }
  })

  it("only includes FINALIZADO appointments", () => {
    const mon = new Date(2026, 2, 2, 10, 0, 0) // Mon Mar 2 2026
    const appointments = [
      makeAppt({ status: "FINALIZADO", price: 100, scheduledAt: mon }),
      makeAppt({ status: "AGENDADO", price: 200, scheduledAt: mon }),
      makeAppt({ status: "CANCELADO_FALTA", price: 300, scheduledAt: mon }),
    ]
    const result = buildRevenueByWeekday(appointments)
    const monday = result[1] // getDay()=1 for Monday
    expect(monday.revenue).toBe(100)
    expect(monday.sessions).toBe(1)
  })

  it("groups revenue by day of week", () => {
    const mon1 = new Date(2026, 2, 2, 10, 0, 0)  // Mon
    const mon2 = new Date(2026, 2, 9, 10, 0, 0)  // Mon
    const wed = new Date(2026, 2, 4, 10, 0, 0)   // Wed
    const appointments = [
      makeAppt({ status: "FINALIZADO", price: 100, scheduledAt: mon1 }),
      makeAppt({ status: "FINALIZADO", price: 150, scheduledAt: mon2 }),
      makeAppt({ status: "FINALIZADO", price: 200, scheduledAt: wed }),
    ]
    const result = buildRevenueByWeekday(appointments)
    expect(result[1].revenue).toBe(250) // Mon: 100+150
    expect(result[1].sessions).toBe(2)
    expect(result[3].revenue).toBe(200) // Wed
    expect(result[3].sessions).toBe(1)
  })

  it("handles null/undefined price as 0", () => {
    const mon = new Date(2026, 2, 2, 10, 0, 0) // Mon
    const appointments = [
      { status: "FINALIZADO", price: null, scheduledAt: mon },
    ]
    const result = buildRevenueByWeekday(appointments)
    expect(result[1].revenue).toBe(0)
    expect(result[1].sessions).toBe(1)
  })
})
