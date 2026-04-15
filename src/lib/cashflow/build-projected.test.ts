import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildProjected } from "./build-projected"

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findMany: vi.fn() },
    patient: { findMany: vi.fn() },
    professionalProfile: { findMany: vi.fn() },
    clinic: { findUnique: vi.fn() },
    nfseConfig: { findFirst: vi.fn() },
    expenseRecurrence: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    repassePayment: { findMany: vi.fn() },
    invoice: { findMany: vi.fn(), aggregate: vi.fn() },
    invoiceItem: { findMany: vi.fn() },
    bankTransaction: { findMany: vi.fn(), aggregate: vi.fn() },
  },
}))

// Mock buildRealized (it's called internally)
vi.mock("./build-realized", () => ({
  buildRealized: vi.fn(),
}))

// Mock generateExpensesFromRecurrence
vi.mock("@/lib/expenses", () => ({
  generateExpensesFromRecurrence: vi.fn(),
}))

import { prisma } from "@/lib/prisma"
import { buildRealized } from "./build-realized"
import { generateExpensesFromRecurrence } from "@/lib/expenses"

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const mockBuildRealized = buildRealized as ReturnType<typeof vi.fn>
const mockGenExpenses = generateExpensesFromRecurrence as ReturnType<typeof vi.fn>

const clinicId = "clinic-1"
const startDate = new Date("2026-04-01")
const endDate = new Date("2026-04-30")
const localStartDate = new Date(2026, 3, 1)
const localEndDate = new Date(2026, 3, 30)

function baseParams() {
  return {
    clinicId,
    startDate,
    endDate,
    localStartDate,
    localEndDate,
    selectedMonth: 4,
    selectedYear: 2026,
    interBalance: null as number | null,
    balanceFetchedAt: null as Date | null,
  }
}

/**
 * Set up all mocks with default (empty) return values.
 * Uses mockResolvedValue (sticky default) so individual tests can layer
 * mockResolvedValueOnce on top for specific calls.
 */
function setupDefaultMocks() {
  mockBuildRealized.mockResolvedValue({
    invoicesForCF: [], expensesForCF: [],
    startingBalance: 0, balanceSource: "computed",
  })

  // The function calls two appointment.findMany: scheduled + historical
  mockPrisma.appointment.findMany.mockResolvedValue([])
  mockPrisma.patient.findMany.mockResolvedValue([])
  mockPrisma.professionalProfile.findMany.mockResolvedValue([])
  mockPrisma.clinic.findUnique.mockResolvedValue({ taxPercentage: 0 })
  mockPrisma.nfseConfig.findFirst.mockResolvedValue(null)
  mockPrisma.expenseRecurrence.findMany.mockResolvedValue([])
  mockPrisma.expense.findMany.mockResolvedValue([])
  mockPrisma.repassePayment.findMany.mockResolvedValue([])
  mockPrisma.invoice.findMany.mockResolvedValue([])
  mockPrisma.invoiceItem.findMany.mockResolvedValue([])
  mockGenExpenses.mockReturnValue([])

  // Tax estimate makes 2-3 invoice.aggregate calls
  mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } })
}

