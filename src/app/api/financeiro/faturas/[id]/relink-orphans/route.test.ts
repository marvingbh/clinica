import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api", () => ({
  withFeatureAuth: (_config: unknown, handler: Function) => handler,
}))

const mockInvoiceFindFirst = vi.fn()
const mockAppointmentFindMany = vi.fn()
const mockInvoiceItemUpdate = vi.fn()
const mockTransaction = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findFirst: (...a: unknown[]) => mockInvoiceFindFirst(...a) },
    appointment: { findMany: (...a: unknown[]) => mockAppointmentFindMany(...a) },
    invoiceItem: { update: (...a: unknown[]) => mockInvoiceItemUpdate(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}))

import { POST } from "./route"

const mockUser = {
  id: "user-1",
  clinicId: "clinic-1",
  role: "ADMIN" as const,
  professionalProfileId: "prof-1",
  permissions: { finances: "WRITE" },
}

function makeReq() {
  return new NextRequest(new URL("http://localhost/api/financeiro/faturas/inv-1/relink-orphans"), {
    method: "POST",
  })
}

async function callPOST(params: { id: string } = { id: "inv-1" }) {
  const handler = POST as unknown as (
    req: NextRequest,
    ctx: { user: typeof mockUser },
    params: { id: string },
  ) => Promise<Response>
  return handler(makeReq(), { user: mockUser }, params)
}

function makeInvoice(items: Array<{ id: string; type: string; createdAt: Date }>) {
  return {
    id: "inv-1",
    patientId: "patient-1",
    referenceMonth: 5,
    referenceYear: 2026,
    items,
  }
}

function makeAppt(overrides: {
  id: string
  scheduledAt: Date
  type?: string
  status?: string
  groupId?: string | null
  sessionGroupId?: string | null
  recurrenceId?: string | null
  attendingProfessionalId?: string | null
}) {
  return {
    type: "CONSULTA",
    status: "AGENDADO",
    groupId: null,
    sessionGroupId: null,
    recurrenceId: null,
    attendingProfessionalId: null,
    ...overrides,
  }
}

