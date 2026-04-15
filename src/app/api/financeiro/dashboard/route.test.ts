import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock withFeatureAuth to pass through the handler directly
vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

// Mock Prisma
const mockInvoiceFindMany = vi.fn()
const mockSessionCreditCount = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findMany: (...args: unknown[]) => mockInvoiceFindMany(...args) },
    sessionCredit: { count: (...args: unknown[]) => mockSessionCreditCount(...args) },
  },
}))

import { GET } from "./route"

// --- Helpers ---

const mockAdmin = {
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: "prof-1",
}

const mockProfessional = {
  clinicId: "clinic-1",
  role: "PROFESSIONAL" as const,
  professionalProfileId: "prof-2",
}

function makeRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/financeiro/dashboard")
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url)
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    referenceMonth: 1,
    referenceYear: 2026,
    status: "PENDENTE",
    totalAmount: { toNumber: () => 100 },
    totalSessions: 4,
    creditsApplied: 1,
    extrasAdded: 0,
    invoiceType: "MONTHLY_FIXED",
    professionalProfileId: "prof-1",
    professionalProfile: { user: { name: "Dr. Ana" } },
    patientId: "patient-1",
    ...overrides,
  }
}

async function callGET(
  params?: Record<string, string>,
  user = mockAdmin
) {
  const handler = GET as Function
  const res = await handler(makeRequest(params), { user })
  return res.json()
}

// --- Tests ---