describe("buildProjected", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupDefaultMocks()
  })

  it("returns the correct result shape with empty data", async () => {
    const result = await buildProjected(baseParams())

    expect(result).toHaveProperty("invoicesForCF")
    expect(result).toHaveProperty("expensesForCF")
    expect(result).toHaveProperty("revenueProjectionData")
    expect(result).toHaveProperty("taxEstimateData")
    expect(result).toHaveProperty("totalUnpaidRepasse")
    expect(result).toHaveProperty("revenueReceived")
    expect(result).toHaveProperty("revenueProjected")
    expect(result).toHaveProperty("expensesPaid")
    expect(result).toHaveProperty("expensesProjected")
    expect(result).toHaveProperty("startingBalance")
    expect(result).toHaveProperty("balanceSource")
    expect(Array.isArray(result.invoicesForCF)).toBe(true)
    expect(Array.isArray(result.expensesForCF)).toBe(true)
  })

  it("passes through startingBalance and balanceSource from buildRealized", async () => {
    mockBuildRealized.mockResolvedValue({
      invoicesForCF: [], expensesForCF: [],
      startingBalance: 42000, balanceSource: "inter",
    })

    const result = await buildProjected(baseParams())

    expect(result.startingBalance).toBe(42000)
    expect(result.balanceSource).toBe("inter")
  })

  it("creates invoice entries from existing paid invoices", async () => {
    const paidAt = new Date("2026-04-05")
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1", totalAmount: 800, dueDate: new Date("2026-04-10"),
        paidAt, status: "PAGO", patientId: "pat-1",
        referenceMonth: 4, referenceYear: 2026,
        patient: { name: "Maria" },
      },
    ])

    const result = await buildProjected(baseParams())

    const realEntry = result.invoicesForCF.find((i: { id: string }) => i.id === "inv-1")
    expect(realEntry).toBeDefined()
    expect(realEntry!.totalAmount).toBe(800)
    expect(realEntry!.paidAt).toEqual(paidAt)
    expect(realEntry!.patientName).toBe("Maria")
  })

  it("creates synthetic entries for appointments not covered by invoices", async () => {
    // Use a different referenceMonth so hasInvoicesForMonth is false and no invoiceItem query
    mockPrisma.appointment.findMany
      .mockResolvedValueOnce([
        {
          id: "apt-1", scheduledAt: new Date("2026-04-15"), price: 200, type: "CONSULTA",
          status: "AGENDADO", patientId: "pat-1", professionalProfileId: "prof-1",
          attendingProfessionalId: null, groupId: null, sessionGroupId: null,
        },
      ])
      .mockResolvedValueOnce([]) // historical appointments

    const result = await buildProjected(baseParams())

    const synthetic = result.invoicesForCF.find((i: { id: string }) => i.id === "apt-apt-1")
    expect(synthetic).toBeDefined()
    expect(synthetic!.paidAt).toBeNull()
    expect(synthetic!.status).toBe("PROJECTED")
    expect(synthetic!.patientName).toBe("Sessão")
  })

  it("skips synthetic entries for appointments already covered by invoices", async () => {
    // Invoice covers pat-1 for April 2026
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1", totalAmount: 800, dueDate: new Date("2026-04-20"),
        paidAt: null, status: "PENDENTE", patientId: "pat-1",
        referenceMonth: 4, referenceYear: 2026,
        patient: { name: "Maria" },
      },
    ])
    // Appointment for same patient in same month
    mockPrisma.appointment.findMany
      .mockResolvedValueOnce([
        {
          id: "apt-1", scheduledAt: new Date("2026-04-15"), price: 200, type: "CONSULTA",
          status: "AGENDADO", patientId: "pat-1", professionalProfileId: "prof-1",
          attendingProfessionalId: null, groupId: null, sessionGroupId: null,
        },
      ])
      .mockResolvedValueOnce([]) // historical

    const result = await buildProjected(baseParams())

    // Should have the real invoice, no synthetic for apt-1
    expect(result.invoicesForCF.find((i: { id: string }) => i.id === "inv-1")).toBeDefined()
    expect(result.invoicesForCF.find((i: { id: string }) => i.id === "apt-apt-1")).toBeUndefined()
  })

  it("uses patient sessionFee when appointment has no price", async () => {
    mockPrisma.appointment.findMany
      .mockResolvedValueOnce([
        {
          id: "apt-noprice", scheduledAt: new Date("2026-04-10"), price: null,
          type: "CONSULTA", status: "CONFIRMADO", patientId: "pat-2",
          professionalProfileId: "prof-1", attendingProfessionalId: null,
          groupId: null, sessionGroupId: null,
        },
      ])
      .mockResolvedValueOnce([]) // historical
    mockPrisma.patient.findMany.mockResolvedValue([
      { id: "pat-2", sessionFee: 350 },
    ])

    const result = await buildProjected(baseParams())

    const synthetic = result.invoicesForCF.find((i: { id: string }) => i.id === "apt-apt-noprice")
    expect(synthetic).toBeDefined()
    // 350 * (1 - 0 cancellation rate) = 350
    expect(synthetic!.totalAmount).toBe(350)
  })

  it("applies cancellation rate to synthetic appointment entries", async () => {
    mockPrisma.appointment.findMany
      .mockResolvedValueOnce([
        {
          id: "apt-cr", scheduledAt: new Date("2026-04-10"), price: 1000,
          type: "CONSULTA", status: "AGENDADO", patientId: "pat-1",
          professionalProfileId: "prof-1", attendingProfessionalId: null,
          groupId: null, sessionGroupId: null,
        },
      ])
      .mockResolvedValueOnce([
        // 10 total consultas, 2 cancelled = 20% cancellation rate
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "FINALIZADO", type: "CONSULTA" },
        { status: "CANCELADO_FALTA", type: "CONSULTA" },
        { status: "CANCELADO_ACORDADO", type: "CONSULTA" },
      ])

    const result = await buildProjected(baseParams())

    const synthetic = result.invoicesForCF.find((i: { id: string }) => i.id === "apt-apt-cr")
    expect(synthetic).toBeDefined()
    // 1000 * (1 - 0.2) = 800
    expect(synthetic!.totalAmount).toBe(800)
  })

  it("maps open/overdue expenses to ExpenseForCashFlow", async () => {
    const dueDate = new Date("2026-04-15")
    // First call: open expenses in Promise.all; second call: paid expenses
    mockPrisma.expense.findMany
      .mockResolvedValueOnce([
        { id: "exp-1", description: "Aluguel", amount: 5000, dueDate, paidAt: null, status: "OPEN", recurrenceId: null },
      ])
      .mockResolvedValueOnce([]) // paid expenses

    const result = await buildProjected(baseParams())

    const expense = result.expensesForCF.find((e: { id: string }) => e.id === "exp-1")
    expect(expense).toBeDefined()
    expect(expense!.amount).toBe(5000)
    expect(expense!.description).toBe("Aluguel")
    expect(expense!.status).toBe("OPEN")
  })

  it("includes paid expenses in the date range", async () => {
    const paidAt = new Date("2026-04-03")
    mockPrisma.expense.findMany
      .mockResolvedValueOnce([]) // open expenses
      .mockResolvedValueOnce([
        { id: "exp-paid", description: "Energia", amount: 800, dueDate: new Date("2026-04-05"), paidAt, status: "PAID", recurrenceId: null },
      ])

    const result = await buildProjected(baseParams())

    const expense = result.expensesForCF.find((e: { id: string }) => e.id === "exp-paid")
    expect(expense).toBeDefined()
    expect(expense!.amount).toBe(800)
    expect(expense!.paidAt).toEqual(paidAt)
  })

  it("projects recurring expenses that dont already exist", async () => {
    mockPrisma.expenseRecurrence.findMany.mockResolvedValue([
      { id: "rec-1", amount: 200, active: true },
    ])

    mockGenExpenses.mockReturnValue([
      { description: "Internet", amount: 200, dueDate: new Date(2026, 3, 10) },
    ])

    const result = await buildProjected(baseParams())

    const recExpenses = result.expensesForCF.filter((e: { id: string }) => e.id.startsWith("rec-"))
    expect(recExpenses).toHaveLength(1)
    expect(recExpenses[0].status).toBe("PROJECTED")
    expect(recExpenses[0].description).toContain("(recorrente)")
  })

  it("skips recurring expense projections that already exist as real expenses", async () => {
    const existingDueDate = new Date("2026-04-10")
    mockPrisma.expenseRecurrence.findMany.mockResolvedValue([
      { id: "rec-1", amount: 200, active: true },
    ])
    // The existing expense has recurrenceId matching rec-1 and same date
    mockPrisma.expense.findMany
      .mockResolvedValueOnce([
        { id: "exp-existing", description: "Internet", amount: 200, dueDate: existingDueDate, paidAt: null, status: "OPEN", recurrenceId: "rec-1" },
      ])
      .mockResolvedValueOnce([]) // paid expenses

    // generateExpensesFromRecurrence returns an expense for the same date
    mockGenExpenses.mockReturnValue([
      { description: "Internet", amount: 200, dueDate: existingDueDate },
    ])

    const result = await buildProjected(baseParams())

    // Should have the existing expense but NOT a projected duplicate
    const recExpenses = result.expensesForCF.filter((e: { id: string }) => e.id.startsWith("rec-"))
    expect(recExpenses).toHaveLength(0)
    expect(result.expensesForCF.find((e: { id: string }) => e.id === "exp-existing")).toBeDefined()
  })

  it("computes revenueReceived and revenueProjected split metrics", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-paid", totalAmount: 1000, dueDate: new Date("2026-04-05"),
        paidAt: new Date("2026-04-05"), status: "PAGO", patientId: "pat-1",
        referenceMonth: 4, referenceYear: 2026,
        patient: { name: "Ana" },
      },
      {
        id: "inv-unpaid", totalAmount: 500, dueDate: new Date("2026-04-20"),
        paidAt: null, status: "PENDENTE", patientId: "pat-2",
        referenceMonth: 4, referenceYear: 2026,
        patient: { name: "Bruno" },
      },
    ])

    const result = await buildProjected(baseParams())

    expect(result.revenueReceived).toBe(1000)
    expect(result.revenueProjected).toBe(500)
  })

  it("computes expensesPaid and expensesProjected excluding tax and repasse", async () => {
    const paidAt = new Date("2026-04-03")
    mockPrisma.expense.findMany
      .mockResolvedValueOnce([
        { id: "exp-open", description: "Energia", amount: 400, dueDate: new Date("2026-04-20"), paidAt: null, status: "OPEN", recurrenceId: null },
      ])
      .mockResolvedValueOnce([
        { id: "exp-paid", description: "Aluguel", amount: 3000, dueDate: new Date("2026-04-01"), paidAt, status: "PAID", recurrenceId: null },
      ])

    const result = await buildProjected(baseParams())

    expect(result.expensesPaid).toBe(3000)
    expect(result.expensesProjected).toBe(400)
  })

  it("adds repasse expenses from invoice items when invoices exist for the month", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1", totalAmount: 2000, dueDate: new Date("2026-04-15"),
        paidAt: null, status: "PENDENTE", patientId: "pat-1",
        referenceMonth: 4, referenceYear: 2026,
        patient: { name: "Test" },
      },
    ])
    mockPrisma.professionalProfile.findMany.mockResolvedValue([
      { id: "prof-1", repassePercentage: 40 },
    ])
    mockPrisma.repassePayment.findMany.mockResolvedValue([])
    mockPrisma.invoiceItem.findMany.mockResolvedValue([
      { total: 2000, attendingProfessionalId: "prof-1", invoice: { professionalProfileId: "prof-1" } },
    ])
    mockPrisma.clinic.findUnique.mockResolvedValue({ taxPercentage: 10 })

    const result = await buildProjected(baseParams())

    // repasse = 2000 * (1 - 0.10) * 0.40 = 720
    expect(result.totalUnpaidRepasse).toBe(720)
    const repasseExpense = result.expensesForCF.find((e: { id: string }) => e.id === "repasse-prof-1")
    expect(repasseExpense).toBeDefined()
    expect(repasseExpense!.amount).toBe(720)
    expect(repasseExpense!.description).toBe("Repasse profissional")
  })

  it("skips repasse for professionals already paid", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1", totalAmount: 2000, dueDate: new Date("2026-04-15"),
        paidAt: null, status: "PENDENTE", patientId: "pat-1",
        referenceMonth: 4, referenceYear: 2026,
        patient: { name: "Test" },
      },
    ])
    mockPrisma.professionalProfile.findMany.mockResolvedValue([
      { id: "prof-1", repassePercentage: 40 },
    ])
    mockPrisma.repassePayment.findMany.mockResolvedValue([
      { professionalProfileId: "prof-1" },
    ])
    mockPrisma.invoiceItem.findMany.mockResolvedValue([
      { total: 2000, attendingProfessionalId: "prof-1", invoice: { professionalProfileId: "prof-1" } },
    ])

    const result = await buildProjected(baseParams())

    expect(result.totalUnpaidRepasse).toBe(0)
    expect(result.expensesForCF.find((e: { id: string }) => e.id === "repasse-prof-1")).toBeUndefined()
  })

  it("uses appointment-based repasse estimate when no invoices exist for month", async () => {
    // No invoices (default mock returns [])
    mockPrisma.appointment.findMany
      .mockResolvedValueOnce([
        {
          id: "apt-1", scheduledAt: new Date("2026-04-10"), price: 1000,
          type: "CONSULTA", status: "AGENDADO", patientId: "pat-1",
          professionalProfileId: "prof-1", attendingProfessionalId: null,
          groupId: null, sessionGroupId: null,
        },
      ])
      .mockResolvedValueOnce([]) // historical
    mockPrisma.professionalProfile.findMany.mockResolvedValue([
      { id: "prof-1", repassePercentage: 50 },
    ])

    const result = await buildProjected(baseParams())

    // With 0% tax, 0% cancellation, 50% repasse: 1000 * 1.0 * 0.5 = 500
    expect(result.totalUnpaidRepasse).toBe(500)
    const repasseExpense = result.expensesForCF.find((e: { id: string }) => e.id === "repasse-prof-1")
    expect(repasseExpense).toBeDefined()
    expect(repasseExpense!.description).toContain("estimado")
  })

  it("adds monthly tax expense when tax estimate is positive", async () => {
    // Lucro Presumido regime with ISS at 5%
    mockPrisma.nfseConfig.findFirst.mockResolvedValue({
      regimeTributario: "3",
      aliquotaIss: 5,
    })
    // Prev month revenue for tax base
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 10000 } })

    const result = await buildProjected(baseParams())

    const monthlyTax = result.expensesForCF.find((e: { id: string }) => e.id === "projected-tax-monthly")
    expect(monthlyTax).toBeDefined()
    expect(monthlyTax!.amount).toBeGreaterThan(0)
    expect(monthlyTax!.status).toBe("PROJECTED")
    expect(result.taxEstimateData.monthlyTotal).toBeGreaterThan(0)
  })

  it("uses paidAt as dueDate for invoice entries when paid", async () => {
    const paidAt = new Date("2026-04-03")
    const dueDate = new Date("2026-04-20")
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: "inv-early", totalAmount: 500, dueDate, paidAt,
        status: "PAGO", patientId: "pat-1",
        referenceMonth: 4, referenceYear: 2026,
        patient: { name: "Test" },
      },
    ])

    const result = await buildProjected(baseParams())

    const entry = result.invoicesForCF.find((i: { id: string }) => i.id === "inv-early")
    expect(entry).toBeDefined()
    // build-projected uses: inv.paidAt ?? inv.dueDate
    expect(entry!.dueDate).toEqual(paidAt)
  })

  it("returns zero metrics when all data is empty", async () => {
    const result = await buildProjected(baseParams())

    expect(result.revenueReceived).toBe(0)
    expect(result.revenueProjected).toBe(0)
    expect(result.expensesPaid).toBe(0)
    expect(result.expensesProjected).toBe(0)
    expect(result.totalUnpaidRepasse).toBe(0)
    expect(result.invoicesForCF).toHaveLength(0)
    expect(result.expensesForCF).toHaveLength(0)
  })
})