describe("POST /api/financeiro/faturas/[id]/relink-orphans", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoiceFindFirst.mockResolvedValue(null)
    mockAppointmentFindMany.mockResolvedValue([])
    mockTransaction.mockImplementation((ops) => Promise.all(ops))
  })

  it("returns 404 when invoice does not exist or is in another clinic", async () => {
    mockInvoiceFindFirst.mockResolvedValue(null)
    const res = await callPOST()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Fatura não encontrada" })
    expect(mockAppointmentFindMany).not.toHaveBeenCalled()
  })

  it("reports zero relinked when the invoice has no orphan items", async () => {
    mockInvoiceFindFirst.mockResolvedValue(makeInvoice([]))
    const res = await callPOST()
    expect(await res.json()).toEqual({ relinked: 0, message: "Nenhum item órfão na fatura" })
    expect(mockAppointmentFindMany).not.toHaveBeenCalled()
  })

  it("links a SESSAO_REGULAR orphan to an unlinked individual CONSULTA in the same month", async () => {
    mockInvoiceFindFirst.mockResolvedValue(
      makeInvoice([
        { id: "item-1", type: "SESSAO_REGULAR", createdAt: new Date("2026-05-02") },
      ]),
    )
    mockAppointmentFindMany.mockResolvedValue([
      makeAppt({
        id: "apt-X",
        scheduledAt: new Date("2026-05-15T17:00:00"),
        attendingProfessionalId: "prof-X",
      }),
    ])

    const res = await callPOST()
    const body = await res.json()

    expect(body).toEqual({ relinked: 1, orphansRemaining: 0 })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it("never links a SESSAO_REGULAR orphan to a group appointment", async () => {
    mockInvoiceFindFirst.mockResolvedValue(
      makeInvoice([
        { id: "item-1", type: "SESSAO_REGULAR", createdAt: new Date("2026-05-02") },
      ]),
    )
    mockAppointmentFindMany.mockResolvedValue([
      makeAppt({
        id: "apt-group",
        scheduledAt: new Date("2026-05-15T17:00:00"),
        groupId: "group-1",
      }),
    ])

    const res = await callPOST()
    expect(await res.json()).toEqual({
      relinked: 0,
      message: "Nenhum agendamento elegível encontrado para vincular",
    })
  })

  it("links a SESSAO_GRUPO orphan only to a CONSULTA with a group/sessionGroup", async () => {
    mockInvoiceFindFirst.mockResolvedValue(
      makeInvoice([
        { id: "item-1", type: "SESSAO_GRUPO", createdAt: new Date("2026-05-02") },
      ]),
    )
    mockAppointmentFindMany.mockResolvedValue([
      // Plain CONSULTA — must be skipped
      makeAppt({ id: "apt-plain", scheduledAt: new Date("2026-05-10T17:00:00") }),
      // Group session — should match
      makeAppt({
        id: "apt-grp",
        scheduledAt: new Date("2026-05-15T17:00:00"),
        sessionGroupId: "sg-1",
      }),
    ])

    const res = await callPOST()
    expect(await res.json()).toEqual({ relinked: 1, orphansRemaining: 0 })
  })

  it("links a REUNIAO_ESCOLA orphan only to a REUNIAO appointment", async () => {
    mockInvoiceFindFirst.mockResolvedValue(
      makeInvoice([
        { id: "item-1", type: "REUNIAO_ESCOLA", createdAt: new Date("2026-05-02") },
      ]),
    )
    mockAppointmentFindMany.mockResolvedValue([
      // A CONSULTA isn't a school meeting — skip
      makeAppt({ id: "apt-consulta", scheduledAt: new Date("2026-05-10T17:00:00") }),
      // A REUNIAO — match
      makeAppt({ id: "apt-reuniao", scheduledAt: new Date("2026-05-15T17:00:00"), type: "REUNIAO" }),
    ])

    const res = await callPOST()
    expect(await res.json()).toEqual({ relinked: 1, orphansRemaining: 0 })
  })

  it("excludes CREDITO items from the orphan set at the query layer", async () => {
    mockInvoiceFindFirst.mockResolvedValue(makeInvoice([]))
    await callPOST()
    const args = mockInvoiceFindFirst.mock.calls[0][0]
    expect(args.select.items.where).toEqual({
      appointmentId: null,
      type: { not: "CREDITO" },
    })
  })

  it("scopes appointment candidates to the invoice's reference month and excludes already-linked apts", async () => {
    mockInvoiceFindFirst.mockResolvedValue(
      makeInvoice([
        { id: "item-1", type: "SESSAO_REGULAR", createdAt: new Date("2026-05-02") },
      ]),
    )
    mockAppointmentFindMany.mockResolvedValue([])

    await callPOST()
    const args = mockAppointmentFindMany.mock.calls[0][0]
    expect(args.where).toMatchObject({
      clinicId: "clinic-1",
      patientId: "patient-1",
      scheduledAt: {
        gte: new Date(2026, 4, 1),
        lt: new Date(2026, 5, 1),
      },
      // unlinked-only
      invoiceItems: { none: {} },
    })
    expect(args.orderBy).toEqual({ scheduledAt: "asc" })
  })

  it("greedy-matches orphans in createdAt order, leaving extras as orphansRemaining", async () => {
    mockInvoiceFindFirst.mockResolvedValue(
      makeInvoice([
        { id: "older", type: "SESSAO_REGULAR", createdAt: new Date("2026-05-02T08:00:00") },
        { id: "newer", type: "SESSAO_REGULAR", createdAt: new Date("2026-05-02T08:00:00.500") },
        { id: "newest", type: "SESSAO_REGULAR", createdAt: new Date("2026-05-02T08:01:00") },
      ]),
    )
    // Only 2 candidates available
    mockAppointmentFindMany.mockResolvedValue([
      makeAppt({ id: "apt-A", scheduledAt: new Date("2026-05-12T17:00:00") }),
      makeAppt({ id: "apt-B", scheduledAt: new Date("2026-05-15T17:00:00") }),
    ])

    const res = await callPOST()
    const body = await res.json()
    expect(body.relinked).toBe(2)
    expect(body.orphansRemaining).toBe(1)
  })

  it("does not call $transaction when no candidate match is found", async () => {
    mockInvoiceFindFirst.mockResolvedValue(
      makeInvoice([
        { id: "item-1", type: "SESSAO_REGULAR", createdAt: new Date("2026-05-02") },
      ]),
    )
    mockAppointmentFindMany.mockResolvedValue([]) // empty pool

    const res = await callPOST()
    expect(await res.json()).toEqual({
      relinked: 0,
      message: "Nenhum agendamento elegível encontrado para vincular",
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
