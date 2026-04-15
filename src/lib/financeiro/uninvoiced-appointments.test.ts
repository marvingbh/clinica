import { describe, it, expect, vi } from "vitest"
import {
  fetchUninvoicedPriorAppointments,
  fetchUninvoicedPriorAppointmentsBulk,
} from "./uninvoiced-appointments"

function makeMockClient(result: unknown[] = []) {
  return {
    appointment: {
      findMany: vi.fn().mockResolvedValue(result),
    },
  }
}

// ---------------------------------------------------------------------------
// fetchUninvoicedPriorAppointments
// ---------------------------------------------------------------------------

describe("fetchUninvoicedPriorAppointments", () => {
  it("passes correct clinicId, patientId, and professionalProfileId", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointments(client, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      professionalProfileId: "prof-1",
      beforeDate: new Date("2026-04-01"),
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    expect(where.clinicId).toBe("clinic-1")
    expect(where.patientId).toBe("patient-1")
    expect(where.professionalProfileId).toBe("prof-1")
  })

  it("calculates lookback date as 1 month before beforeDate", async () => {
    const client = makeMockClient()
    const beforeDate = new Date("2026-04-01T00:00:00.000Z")
    await fetchUninvoicedPriorAppointments(client, {
      clinicId: "c",
      patientId: "p",
      professionalProfileId: "pp",
      beforeDate,
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    // setMonth subtracts 1 month from the beforeDate
    const expectedLookback = new Date("2026-04-01T00:00:00.000Z")
    expectedLookback.setMonth(expectedLookback.getMonth() - 1)
    expect(where.scheduledAt.gte).toEqual(expectedLookback)
    expect(where.scheduledAt.lt).toEqual(beforeDate)
  })

  it("handles lookback across year boundary (January -> December)", async () => {
    const client = makeMockClient()
    const beforeDate = new Date("2026-01-01T00:00:00.000Z")
    await fetchUninvoicedPriorAppointments(client, {
      clinicId: "c",
      patientId: "p",
      professionalProfileId: "pp",
      beforeDate,
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    const expectedLookback = new Date("2026-01-01T00:00:00.000Z")
    expectedLookback.setMonth(expectedLookback.getMonth() - 1)
    expect(where.scheduledAt.gte).toEqual(expectedLookback)
    expect(where.scheduledAt.gte.getFullYear()).toBe(2025)
    expect(where.scheduledAt.gte.getMonth()).toBe(11) // December = 11
    expect(where.scheduledAt.lt).toEqual(beforeDate)
  })

  it("filters to billable statuses only", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointments(client, {
      clinicId: "c",
      patientId: "p",
      professionalProfileId: "pp",
      beforeDate: new Date("2026-04-01"),
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    expect(where.status.in).toEqual(["AGENDADO", "CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA"])
  })

  it("filters to invoiceable appointment types only", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointments(client, {
      clinicId: "c",
      patientId: "p",
      professionalProfileId: "pp",
      beforeDate: new Date("2026-04-01"),
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    expect(where.type.in).toEqual(["CONSULTA", "REUNIAO"])
  })

  it("filters to appointments with no invoice items", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointments(client, {
      clinicId: "c",
      patientId: "p",
      professionalProfileId: "pp",
      beforeDate: new Date("2026-04-01"),
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    expect(where.invoiceItems).toEqual({ none: {} })
  })

  it("returns the result from findMany", async () => {
    const fakeAppts = [{ id: "appt-1" }, { id: "appt-2" }]
    const client = makeMockClient(fakeAppts)
    const result = await fetchUninvoicedPriorAppointments(client, {
      clinicId: "c",
      patientId: "p",
      professionalProfileId: "pp",
      beforeDate: new Date("2026-04-01"),
    })

    expect(result).toEqual(fakeAppts)
  })
})

// ---------------------------------------------------------------------------
// fetchUninvoicedPriorAppointmentsBulk
// ---------------------------------------------------------------------------

describe("fetchUninvoicedPriorAppointmentsBulk", () => {
  it("uses patientId { in: [...] } for multiple patients", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointmentsBulk(client, {
      clinicId: "c",
      patientIds: ["p1", "p2", "p3"],
      beforeDate: new Date("2026-04-01"),
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    expect(where.patientId).toEqual({ in: ["p1", "p2", "p3"] })
  })

  it("uses simple invoiceItems none filter when no targetMonth/Year", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointmentsBulk(client, {
      clinicId: "c",
      patientIds: ["p1"],
      beforeDate: new Date("2026-04-01"),
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    expect(where.invoiceItems).toEqual({ none: {} })
    expect(where.OR).toBeUndefined()
  })

  it("uses OR filter when targetMonth and targetYear are provided", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointmentsBulk(client, {
      clinicId: "c",
      patientIds: ["p1"],
      beforeDate: new Date("2026-04-01"),
      targetMonth: 3,
      targetYear: 2026,
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual([
      { invoiceItems: { none: {} } },
      {
        invoiceItems: {
          every: {
            invoice: {
              referenceMonth: 3,
              referenceYear: 2026,
              status: "PENDENTE",
            },
          },
        },
      },
    ])
  })

  it("selects patientId and professionalProfileId in addition to base fields", async () => {
    const client = makeMockClient()
    await fetchUninvoicedPriorAppointmentsBulk(client, {
      clinicId: "c",
      patientIds: ["p1"],
      beforeDate: new Date("2026-04-01"),
    })

    const select = client.appointment.findMany.mock.calls[0][0].select
    expect(select.patientId).toBe(true)
    expect(select.professionalProfileId).toBe(true)
    expect(select.id).toBe(true)
    expect(select.scheduledAt).toBe(true)
    expect(select.status).toBe(true)
  })

  it("calculates lookback date correctly for bulk queries", async () => {
    const client = makeMockClient()
    const beforeDate = new Date("2026-05-01T00:00:00.000Z")
    await fetchUninvoicedPriorAppointmentsBulk(client, {
      clinicId: "c",
      patientIds: ["p1"],
      beforeDate,
    })

    const where = client.appointment.findMany.mock.calls[0][0].where
    const expectedLookback = new Date("2026-05-01T00:00:00.000Z")
    expectedLookback.setMonth(expectedLookback.getMonth() - 1)
    expect(where.scheduledAt.gte).toEqual(expectedLookback)
    expect(where.scheduledAt.lt).toEqual(beforeDate)
  })
})