describe("GET /api/financeiro/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoiceFindMany.mockResolvedValue([])
    mockSessionCreditCount.mockResolvedValue(0)
  })

  // 1. Returns year totals with no invoices (all zeros)
  it("returns all-zero totals when there are no invoices", async () => {
    const body = await callGET({ year: "2026" })

    expect(body.year).toBe(2026)
    expect(body.totalFaturado).toBe(0)
    expect(body.totalPendente).toBe(0)
    expect(body.totalEnviado).toBe(0)
    expect(body.totalParcial).toBe(0)
    expect(body.totalPago).toBe(0)
    expect(body.totalSessions).toBe(0)
    expect(body.totalCredits).toBe(0)
    expect(body.totalExtras).toBe(0)
    expect(body.invoiceCount).toBe(0)
    expect(body.pendingCount).toBe(0)
    expect(body.enviadoCount).toBe(0)
    expect(body.parcialCount).toBe(0)
    expect(body.paidCount).toBe(0)
    expect(body.byMonth).toEqual({})
    expect(body.byProfessional).toEqual([])
    expect(body.paymentsByDay).toEqual([])
  })

  // 2. Sums totalFaturado correctly from multiple invoices
  it("sums totalFaturado correctly from multiple invoices", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({ totalAmount: 150, status: "PAGO" }),
      makeInvoice({ totalAmount: 250, status: "PENDENTE" }),
      makeInvoice({ totalAmount: 100, status: "ENVIADO" }),
    ])

    const body = await callGET({ year: "2026" })

    expect(body.totalFaturado).toBe(500)
  })

  // 3. Counts by status correctly
  it("counts by status (pendingCount, enviadoCount, parcialCount, paidCount)", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({ status: "PENDENTE", totalAmount: 100 }),
      makeInvoice({ status: "PENDENTE", totalAmount: 200 }),
      makeInvoice({ status: "ENVIADO", totalAmount: 150 }),
      makeInvoice({ status: "PARCIAL", totalAmount: 50 }),
      makeInvoice({ status: "PAGO", totalAmount: 300 }),
      makeInvoice({ status: "PAGO", totalAmount: 100 }),
    ])

    const body = await callGET({ year: "2026" })

    expect(body.pendingCount).toBe(2)
    expect(body.enviadoCount).toBe(1)
    expect(body.parcialCount).toBe(1)
    expect(body.paidCount).toBe(2)
    expect(body.totalPendente).toBe(300)
    expect(body.totalEnviado).toBe(150)
    expect(body.totalParcial).toBe(50)
    expect(body.totalPago).toBe(400)
  })

  // 4. Groups by month correctly
  it("groups invoices by month", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({ referenceMonth: 1, status: "PAGO", totalAmount: 100 }),
      makeInvoice({ referenceMonth: 1, status: "PENDENTE", totalAmount: 200 }),
      makeInvoice({ referenceMonth: 3, status: "ENVIADO", totalAmount: 150 }),
    ])

    const body = await callGET({ year: "2026" })

    expect(body.byMonth[1].faturado).toBe(300)
    expect(body.byMonth[1].pago).toBe(100)
    expect(body.byMonth[1].pendente).toBe(200)
    expect(body.byMonth[1].invoiceCount).toBe(2)
    expect(body.byMonth[3].faturado).toBe(150)
    expect(body.byMonth[3].enviado).toBe(150)
    expect(body.byMonth[3].invoiceCount).toBe(1)
    expect(body.byMonth[2]).toBeUndefined()
  })

  // 5. Groups by professional with correct name and patient count (Set dedup)
  it("groups by professional with deduplicated patient count", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({
        professionalProfileId: "prof-1",
        professionalProfile: { user: { name: "Dr. Ana" } },
        patientId: "patient-1",
        totalAmount: 100,
        status: "PAGO",
      }),
      makeInvoice({
        professionalProfileId: "prof-1",
        professionalProfile: { user: { name: "Dr. Ana" } },
        patientId: "patient-1", // same patient — should dedup
        totalAmount: 200,
        status: "PENDENTE",
      }),
      makeInvoice({
        professionalProfileId: "prof-1",
        professionalProfile: { user: { name: "Dr. Ana" } },
        patientId: "patient-2", // different patient
        totalAmount: 50,
        status: "PAGO",
      }),
    ])

    const body = await callGET({ year: "2026" })

    expect(body.byProfessional).toHaveLength(1)
    expect(body.byProfessional[0].id).toBe("prof-1")
    expect(body.byProfessional[0].name).toBe("Dr. Ana")
    expect(body.byProfessional[0].patientCount).toBe(2) // deduplicated
    expect(body.byProfessional[0].faturado).toBe(350)
    expect(body.byProfessional[0].pago).toBe(150)
    expect(body.byProfessional[0].pendente).toBe(200)
    expect(body.byProfessional[0].invoiceCount).toBe(3)
  })

  // 6. Sorts byProfessional by faturado descending
  it("sorts byProfessional by faturado descending", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({
        professionalProfileId: "prof-1",
        professionalProfile: { user: { name: "Dr. Ana" } },
        totalAmount: 100,
        status: "PAGO",
      }),
      makeInvoice({
        professionalProfileId: "prof-2",
        professionalProfile: { user: { name: "Dr. Bruno" } },
        totalAmount: 500,
        status: "PAGO",
      }),
      makeInvoice({
        professionalProfileId: "prof-3",
        professionalProfile: { user: { name: "Dr. Carla" } },
        totalAmount: 300,
        status: "PAGO",
      }),
    ])

    const body = await callGET({ year: "2026" })

    expect(body.byProfessional).toHaveLength(3)
    expect(body.byProfessional[0].name).toBe("Dr. Bruno")
    expect(body.byProfessional[1].name).toBe("Dr. Carla")
    expect(body.byProfessional[2].name).toBe("Dr. Ana")
  })

  // 7. Applies derived group status for PER_SESSION invoices
  it("applies derived group status for PER_SESSION invoices", async () => {
    // Two PER_SESSION invoices for same patient/prof/month — one PAGO, one PENDENTE
    // deriveGroupStatus(["PAGO", "PENDENTE"]) => "PARCIAL"
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({
        invoiceType: "PER_SESSION",
        status: "PAGO",
        totalAmount: 100,
        patientId: "patient-1",
        professionalProfileId: "prof-1",
        referenceMonth: 1,
        referenceYear: 2026,
      }),
      makeInvoice({
        invoiceType: "PER_SESSION",
        status: "PENDENTE",
        totalAmount: 100,
        patientId: "patient-1",
        professionalProfileId: "prof-1",
        referenceMonth: 1,
        referenceYear: 2026,
      }),
    ])

    const body = await callGET({ year: "2026" })

    // Both should be treated as PARCIAL after deriveGroupStatus
    expect(body.parcialCount).toBe(2)
    expect(body.totalParcial).toBe(200)
    // Original PAGO/PENDENTE counts should be 0
    expect(body.paidCount).toBe(0)
    expect(body.pendingCount).toBe(0)
  })

  // 8. MONTHLY invoices keep their original status
  it("keeps original status for MONTHLY_FIXED invoices", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({
        invoiceType: "MONTHLY_FIXED",
        status: "PAGO",
        totalAmount: 500,
        patientId: "patient-1",
        professionalProfileId: "prof-1",
        referenceMonth: 1,
        referenceYear: 2026,
      }),
      makeInvoice({
        invoiceType: "MONTHLY_FIXED",
        status: "PENDENTE",
        totalAmount: 300,
        patientId: "patient-1",
        professionalProfileId: "prof-1",
        referenceMonth: 1,
        referenceYear: 2026,
      }),
    ])

    const body = await callGET({ year: "2026" })

    // These are MONTHLY_FIXED, so statuses remain as-is (no grouping)
    expect(body.paidCount).toBe(1)
    expect(body.pendingCount).toBe(1)
    expect(body.totalPago).toBe(500)
    expect(body.totalPendente).toBe(300)
  })

  // 9. Returns paymentsByDay only when month param is provided
  it("returns empty paymentsByDay when no month param", async () => {
    const body = await callGET({ year: "2026" })

    expect(body.paymentsByDay).toEqual([])
    expect(body.month).toBeNull()
  })

  it("returns paymentsByDay when month param is provided", async () => {
    // First call: main invoices query
    mockInvoiceFindMany.mockResolvedValueOnce([])
    // Second call: paid invoices for paymentsByDay
    mockInvoiceFindMany.mockResolvedValueOnce([
      { paidAt: new Date(2026, 0, 5), totalAmount: 200 },
      { paidAt: new Date(2026, 0, 5), totalAmount: 100 },
      { paidAt: new Date(2026, 0, 10), totalAmount: 300 },
    ])

    const body = await callGET({ year: "2026", month: "1" })

    expect(body.month).toBe(1)
    expect(body.paymentsByDay).toHaveLength(31) // January has 31 days
    // Day 5 should have both payments
    expect(body.paymentsByDay[4]).toEqual({ day: 5, amount: 300, count: 2, cumulative: 300 })
    // Day 10 should have one payment
    expect(body.paymentsByDay[9]).toEqual({ day: 10, amount: 300, count: 1, cumulative: 600 })
    // Day 1 should be empty
    expect(body.paymentsByDay[0]).toEqual({ day: 1, amount: 0, count: 0, cumulative: 0 })
  })

  // 10. paymentsByDay has correct cumulative totals
  it("paymentsByDay accumulates cumulative totals across days", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([])
    mockInvoiceFindMany.mockResolvedValueOnce([
      { paidAt: new Date(2026, 1, 1), totalAmount: 100 },
      { paidAt: new Date(2026, 1, 3), totalAmount: 200 },
      { paidAt: new Date(2026, 1, 3), totalAmount: 50 },
    ])

    const body = await callGET({ year: "2026", month: "2" })

    expect(body.paymentsByDay).toHaveLength(28) // February 2026
    expect(body.paymentsByDay[0].cumulative).toBe(100) // day 1
    expect(body.paymentsByDay[1].cumulative).toBe(100) // day 2 (no payment)
    expect(body.paymentsByDay[2].cumulative).toBe(350) // day 3 (100+200+50)
    expect(body.paymentsByDay[27].cumulative).toBe(350) // last day keeps cumulative
  })

  // 11. Defaults year to current year when not provided
  it("defaults year to current year when not provided", async () => {
    const body = await callGET()

    expect(body.year).toBe(new Date().getFullYear())
  })

  // 12. Uses professionalProfileId scope for non-admin users
  it("scopes queries by professionalProfileId for non-admin users", async () => {
    await callGET({ year: "2026" }, mockProfessional)

    // First findMany call (main invoices)
    const invoiceWhere = mockInvoiceFindMany.mock.calls[0][0].where
    expect(invoiceWhere.clinicId).toBe("clinic-1")
    expect(invoiceWhere.professionalProfileId).toBe("prof-2")

    // sessionCredit.count call
    const creditWhere = mockSessionCreditCount.mock.calls[0][0].where
    expect(creditWhere.clinicId).toBe("clinic-1")
    expect(creditWhere.professionalProfileId).toBe("prof-2")
  })

  it("does not scope by professionalProfileId for admin users", async () => {
    await callGET({ year: "2026" }, mockAdmin)

    const invoiceWhere = mockInvoiceFindMany.mock.calls[0][0].where
    expect(invoiceWhere.clinicId).toBe("clinic-1")
    expect(invoiceWhere.professionalProfileId).toBeUndefined()
  })

  // 13. Returns availableCredits count
  it("returns availableCredits from sessionCredit count", async () => {
    mockSessionCreditCount.mockResolvedValueOnce(7)

    const body = await callGET({ year: "2026" })

    expect(body.availableCredits).toBe(7)
    const creditWhere = mockSessionCreditCount.mock.calls[0][0].where
    expect(creditWhere.consumedByInvoiceId).toBeNull()
  })

  // 14. Handles Decimal totalAmount (coerces to number via Number())
  it("handles Decimal-like totalAmount by coercing via Number()", async () => {
    // Prisma Decimal objects have toString/valueOf, and Number() coerces them
    const decimalLike = {
      toString: () => "350.50",
      valueOf: () => 350.5,
      [Symbol.toPrimitive]: () => 350.5,
    }
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({ totalAmount: decimalLike, status: "PAGO" }),
    ])

    const body = await callGET({ year: "2026" })

    expect(body.totalFaturado).toBe(350.5)
    expect(body.totalPago).toBe(350.5)
  })

  // 15. Counts sessions, credits, extras
  it("sums sessions, credits, and extras across invoices", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([
      makeInvoice({ totalSessions: 4, creditsApplied: 1, extrasAdded: 2, status: "PAGO", totalAmount: 100 }),
      makeInvoice({ totalSessions: 8, creditsApplied: 3, extrasAdded: 0, status: "PENDENTE", totalAmount: 200 }),
      makeInvoice({ totalSessions: 2, creditsApplied: 0, extrasAdded: 1, status: "ENVIADO", totalAmount: 50 }),
    ])

    const body = await callGET({ year: "2026" })

    expect(body.totalSessions).toBe(14)
    expect(body.totalCredits).toBe(4)
    expect(body.totalExtras).toBe(3)
  })

  // Extra: paymentsByDay scopes by professionalProfileId for non-admin
  it("scopes paymentsByDay query by professionalProfileId for non-admin", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([]) // main invoices
    mockInvoiceFindMany.mockResolvedValueOnce([]) // paid invoices

    await callGET({ year: "2026", month: "3" }, mockProfessional)

    // Second findMany call is the paymentsByDay query
    const paidWhere = mockInvoiceFindMany.mock.calls[1][0].where
    expect(paidWhere.professionalProfileId).toBe("prof-2")
    expect(paidWhere.status).toEqual({ not: "CANCELADO" })
  })

  // Extra: paymentsByDay skips invoices with null paidAt
  it("paymentsByDay skips invoices with null paidAt", async () => {
    mockInvoiceFindMany.mockResolvedValueOnce([])
    mockInvoiceFindMany.mockResolvedValueOnce([
      { paidAt: null, totalAmount: 999 },
      { paidAt: new Date(2026, 0, 15), totalAmount: 100 },
    ])

    const body = await callGET({ year: "2026", month: "1" })

    const totalAmount = body.paymentsByDay.reduce(
      (sum: number, d: { amount: number }) => sum + d.amount,
      0
    )
    expect(totalAmount).toBe(100)
  })
})
