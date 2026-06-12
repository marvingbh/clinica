import { collectPaymentEvents, type InvoiceWithPayments } from "./payment-events"
import { buildReciboRows, isExportable } from "./recibo-validation"
import { collectPendingIssues } from "./pending-issues"
import { aggregateDmed } from "./dmed-aggregation"
import { regimeAtDate } from "./fiscal-period"
import type {
  DmedReport,
  FiscalIssue,
  PatientFiscalData,
  PaymentEvent,
  ProfessionalFiscalData,
  ReciboRow,
} from "./types"

// Minimal Prisma client surface this helper needs — injected by the route so
// the module stays pure-ish and testable with a mock (mirrors the precedent of
// financeiro/repair-orphaned-invoice-items.ts). The domain functions above are
// fully pure; this file is the single orchestration seam touching Prisma.
//
// Method args are typed `any` so the concrete PrismaClient (with its complex
// generic delegate signatures) is structurally assignable; results are cast to
// the narrow record shapes via `select`, which the routes always pass.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FiscalPrismaClient {
  invoice: {
    findMany: (args: any) => Promise<any[]>
  }
  professionalProfile: {
    findMany: (args: any) => Promise<any[]>
  }
  bankTransaction?: {
    findMany: (args: any) => Promise<any[]>
  }
  reciboSaudeEmission: {
    findMany: (args: any) => Promise<any[]>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface DecimalLike {
  toString(): string
}
function toNum(d: DecimalLike | number | null | undefined): number {
  if (d == null) return 0
  return typeof d === "number" ? d : Number(d.toString())
}

interface InvoiceRecord {
  id: string
  patientId: string
  professionalProfileId: string
  status: string
  totalAmount: DecimalLike
  paidAt: Date | null
  patient: {
    id: string
    name: string
    cpf: string | null
    birthDate: Date | null
    billingCpf: string | null
    billingResponsibleName: string | null
  }
  reconciliationLinks: Array<{
    id: string
    amount: DecimalLike
    transaction: {
      date: Date
      refundLinksAsCredit: Array<{ amount: DecimalLike }>
    }
  }>
}

interface ProfessionalRecord {
  id: string
  cpf: string | null
  registrationNumber: string | null
  fiscalRegime: string | null
  fiscalRegimeSince: Date | null
  user: { name: string }
}

interface EmissionRecord {
  paymentKey: string
  status: string
  reciboNumero: string | null
  erro: string | null
  batchId: string
}

export interface PeriodFilter {
  clinicId: string
  from: Date
  to: Date
  /** When set, only this professional's invoices (PROFESSIONAL self-scope). */
  professionalProfileId?: string
}

export interface PaymentsResult {
  rows: ReciboRow[]
  /** paymentKey -> emission status snapshot (so the UI shows Exportado/Emitido/etc). */
  statusByKey: Map<string, EmissionRecord>
  issues: FiscalIssue[]
  professionals: Map<string, ProfessionalFiscalData>
}

/**
 * Loads invoices for the period (clinic-scoped, optionally professional-scoped),
 * derives payment events + recibo rows, and joins each row's emission status.
 * Also collects the pending issues (sem origem + blockers).
 */
export async function loadReciboData(
  prisma: FiscalPrismaClient,
  filter: PeriodFilter
): Promise<PaymentsResult> {
  const profWhere: Record<string, unknown> = { user: { clinicId: filter.clinicId } }
  if (filter.professionalProfileId) profWhere.id = filter.professionalProfileId

  const profRecords = (await prisma.professionalProfile.findMany({
    where: profWhere,
    select: {
      id: true,
      cpf: true,
      registrationNumber: true,
      fiscalRegime: true,
      fiscalRegimeSince: true,
      user: { select: { name: true } },
    },
  })) as ProfessionalRecord[]

  const professionals = new Map<string, ProfessionalFiscalData>()
  for (const p of profRecords) {
    professionals.set(p.id, {
      id: p.id,
      name: p.user.name,
      cpf: p.cpf,
      crp: p.registrationNumber,
      fiscalRegime: (p.fiscalRegime as ProfessionalFiscalData["fiscalRegime"]) ?? null,
      fiscalRegimeSince: p.fiscalRegimeSince,
    })
  }

  const invWhere: Record<string, unknown> = {
    clinicId: filter.clinicId,
    status: { in: ["PARCIAL", "PAGO"] },
    OR: [
      { paidAt: { gte: filter.from, lte: filter.to } },
      { reconciliationLinks: { some: { transaction: { date: { gte: filter.from, lte: filter.to } } } } },
    ],
  }
  if (filter.professionalProfileId) invWhere.professionalProfileId = filter.professionalProfileId

  const invoices = (await prisma.invoice.findMany({
    where: invWhere,
    select: {
      id: true,
      patientId: true,
      professionalProfileId: true,
      status: true,
      totalAmount: true,
      paidAt: true,
      patient: {
        select: {
          id: true,
          name: true,
          cpf: true,
          birthDate: true,
          billingCpf: true,
          billingResponsibleName: true,
        },
      },
      reconciliationLinks: {
        select: {
          id: true,
          amount: true,
          transaction: {
            select: { date: true, refundLinksAsCredit: { select: { amount: true } } },
          },
        },
      },
    },
  })) as InvoiceRecord[]

  const patients = new Map<string, PatientFiscalData>()
  const invoiceInputs: InvoiceWithPayments[] = []
  const partialWithoutLinks: { invoiceId: string; patientName: string; amount: number }[] = []

  for (const inv of invoices) {
    patients.set(inv.patient.id, {
      id: inv.patient.id,
      name: inv.patient.name,
      cpf: inv.patient.cpf,
      birthDate: inv.patient.birthDate,
      billingCpf: inv.patient.billingCpf,
      billingResponsibleName: inv.patient.billingResponsibleName,
    })

    const links = inv.reconciliationLinks
      .filter((l) => l.transaction.date >= filter.from && l.transaction.date <= filter.to)
      .map((l) => ({
        reconciliationLinkId: l.id,
        amount: toNum(l.amount),
        transactionDate: l.transaction.date,
        refundedAmount: l.transaction.refundLinksAsCredit.reduce((s, r) => s + toNum(r.amount), 0),
      }))

    if (inv.status === "PARCIAL" && links.length === 0) {
      partialWithoutLinks.push({
        invoiceId: inv.id,
        patientName: inv.patient.name,
        amount: toNum(inv.totalAmount),
      })
      continue
    }

    invoiceInputs.push({
      invoiceId: inv.id,
      patientId: inv.patientId,
      professionalProfileId: inv.professionalProfileId,
      status: inv.status,
      totalAmount: toNum(inv.totalAmount),
      paidAt: inv.paidAt,
      links,
    })
  }

  const events: PaymentEvent[] = collectPaymentEvents(invoiceInputs)
  const rows = buildReciboRows(events, patients, professionals)

  // Emission status per paymentKey.
  const emissions = (await prisma.reciboSaudeEmission.findMany({
    where: { clinicId: filter.clinicId, paymentKey: { in: rows.map((r) => r.paymentKey) } },
    select: { paymentKey: true, status: true, reciboNumero: true, erro: true, batchId: true },
  })) as EmissionRecord[]
  const statusByKey = new Map<string, EmissionRecord>()
  for (const e of emissions) statusByKey.set(e.paymentKey, e)

  const issues = collectPendingIssues(rows, [], partialWithoutLinks, patients)

  return { rows, statusByKey, issues, professionals }
}

/** Filters rows to those that can be exported (no blockers, not fully refunded). */
export function exportableRows(rows: ReciboRow[]): ReciboRow[] {
  return rows.filter(isExportable)
}

export interface DmedResult {
  report: DmedReport
  issues: FiscalIssue[]
}

/**
 * Loads the DMED conference report for a calendar year. Only rows whose owning
 * professional was effectively PJ at the payment date are aggregated; rows from
 * professionals in a different effective regime are dropped before aggregation.
 */
export async function loadDmedReport(
  prisma: FiscalPrismaClient,
  clinicId: string,
  year: number
): Promise<DmedResult> {
  const from = new Date(Date.UTC(year, 0, 1))
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))

  const { rows, issues, professionals } = await loadReciboData(prisma, { clinicId, from, to })

  const pjRows = rows.filter((row) => {
    const prof = professionals.get(row.professionalProfileId)
    if (!prof || !prof.fiscalRegime) return false
    const effective = row.paymentDate
      ? regimeAtDate(prof.fiscalRegime, prof.fiscalRegimeSince, row.paymentDate)
      : prof.fiscalRegime
    return effective === "PJ"
  })

  return { report: aggregateDmed(pjRows, year), issues }
}
