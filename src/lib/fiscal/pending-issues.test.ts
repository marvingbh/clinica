import { describe, it, expect } from "vitest"
import { collectPendingIssues } from "./pending-issues"
import type {
  PartialInvoiceInfo,
  PatientFiscalData,
  ReciboRow,
  UnallocatedCredit,
} from "./types"

function patientMap(): Map<string, PatientFiscalData> {
  return new Map([
    [
      "pat1",
      {
        id: "pat1",
        name: "Maria",
        cpf: null,
        birthDate: null,
        billingCpf: null,
        billingResponsibleName: null,
      },
    ],
  ])
}

function blockedRow(): ReciboRow {
  return {
    paymentKey: "recl:l1",
    invoiceId: "inv1",
    reconciliationLinkId: "l1",
    paymentDate: new Date("2025-06-01"),
    amount: 100,
    patientId: "pat1",
    professionalProfileId: "prof1",
    refundedAmount: 0,
    beneficiary: { cpf: null, name: "Maria", birthDate: null },
    payer: { cpf: null, name: "Maria", birthDate: null },
    professional: { id: "prof1", name: "Ana", cpf: null, crp: null, fiscalRegime: "PF", fiscalRegimeSince: null },
    blockers: ["BENEFICIARIO_SEM_CPF", "PAGADOR_SEM_CPF"],
    refundWarning: false,
    fullyRefunded: false,
  }
}

describe("collectPendingIssues", () => {
  it("emits SEM_ORIGEM for unallocated credits", () => {
    const credits: UnallocatedCredit[] = [
      { transactionId: "tx1", date: new Date("2025-05-01"), amount: 300, payerName: "Fulano" },
    ]
    const issues = collectPendingIssues([], credits, [], patientMap())
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: "SEM_ORIGEM", transactionId: "tx1", amount: 300 })
  })

  it("emits PARCIAL_SEM_DETALHE for partial invoices without links", () => {
    const partials: PartialInvoiceInfo[] = [{ invoiceId: "inv9", patientName: "Maria", amount: 80 }]
    const issues = collectPendingIssues([], [], partials, patientMap())
    expect(issues[0]).toMatchObject({ kind: "PARCIAL_SEM_DETALHE", invoiceId: "inv9" })
  })

  it("emits BLOQUEIO for rows with blockers and resolves the patient name", () => {
    const issues = collectPendingIssues([blockedRow()], [], [], patientMap())
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: "BLOQUEIO",
      paymentKey: "recl:l1",
      patientId: "pat1",
      patientName: "Maria",
    })
  })

  it("ignores rows without blockers", () => {
    const clean = { ...blockedRow(), blockers: [] as ReciboRow["blockers"] }
    expect(collectPendingIssues([clean], [], [], patientMap())).toHaveLength(0)
  })
})
