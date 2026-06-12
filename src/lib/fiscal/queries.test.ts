import { describe, it, expect, vi } from "vitest"
import { loadReciboData, type FiscalPrismaClient } from "./queries"

function profRecord() {
  return {
    id: "prof1",
    cpf: "11144477735",
    registrationNumber: "CRP06/1",
    fiscalRegime: "PF",
    fiscalRegimeSince: null,
    user: { name: "Ana" },
  }
}

/**
 * Builds a FiscalPrismaClient mock. `creditFindMany` lets a test capture the
 * `where` clause the sem-origem query is called with (or omit the delegate
 * entirely to simulate a narrow mock).
 */
function makeClient(opts: {
  credits?: Array<{ id: string; date: Date; amount: number; payerName: string | null }>
  creditFindMany?: ReturnType<typeof vi.fn>
  withBankDelegate?: boolean
}): FiscalPrismaClient {
  const client: FiscalPrismaClient = {
    professionalProfile: { findMany: vi.fn().mockResolvedValue([profRecord()]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    reciboSaudeEmission: { findMany: vi.fn().mockResolvedValue([]) },
  }
  if (opts.withBankDelegate ?? true) {
    client.bankTransaction = {
      findMany: opts.creditFindMany ?? vi.fn().mockResolvedValue(opts.credits ?? []),
    }
  }
  return client
}

const window = { from: new Date("2025-01-01"), to: new Date("2025-12-31") }

describe("loadReciboData — sem origem bucket", () => {
  it("surfaces unallocated bank credits as SEM_ORIGEM on the clinic-wide view", async () => {
    const client = makeClient({
      credits: [{ id: "tx1", date: new Date("2025-03-10"), amount: 250, payerName: "Fulano" }],
    })
    const { issues } = await loadReciboData(client, { clinicId: "c1", ...window })
    expect(issues).toEqual([
      expect.objectContaining({ kind: "SEM_ORIGEM", transactionId: "tx1", amount: 250, payerName: "Fulano" }),
    ])
  })

  it("does NOT query unallocated credits when professional self-scoped (no cross-professional leak)", async () => {
    const creditFindMany = vi.fn().mockResolvedValue([])
    const client = makeClient({ creditFindMany })
    const { issues } = await loadReciboData(client, {
      clinicId: "c1",
      professionalProfileId: "prof1",
      ...window,
    })
    expect(creditFindMany).not.toHaveBeenCalled()
    expect(issues.filter((i) => i.kind === "SEM_ORIGEM")).toHaveLength(0)
  })

  it("scopes the credit query to the clinic, period, undismissed, unreconciled, non-refund credits", async () => {
    const creditFindMany = vi.fn().mockResolvedValue([])
    const client = makeClient({ creditFindMany })
    await loadReciboData(client, { clinicId: "c1", ...window })
    expect(creditFindMany).toHaveBeenCalledTimes(1)
    const where = creditFindMany.mock.calls[0][0].where
    expect(where).toMatchObject({
      clinicId: "c1",
      type: "CREDIT",
      dismissReason: null,
      reconciliationLinks: { none: {} },
      refundLinksAsCredit: { none: {} },
    })
  })

  it("returns no SEM_ORIGEM issues when the client lacks the bankTransaction delegate", async () => {
    const client = makeClient({ withBankDelegate: false })
    const { issues } = await loadReciboData(client, { clinicId: "c1", ...window })
    expect(issues.filter((i) => i.kind === "SEM_ORIGEM")).toHaveLength(0)
  })
})
